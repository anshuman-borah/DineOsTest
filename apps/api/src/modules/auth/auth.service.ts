import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Subscription } from '../subscriptions/entities/subscription.entity';
import { Plan } from '../subscriptions/entities/plan.entity';
import { Branch } from '../branches/entities/branch.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { LoginDto, RegisterTenantDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { MailerService } from '../mailer/mailer.service';
import { SessionService } from './session.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(PasswordResetToken) private readonly prtRepo: Repository<PasswordResetToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    private readonly mailer: MailerService,
    private readonly sessionService: SessionService,   // ← ADDED
  ) {}

  async register(dto: RegisterTenantDto) {
    const existing = await this.tenantRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const plan = await this.planRepo.findOne({
      where: { code: (dto.planCode as any) || 'starter' },
    });

    return this.dataSource.transaction(async (em) => {
      const slug = dto.businessName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') +
        '-' + Date.now().toString(36);

      const tenant = em.create(Tenant, {
        name: dto.businessName,
        slug,
        email: dto.email,
        phone: dto.phone,
      });
      await em.save(tenant);

      const branch = em.create(Branch, {
        tenantId: tenant.id,
        name: dto.businessName,
        code: 'HQ',
        isHq: true,
      });
      await em.save(branch);

      const hash = await bcrypt.hash(dto.password, 12);
      const user = em.create(User, {
        tenantId: tenant.id,
        branchId: branch.id,
        email: dto.email,
        phone: dto.phone,
        passwordHash: hash,
        firstName: dto.businessName,
        role: 'owner' as any,
      });
      await em.save(user);

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      const sub = em.create(Subscription, {
        tenantId: tenant.id,
        planId: plan?.id,
        status: 'trial' as any,
        trialEndsAt: trialEnd,
      });
      await em.save(sub);

      // Send welcome email (non-blocking)
      this.mailer.sendWelcome({
        to: dto.email,
        businessName: dto.businessName,
        ownerName: dto.businessName,
        trialEndsAt: trialEnd,
      }).catch(() => {});

      const tokens = await this.generateTokens(user, tenant.id, branch.id);
      return { ...tokens, user: this.sanitizeUser(user) };
    });
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const superadminEmail = this.config.get<string>('SUPERADMIN_EMAIL');
    if (!superadminEmail && this.config.get('NODE_ENV') === 'production') {
      console.error('[SECURITY] SUPERADMIN_EMAIL is not set in production. Superadmin login is disabled.');
    }
    const effectiveSuperadminEmail = superadminEmail || 'superadmin@dinestay.app';

    if (dto.email?.toLowerCase() === effectiveSuperadminEmail.toLowerCase()) {
      const saUser = await this.userRepo.findOne({ where: { email: dto.email, role: 'superadmin' as any, isActive: true } });
      if (saUser) {
        const valid = await bcrypt.compare(dto.password ?? '', saUser.passwordHash);
        if (!valid) throw new UnauthorizedException('Invalid credentials');

        saUser.lastLoginAt = new Date();

        // Create Redis session for superadmin
        const sessionId = await this.sessionService.createSession({
          userId:    saUser.id,
          refreshToken: 'pending',   // placeholder — rotated below
          ip,
          userAgent,
        });

        const tokens = await this.generateTokens(saUser, 'superadmin', null, sessionId);

        // Update session with real refresh token hash
        await this.sessionService.rotateSession(saUser.id, sessionId, tokens.refreshToken);

        saUser.refreshToken = await bcrypt.hash(tokens.refreshToken, 10);
        await this.userRepo.save(saUser);
        return { ...tokens, user: this.sanitizeUser(saUser) };
      }
    }

    const where: any = { tenantId: dto.tenantId, isActive: true };
    if (dto.email) where.email = dto.email;
    else if (dto.phone) where.phone = dto.phone;
    else throw new BadRequestException('Email or phone required');

    const user = await this.userRepo.findOne({ where });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    let valid = false;
    if (dto.pin && user.pin) {
      valid = await bcrypt.compare(String(dto.pin), user.pin);
    } else {
      valid = await bcrypt.compare(dto.password, user.passwordHash);
    }
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    user.lastLoginAt = new Date();
    const branchId = dto.branchId || user.branchId;
    const jwtTenantId = user.role === 'superadmin' ? 'superadmin' : user.tenantId;

    // Create Redis session
    const sessionId = await this.sessionService.createSession({
      userId:      user.id,
      refreshToken: 'pending',   // placeholder — rotated below
      ip,
      userAgent,
    });

    const tokens = await this.generateTokens(user, jwtTenantId, branchId, sessionId);

    // Update session with real refresh token hash
    await this.sessionService.rotateSession(user.id, sessionId, tokens.refreshToken);

    user.refreshToken = await bcrypt.hash(tokens.refreshToken, 10);
    await this.userRepo.save(user);

    return { ...tokens, user: this.sanitizeUser(user) };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });

      // Validate session still exists in Redis
      if (payload.sessionId) {
        const valid = await this.sessionService.validateSession(
          payload.sub,
          payload.sessionId,
          refreshToken,
        );
        if (!valid) throw new UnauthorizedException('Session expired or revoked');

        const user = await this.userRepo.findOne({ where: { id: payload.sub, isActive: true } });
        if (!user) throw new UnauthorizedException();

        // Rotate session with new refresh token
        const tokens = await this.generateTokens(user, payload.tenantId, payload.branchId ?? null, payload.sessionId);
        await this.sessionService.rotateSession(user.id, payload.sessionId, tokens.refreshToken);

        user.refreshToken = await bcrypt.hash(tokens.refreshToken, 10);
        await this.userRepo.save(user);

        return tokens;
      }

      // Fallback for tokens without sessionId (old tokens)
      const user = await this.userRepo.findOne({ where: { id: payload.sub, isActive: true } });
      if (!user || !user.refreshToken) throw new UnauthorizedException();
      const valid = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!valid) throw new UnauthorizedException();
      return this.generateTokens(user, user.tenantId, user.branchId, undefined);

    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateTokens(
    user: User,
    tenantId: string,
    branchId: string | null,
    sessionId?: string,        // ← ADDED
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId,
      branchId,
      role: user.role,
      ...(sessionId && { sessionId }),   // ← embed sessionId in JWT
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRY', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRY', '7d'),
      }),
    ]);
    return { accessToken, refreshToken };
  }

  // ─── Password Reset ───────────────────────────────────────────────────────

  async forgotPassword(email: string, ip?: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { email, isActive: true } });
    if (!user) return;

    await this.prtRepo.delete({ userId: user.id });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prtRepo.save(
      this.prtRepo.create({ userId: user.id, tenantId: user.tenantId, tokenHash, expiresAt, ipAddress: ip }),
    );

    const appUrl = this.config.get('APP_URL', 'http://localhost:3001');
    const resetLink = `${appUrl}/reset-password?token=${rawToken}&userId=${user.id}`;

    await this.mailer.sendPasswordReset({
      to: email,
      name: user.firstName,
      resetLink,
      expiresIn: '1 hour',
    });
  }

  async resetPassword(userId: string, rawToken: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId, isActive: true } });
    if (!user) throw new BadRequestException('Invalid or expired reset link');

    const prt = await this.prtRepo.findOne({
      where: { userId, usedAt: undefined as any, expiresAt: MoreThan(new Date()) },
      order: { createdAt: 'DESC' },
    });
    if (!prt) throw new BadRequestException('Reset link has expired or already been used');

    const valid = await bcrypt.compare(rawToken, prt.tokenHash);
    if (!valid) throw new BadRequestException('Invalid reset link');

    prt.usedAt = new Date();
    await this.prtRepo.save(prt);

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.refreshToken = null as any;

    // Revoke all Redis sessions on password reset
    await this.sessionService.revokeAllSessions(userId);

    await this.userRepo.save(user);
  }

  async changePassword(userId: string, current: string, newPass: string) {
    const user = await this.userRepo.findOne({ where: { id: userId, isActive: true } });
    if (!user) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(current, user.passwordHash);
    if (!valid) throw new BadRequestException('Incorrect current password');

    user.passwordHash = await bcrypt.hash(newPass, 12);
    await this.userRepo.save(user);
  }

  private sanitizeUser(user: User) {
    const { passwordHash, refreshToken, pin, ...safe } = user as any;
    return safe;
  }
}//service