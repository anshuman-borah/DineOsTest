import {
  Controller, Get, Post, Patch, Delete, Param, Body,
  Query, UseGuards, ParseIntPipe, DefaultValuePipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')          // Every route in this controller requires superadmin
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  // ── Platform stats ───────────────────────────────────────────────────────
  @Get('stats')
  @ApiOperation({ summary: 'Platform-wide KPI stats' })
  getStats() { return this.svc.getStats(); }

  // ── Tenant list ──────────────────────────────────────────────────────────
  @Get('tenants')
  @ApiOperation({ summary: 'Paginated tenant list with subscription status' })
  @ApiQuery({ name: 'page',   required: false })
  @ApiQuery({ name: 'limit',  required: false })
  @ApiQuery({ name: 'search', required: false })
  listTenants(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.svc.listTenants(page, limit, search);
  }

  // ── Tenant detail ────────────────────────────────────────────────────────
  @Get('tenants/:id')
  @ApiOperation({ summary: 'Full tenant detail with subscription + usage' })
  getTenant(@Param('id') id: string) { return this.svc.getTenant(id); }

  // ── Suspend / reactivate ─────────────────────────────────────────────────
  @Patch('tenants/:id/suspend')
  @ApiOperation({ summary: 'Suspend tenant (disable access)' })
  suspend(@Param('id') id: string) { return this.svc.setTenantActive(id, false); }

  @Patch('tenants/:id/activate')
  @ApiOperation({ summary: 'Reactivate suspended tenant' })
  activate(@Param('id') id: string) { return this.svc.setTenantActive(id, true); }

  // ── Plan override ────────────────────────────────────────────────────────
  @Patch('tenants/:id/plan')
  @ApiOperation({ summary: 'Manually change a tenant\'s plan and subscription status' })
  changePlan(
    @Param('id') id: string,
    @Body() body: { planCode: string; status: string },
  ) {
    return this.svc.changePlan(id, body.planCode, body.status);
  }

  // ── Subscriptions overview ───────────────────────────────────────────────
  @Get('subscriptions')
  @ApiOperation({ summary: 'Paginated subscriptions, filterable by status and search' })
  @ApiQuery({ name: 'page',   required: false })
  @ApiQuery({ name: 'limit',  required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  getSubscriptions(
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.getSubscriptions(page, limit, status, search);
  }

  // ── Create tenant ────────────────────────────────────────────────────────
  @Post('tenants')
  @ApiOperation({ summary: 'Create a new tenant (business)' })
  createTenant(@Body() body: {
    name: string; email: string; phone?: string;
    businessType?: string; planCode?: string;
    ownerName?: string; ownerPassword?: string;
  }) {
    return this.svc.createTenant(body);
  }

  // ── Delete tenant ─────────────────────────────────────────────────────────
  @Delete('tenants/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Permanently delete a tenant and all their data' })
  deleteTenant(@Param('id') id: string) { return this.svc.deleteTenant(id); }

  // ── Recent activity ──────────────────────────────────────────────────────
  @Get('activity')
  @ApiOperation({ summary: 'Recent platform-wide activity feed' })
  @ApiQuery({ name: 'limit', required: false })
  getActivity(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.svc.getRecentActivity(limit);
  }

  // ── Chart data ────────────────────────────────────────────────────────
  @Get('charts/orders')
  @ApiOperation({ summary: 'Daily orders + revenue for the last 30 days' })
  getOrdersTrend() { return this.svc.getOrdersTrend(); }

  @Get('charts/signups')
  @ApiOperation({ summary: 'Daily new tenant signups for the last 30 days' })
  getSignupsTrend() { return this.svc.getSignupsTrend(); }
  // ── Plan management ────────────────────────────────────────────────────────
  @Get('plans')
  @ApiOperation({ summary: 'List all subscription plans' })
  listPlans() { return this.svc.listPlans(); }

  @Post('plans')
  @ApiOperation({ summary: 'Create a new subscription plan' })
  createPlan(@Body() body: any) { return this.svc.createPlan(body); }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update an existing subscription plan' })
  updatePlan(@Param('id') id: string, @Body() body: any) { return this.svc.updatePlan(id, body); }

  @Delete('plans/:id')
  @ApiOperation({ summary: 'Deactivate or delete a subscription plan' })
  deletePlan(@Param('id') id: string) { return this.svc.deletePlan(id); }

  // ── Global settings ────────────────────────────────────────────────────────
  @Get('settings')
  @ApiOperation({ summary: 'Get global platform settings' })
  getSettings() { return this.svc.getSettings(); }

  @Patch('settings')
  @ApiOperation({ summary: 'Update global platform settings' })
  updateSettings(@Body() body: any) { return this.svc.updateSettings(body); }
}
