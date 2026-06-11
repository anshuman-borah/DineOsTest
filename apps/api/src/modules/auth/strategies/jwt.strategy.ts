import { Injectable, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { User } from '../../users/entities/user.entity';
import { Branch } from '../../branches/entities/branch.entity';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { Subscription, SubscriptionStatus } from '../../subscriptions/entities/subscription.entity';
import { SessionService } from '../session.service';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  branchId?: string | null;
  role: string;
  permissions?: Record<string, any>;
  sessionId?: string;   // ← added for session revocation check
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly sessionService: SessionService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Branch) private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Subscription) private readonly subRepo: Repository<Subscription>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', 'secret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {

    // ── Session revocation check ──────────────────────────────────────────────
    // If sessionId is in the token, verify session still exists in Redis.
    // Logout deletes the Redis key → this returns 401 immediately
    // even if the JWT hasn't expired yet.
    if (payload.sessionId) {
      const alive = await this.sessionService.sessionExists(
        payload.sub,
        payload.sessionId,
      );
      if (!alive) {
        throw new UnauthorizedException('Session revoked — please log in again');
      }
    }

    // ── Tenant-ID header spoofing prevention ──────────────────────────────────
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    if (headerTenantId && headerTenantId !== payload.tenantId) {
      throw new UnauthorizedException('x-tenant-id header does not match token');
    }

    // Superadmin tokens have tenantId = 'superadmin' — skip DB user lookup
    if (payload.role === 'superadmin') {
      return { ...payload, id: payload.sub };
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub, tenantId: payload.tenantId, isActive: true },
    });
    if (!user) throw new UnauthorizedException('User not found or inactive');

    // ── Tenant suspension check ───────────────────────────────────────────────
    const tenant = await this.tenantRepo.findOne({
      where: { id: payload.tenantId },
      select: ['id', 'isActive'],
    });
    if (!tenant?.isActive) {
      throw new HttpException('Tenant account suspended', HttpStatus.PAYMENT_REQUIRED);
    }

    // ── Subscription status check ─────────────────────────────────────────────
    const sub = await this.subRepo.findOne({
      where: { tenantId: payload.tenantId },
      select: ['id', 'status'],
      order: { createdAt: 'DESC' },
    });
    if (sub?.status === SubscriptionStatus.CANCELLED) {
      throw new HttpException('Subscription cancelled', HttpStatus.PAYMENT_REQUIRED);
    }

    // ── Branch-ID header spoofing prevention ──────────────────────────────────
    const headerBranchId = req.headers['x-branch-id'] as string | undefined;
    if (headerBranchId && headerBranchId !== payload.branchId) {
      const branch = await this.branchRepo.findOne({
        where: { id: headerBranchId, tenantId: payload.tenantId, isActive: true },
        select: ['id'],
      });
      if (!branch) {
        throw new UnauthorizedException('x-branch-id does not belong to your tenant');
      }
      return { ...payload, id: payload.sub, branchId: headerBranchId };
    }

    return { ...payload, id: payload.sub };
  }
} //strategy