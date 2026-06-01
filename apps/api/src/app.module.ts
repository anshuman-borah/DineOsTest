import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';

import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BranchesModule } from './modules/branches/branches.module';
import { UsersModule } from './modules/users/users.module';
import { TablesModule } from './modules/tables/tables.module';
import { MenuModule } from './modules/menu/menu.module';
import { OrdersModule } from './modules/orders/orders.module';
import { BillingModule } from './modules/billing/billing.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ShiftsModule } from './modules/shifts/shifts.module';
import { KdsModule } from './modules/kds/kds.module';
import { ReportsModule } from './modules/reports/reports.module';
import { MailerModule } from './modules/mailer/mailer.module';
import { RazorpayModule } from './modules/razorpay/razorpay.module';
import { AuditModule } from './modules/audit/audit.module';
import { LoggerModule } from './common/logger/logger.module';
import { SmsModule } from './modules/sms/sms.module';
import { StorageModule } from './modules/storage/storage.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { AdminModule } from './modules/admin/admin.module';
import { BackupModule } from './modules/backup/backup.module';
import { HotelModule }  from './modules/hotel/hotel.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { HealthController } from './common/health/health.controller';
import { AuditInterceptor } from './modules/audit/audit.interceptor';

@Module({
  controllers: [HealthController],
  providers: [
    // Apply ThrottlerGuard globally so every route is rate-limited by default.
    // Auth routes override this with stricter per-endpoint @Throttle() decorators.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const isTest = cfg.get('NODE_ENV') === 'test';
        // In test mode honour DATABASE_URL_TEST / DATABASE_URL if set (CI injects it)
        const dbUrl = isTest
          ? (process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL ?? null)
          : null;
        const common = {
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          // synchronize=true in test — schema auto-created from entities, no migrations needed
          synchronize: isTest,
          logging: (cfg.get('NODE_ENV') === 'development' ? ['error', 'warn'] : false) as any,
          ssl: cfg.get('DB_SSL') === 'true'
            ? { rejectUnauthorized: true, ca: process.env.DB_SSL_CA ? require('fs').readFileSync(process.env.DB_SSL_CA).toString() : undefined }
            : false,
          extra: { max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 },
        };
        if (dbUrl) {
          return { type: 'postgres' as const, url: dbUrl, ...common };
        }
        const dbPassword = cfg.get<string>('DB_PASSWORD');
        if (!dbPassword) throw new Error('DB_PASSWORD environment variable is required');

        return {
          type: 'postgres' as const,
          host: cfg.get<string>('DB_HOST', 'localhost'),
          port: cfg.get<number>('DB_PORT', 5432),
          username: cfg.get<string>('DB_USER', 'dinestayadmin'),
          password: dbPassword,
          database: cfg.get<string>('DB_NAME', 'dinestay'),
          ...common,
        };
      },
    }),

    CacheModule.register({ isGlobal: true, ttl: 60 }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),

    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),

    // Global utility modules (order matters — these must come before feature modules)
    LoggerModule,
    MailerModule,
    AuditModule,
    SmsModule,
    StorageModule,

    // Feature modules
    AuthModule,
    TenantsModule,
    SubscriptionsModule,
    BranchesModule,
    UsersModule,
    TablesModule,
    MenuModule,
    OrdersModule,
    BillingModule,
    InventoryModule,
    ShiftsModule,
    KdsModule,
    ReportsModule,
    RazorpayModule,
    SchedulerModule,
    AdminModule,
    BackupModule,
    HotelModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
