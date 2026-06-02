/**
 * SessionService — manages per-device refresh-token sessions in Redis.
 *
 * Key schema:
 *   session:{userId}:{sessionId}  →  JSON { tokenHash, ip, ua, createdAt }
 *   TTL = JWT_REFRESH_EXPIRY (default 7d)
 *
 * This replaces the single `user.refreshToken` column for multi-device support.
 * The column is still written for backwards compatibility during the migration window.
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

export interface SessionMeta {
  sessionId: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt?: string;
}

const SESSION_TTL_S = 7 * 24 * 60 * 60; // 7 days (matches JWT_REFRESH_EXPIRY)

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private redis!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.redis = new Redis({
      host:     this.config.get('REDIS_HOST', 'localhost'),
      port:     this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
    });
    this.redis.on('error', (err) =>
      this.logger.warn(`Session Redis error: ${err.message}`),
    );
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  // ── Create a new session on login ────────────────────────────────────────

  async createSession(opts: {
    userId: string;
    refreshToken: string;
    ip?: string;
    userAgent?: string;
  }): Promise<string> {
    const sessionId = randomUUID();
    const tokenHash = await bcrypt.hash(opts.refreshToken, 10);

    const meta = {
      tokenHash,
      ip:        opts.ip       ?? 'unknown',
      userAgent: opts.userAgent ?? 'unknown',
      createdAt: new Date().toISOString(),
    };

    await this.redis.set(
      this._key(opts.userId, sessionId),
      JSON.stringify(meta),
      'EX',
      SESSION_TTL_S,
    );

    this.logger.debug(`Session created: ${sessionId} for user ${opts.userId}`);
    return sessionId;
  }

  // ── Check session exists (used by JWT strategy on every request) ──────────

  async sessionExists(userId: string, sessionId: string): Promise<boolean> {
    const exists = await this.redis.exists(this._key(userId, sessionId));
    return exists === 1;
  }

  // ── Validate on token refresh ─────────────────────────────────────────────

  async validateSession(userId: string, sessionId: string, refreshToken: string): Promise<boolean> {
    const raw = await this.redis.get(this._key(userId, sessionId));
    if (!raw) return false;

    const meta = JSON.parse(raw);
    const valid = await bcrypt.compare(refreshToken, meta.tokenHash);
    if (!valid) return false;

    // Slide the TTL on each use (keep-alive behaviour)
    await this.redis.expire(this._key(userId, sessionId), SESSION_TTL_S);
    return true;
  }

  // ── Rotate token (called during refresh) ─────────────────────────────────

  async rotateSession(userId: string, sessionId: string, newRefreshToken: string): Promise<void> {
    const raw = await this.redis.get(this._key(userId, sessionId));
    if (!raw) throw new UnauthorizedException('Session expired or revoked');

    const meta = JSON.parse(raw);
    meta.tokenHash  = await bcrypt.hash(newRefreshToken, 10);
    meta.lastSeenAt = new Date().toISOString();

    await this.redis.set(
      this._key(userId, sessionId),
      JSON.stringify(meta),
      'EX',
      SESSION_TTL_S,
    );
  }

  // ── Revoke a single session (this device) ────────────────────────────────

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.redis.del(this._key(userId, sessionId));
    this.logger.log(`Session revoked: ${sessionId} for user ${userId}`);
  }

  // ── Revoke all sessions (sign out all devices) ────────────────────────────

  async revokeAllSessions(userId: string): Promise<number> {
    const pattern = this._key(userId, '*');
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, found] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length > 0) await this.redis.del(...keys);
    this.logger.log(`Revoked ${keys.length} sessions for user ${userId}`);
    return keys.length;
  }

  // ── List active sessions ──────────────────────────────────────────────────

  async listSessions(userId: string): Promise<SessionMeta[]> {
    const pattern = this._key(userId, '*');
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [nextCursor, found] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...found);
    } while (cursor !== '0');

    if (keys.length === 0) return [];

    const values = await this.redis.mget(...keys);
    return values
      .map((v, i) => {
        if (!v) return null;
        const meta = JSON.parse(v);
        const sessionId = keys[i].split(':')[2]; // session:{userId}:{sessionId}
        return {
          sessionId,
          ip:          meta.ip,
          userAgent:   meta.userAgent,
          createdAt:   meta.createdAt,
          lastSeenAt:  meta.lastSeenAt,
        } as SessionMeta;
      })
      .filter(Boolean) as SessionMeta[];
  }

  private _key(userId: string, sessionId: string): string {
    return `session:${userId}:${sessionId}`;
  }
}//session