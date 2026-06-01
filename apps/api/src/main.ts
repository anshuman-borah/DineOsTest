// ⚠️ Sentry MUST be imported before any other module — do not reorder.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as helmet from 'helmet';
import * as path from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { bootstrapLogger } from './common/logger/winston.logger';

// ─── Pre-flight environment validation ──────────────────────────────────────
// Runs before the NestJS app boots so misconfigured deployments fail fast
// rather than silently accepting insecure defaults.
function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) return;   // dev / test — skip strict checks

  const errors: string[] = [];

  const requiredSecrets: Array<{ key: string; minLength: number; label: string }> = [
    { key: 'JWT_SECRET',         minLength: 64, label: 'JWT_SECRET'         },
    { key: 'JWT_REFRESH_SECRET', minLength: 64, label: 'JWT_REFRESH_SECRET' },
  ];

  for (const { key, minLength, label } of requiredSecrets) {
    const val = process.env[key];
    if (!val || val.length < minLength) {
      errors.push(`${label} must be at least ${minLength} characters in production (got ${val?.length ?? 0})`);
    }
  }

  const forbiddenDefaults: Array<{ key: string; forbidden: string }> = [
    { key: 'DB_PASSWORD',         forbidden: 'changeme'  },
    { key: 'REDIS_PASSWORD',      forbidden: 'changeme'  },
    { key: 'MINIO_ROOT_PASSWORD', forbidden: 'changeme'  },
    { key: 'JWT_SECRET',          forbidden: 'super-secret-jwt-key-change-in-production' },
    { key: 'JWT_REFRESH_SECRET',  forbidden: 'super-secret-refresh-key-change-in-production' },
  ];

  for (const { key, forbidden } of forbiddenDefaults) {
    if (process.env[key] === forbidden) {
      errors.push(`${key} is still set to the example default — change it before deploying`);
    }
  }

  const requiredVars = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'APP_URL'];
  for (const key of requiredVars) {
    if (!process.env[key]) {
      errors.push(`${key} is required in production but is not set`);
    }
  }

  if (errors.length > 0) {
    bootstrapLogger.error('=== PRODUCTION ENV VALIDATION FAILED ===');
    errors.forEach((e) => bootstrapLogger.error(`  ✗ ${e}`));
    bootstrapLogger.error('========================================');
    process.exit(1);
  }
}

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,   // needed for Razorpay webhook signature verification
  });
  app.useLogger(bootstrapLogger);

  // ─── Security headers (Helmet) ──────────────────────────────────────────
  const isProd = process.env.NODE_ENV === 'production';
  app.use((helmet as any).default({
    contentSecurityPolicy: isProd,       // only enforce CSP in production
    crossOriginEmbedderPolicy: false,    // allow loading external resources (fonts, etc.)
    crossOriginResourcePolicy: false,    // allow frontend to load static images
  }));

  // ─── CORS — locked to APP_URL in production ──────────────────────────────
  const allowedOrigins = (process.env.APP_URL || 'http://localhost:3001')
    .split(',').map((o) => o.trim());

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin) || !isProd) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id', 'x-branch-id'],
  });

  // ─── Serve local uploads as static files ──────────────────────────────────
  const uploadsPath = path.join(process.cwd(), 'uploads');
  app.useStaticAssets(uploadsPath, { prefix: '/static' });

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,   // 400 on unknown fields — prevents payload fuzzing
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useWebSocketAdapter(new IoAdapter(app));

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dine&Stay OS API')
    .setDescription('Restaurant POS & Hotel Management SaaS API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth')
    .addTag('tenants')
    .addTag('branches')
    .addTag('users')
    .addTag('menu')
    .addTag('orders')
    .addTag('billing')
    .addTag('inventory')
    .addTag('shifts')
    .addTag('kds')
    .addTag('reports')
    .addTag('razorpay')
    .addTag('audit')
    .addTag('storage')
    .addTag('sms')
    .build();

  // ─── Swagger — dev only ───────────────────────────────────────────────────
  if (!isProd) {
    const doc = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, doc);
  }

  const port = process.env.PORT || 4000;
  await app.listen(port);
  bootstrapLogger.log(`Dine&Stay OS API running on http://localhost:${port}/api`);
  if (!isProd) bootstrapLogger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
