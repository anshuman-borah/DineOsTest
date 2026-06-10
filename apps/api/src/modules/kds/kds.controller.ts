import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId, BranchId } from '../common/decorators/tenant.decorator';
import { KdsService } from './kds.service';
import { KdsStatus } from '../orders/entities/order-item.entity';

@ApiTags('kds')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'kds', version: '1' })
export class KdsController {
  constructor(private readonly svc: KdsService) {}

  @Get('pending')
  @Roles('kitchen', 'cashier', 'waiter', 'manager', 'owner')
  @ApiOperation({ summary: 'Pending KDS items for kitchen display' })
  getPending(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
  ) {
    return this.svc.getPendingItems(branchId, tenantId);
  }

  @Patch('items/:id/status')
  @Roles('kitchen', 'cashier', 'manager', 'owner')
  @ApiOperation({ summary: 'Update KDS item status' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: KdsStatus,
    @TenantId() tenantId: string,
  ) {
    return this.svc.updateItemStatus(id, status, tenantId);
  }

  @Patch('items/:id/bump')
  @Roles('kitchen', 'cashier', 'manager', 'owner')
  @ApiOperation({ summary: 'Bump single item — remove from KDS display' })
  bump(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.bumpItem(id, tenantId);
  }

  @Patch('orders/:orderId/bump')
  @Roles('kitchen', 'cashier', 'waiter', 'manager', 'owner')
  @ApiOperation({ summary: 'Bump all items in an order (waiter served / order complete)' })
  bumpOrder(
    @Param('orderId') orderId: string,
    @TenantId() tenantId: string,
  ) {
    return this.svc.bumpOrderItems(orderId, tenantId);
  }

  @Patch('items/:id/recall')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Recall a bumped item back to kitchen (manager/owner only)' })
  recall(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.recallItem(id, tenantId);
  }
}