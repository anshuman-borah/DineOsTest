import {
  Controller, Get, Post, Put, Delete, Body,
  Param, Query, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId, BranchId } from '../common/decorators/tenant.decorator';
import { MenuService } from './menu.service';
import { MenuItem } from './entities/menu-item.entity';
import { Category } from './entities/category.entity';
import { GstRate } from '../billing/entities/gst-rate.entity';

@ApiTags('menu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'menu', version: '1' })
export class MenuController {
  constructor(private readonly svc: MenuService) {}

  // ── Categories ────────────────────────────────────────────────────────────

  @Get('categories')
  @Roles('waiter', 'cashier', 'kitchen', 'inventory', 'manager', 'owner')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(300)
  @ApiOperation({ summary: 'List categories (cached 5 min)' })
  getCategories(@TenantId() t: string, @BranchId() b: string) {
    return this.svc.getCategories(t, b);
  }

  @Post('categories')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Create menu category' })
  createCategory(
    @Body() body: Partial<Category>,
    @TenantId() t: string,
    @BranchId() b: string,
  ) {
    return this.svc.createCategory({ ...body, tenantId: t, branchId: b });
  }

  @Put('categories/:id')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Update menu category' })
  updateCategory(
    @Param('id') id: string,
    @Body() body: Partial<Category>,
    @TenantId() t: string,
  ) {
    return this.svc.updateCategory(id, t, body);
  }

  @Delete('categories/:id')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Delete menu category' })
  removeCategory(@Param('id') id: string, @TenantId() t: string) {
    return this.svc.removeCategory(id, t);
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  @Get('items')
  @Roles('waiter', 'cashier', 'kitchen', 'inventory', 'manager', 'owner')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(120)
  @ApiOperation({ summary: 'List menu items (cached 2 min)' })
  getItems(
    @TenantId() t: string,
    @BranchId() b: string,
    @Query('categoryId') cat?: string,
  ) {
    return this.svc.getItems(t, b, cat);
  }

  @Get('items/:id')
  @Roles('waiter', 'cashier', 'kitchen', 'inventory', 'manager', 'owner')
  getItem(@Param('id') id: string, @TenantId() t: string) {
    return this.svc.getItem(id, t);
  }

  @Post('items')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Create menu item' })
  createItem(
    @Body() body: Partial<MenuItem>,
    @TenantId() t: string,
    @BranchId() b: string,
  ) {
    return this.svc.createItem({ ...body, tenantId: t, branchId: b });
  }

  @Put('items/:id')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Update menu item' })
  updateItem(
    @Param('id') id: string,
    @Body() body: Partial<MenuItem>,
    @TenantId() t: string,
  ) {
    return this.svc.updateItem(id, t, body);
  }

  @Delete('items/:id')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Delete menu item (also removes image from storage)' })
  removeItem(@Param('id') id: string, @TenantId() t: string) {
    return this.svc.removeItem(id, t);
  }

  // ── Variations ─────────────────────────────────────────────────────────────

  @Get('items/:id/variations')
  @Roles('waiter', 'cashier', 'kitchen', 'inventory', 'manager', 'owner')
  @ApiOperation({ summary: 'List active variations for a menu item' })
  getVariations(@Param('id') id: string, @TenantId() t: string) {
    return this.svc.getVariations(id, t);
  }

  @Post('items/:id/variations')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Add a variation to a menu item' })
  createVariation(
    @Param('id') id: string,
    @Body() body: any,
    @TenantId() t: string,
  ) {
    return this.svc.createVariation(id, t, body);
  }

  @Put('items/:itemId/variations/:varId')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Update a variation' })
  updateVariation(
    @Param('varId') varId: string,
    @Body() body: any,
    @TenantId() t: string,
  ) {
    return this.svc.updateVariation(varId, t, body);
  }

  @Delete('items/:itemId/variations/:varId')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Delete a variation' })
  removeVariation(@Param('varId') varId: string, @TenantId() t: string) {
    return this.svc.removeVariation(varId, t);
  }

  // ── GST Rates ──────────────────────────────────────────────────────────────

  @Get('gst-rates')
  @Roles('cashier', 'manager', 'owner')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(1800)
  @ApiOperation({ summary: 'List GST rates (cached 30 min)' })
  getGstRates(@TenantId() t: string) {
    return this.svc.getGstRates(t);
  }

  @Post('gst-rates')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Create a custom GST rate' })
  createGstRate(@Body() body: Partial<GstRate>, @TenantId() t: string) {
    return this.svc.createGstRate(t, body);
  }

  @Put('gst-rates/:id')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Update a GST rate' })
  updateGstRate(
    @Param('id') id: string,
    @Body() body: Partial<GstRate>,
    @TenantId() t: string,
  ) {
    return this.svc.updateGstRate(id, t, body);
  }

  @Delete('gst-rates/:id')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Delete a GST rate' })
  removeGstRate(@Param('id') id: string, @TenantId() t: string) {
    return this.svc.removeGstRate(id, t);
  }

  @Post('gst-rates/seed')
  @Roles('owner')
  @ApiOperation({ summary: 'Seed default India GST slabs (run once)' })
  seedGstRates(@TenantId() t: string) {
    return this.svc.seedDefaultGstRates(t);
  }
}