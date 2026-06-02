import {
  Controller, Post, Get, Delete, Body, Param,
  HttpCode, HttpStatus, SetMetadata, Req, Ip, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { LoginDto, RefreshTokenDto, RegisterTenantDto } from './dto/login.dto';
import { IS_PUBLIC_KEY, JwtAuthGuard } from './guards/jwt-auth.guard';
import { Request } from 'express';

// Auth-specific throttle limits (stricter than the global 200r/min default)
// These apply at the NestJS layer — a second line of defence behind nginx.
const AuthThrottle    = () => Throttle({ default: { ttl: 60_000, limit: 10  } }); // 10/min — login, forgot-password
const RegisterThrottle= () => Throttle({ default: { ttl: 60_000, limit: 5   } }); // 5/min  — register
const RefreshThrottle = () => Throttle({ default: { ttl: 60_000, limit: 30  } }); // 30/min — token refresh

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

class ForgotPasswordDto {
  @ApiProperty() @IsEmail() email: string;
}

class ResetPasswordDto {
  @ApiProperty() @IsUUID()    userId: string;
  @ApiProperty() @IsString()  token: string;
  @ApiProperty() @IsString() @MinLength(8) newPassword: string;
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Public()
  @RegisterThrottle()
  @Post('register')
  @ApiOperation({ summary: 'Register a new tenant (14-day trial)' })
  register(@Body() dto: RegisterTenantDto) {
    return this.authService.register(dto);
  }

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email/phone + password or PIN' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @RefreshThrottle()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @AuthThrottle()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string) {
    return this.authService.forgotPassword(dto.email, ip)
      .then(() => ({ message: 'If that email exists, a reset link has been sent' }))
      .catch(() => ({ message: 'If that email exists, a reset link has been sent' }));
  }

  @Public()
  @AuthThrottle()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from email' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.userId, dto.token, dto.newPassword)
      .then(() => ({ message: 'Password reset successfully. Please log in.' }));
  }

  // ── Session management (requires valid JWT) ───────────────────────────────

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user with fresh permissions' })
  getMe(@Req() req: Request) {
    // req.user is populated by JwtStrategy.validate() which fetches fresh data
    // from the DB on every request — so permissions are always up-to-date
    const { passwordHash, refreshToken, pin, ...safe } = (req as any).user as any;
    return safe;
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password' })
  changePassword(@Req() req: Request, @Body() dto: any) {
    const user = (req as any).user;
    return this.authService.changePassword(user.sub ?? user.id, dto.currentPassword, dto.newPassword)
      .then(() => ({ message: 'Password updated successfully' }));
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('sessions')
  @ApiOperation({ summary: 'List all active sessions for the current user' })
  listSessions(@Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.listSessions(user.sub ?? user.id);
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out all devices (revoke all sessions)' })
  revokeAllSessions(@Req() req: Request) {
    const user = (req as any).user;
    return this.sessionService.revokeAllSessions(user.sub ?? user.id)
      .then((count) => ({ message: `Signed out from ${count} device(s)`, count }));
  }

  @SkipThrottle()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out a specific device' })
  revokeSession(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const user = (req as any).user;
    return this.sessionService.revokeSession(user.sub ?? user.id, sessionId)
      .then(() => ({ message: 'Session revoked' }));
  }
}
