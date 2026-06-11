import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsEmail, IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { Roles, RequireFeature } from '../common/decorators/roles.decorator';
import { TenantId, BranchId } from '../common/decorators/tenant.decorator';
import { BillingService, CreateBillDto } from './billing.service';

class EmailBillDto { @ApiProperty() @IsEmail() email: string; }
class VoidBillDto { @ApiProperty() @IsString() reason: string; }
class CreateRazorpayOrderDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() receipt?: string;
}
class VerifyRazorpayBillingDto {
  @ApiProperty() @IsString() razorpayOrderId: string;
  @ApiProperty() @IsString() razorpayPaymentId: string;
  @ApiProperty() @IsString() razorpaySignature: string;
}

@ApiTags('billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@RequireFeature('billing')
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(private readonly svc: BillingService) {}

  @Post('bills')
  @ApiOperation({ summary: 'Create bill and process payment' })
  createBill(@Body() dto: CreateBillDto, @TenantId() tenantId: string, @BranchId() branchId: string) {
    return this.svc.createBill({ ...dto, tenantId, branchId: branchId || dto.branchId });
  }

  @Post('razorpay/create-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a Razorpay order using the tenant own credentials (for POS/Hotel billing)' })
  createRazorpayOrder(
    @Body() dto: CreateRazorpayOrderDto,
    @TenantId() tenantId: string,
  ) {
    return this.svc.createRazorpayOrderForBilling(tenantId, dto.amount, dto.receipt);
  }

  @Post('razorpay/verify-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Razorpay payment signature for billing' })
  verifyRazorpayPayment(
    @Body() dto: VerifyRazorpayBillingDto,
    @TenantId() tenantId: string,
  ) {
    return this.svc.verifyRazorpayBillingPayment(tenantId, dto.razorpayOrderId, dto.razorpayPaymentId, dto.razorpaySignature);
  }

  @Get('bills')
  @ApiOperation({ summary: 'List bills (paginated)' })
  listBills(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('source') source?: string,
  ) {
    return this.svc.listBills(
      branchId,
      tenantId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      page ? parseInt(page, 10) : 1,
      limit ? Math.min(parseInt(limit, 10), 200) : 50,
      source
    );
  }

  @Get('bills/:id')
  getBill(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getBill(id, tenantId);
  }

  @Patch('bills/:id/void')
  @Roles('manager', 'owner')
  @ApiOperation({ summary: 'Void a bill (manager/owner only)' })
  voidBill(@Param('id') id: string, @Body() dto: VoidBillDto, @TenantId() tenantId: string) {
    return this.svc.voidBill(id, tenantId, dto.reason);
  }

  @Post('bills/:id/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email bill to customer' })
  emailBill(@Param('id') id: string, @Body() dto: EmailBillDto, @TenantId() tenantId: string) {
    return this.svc.emailBill(id, tenantId, dto.email);
  }

  @Post('bills/:id/reprint')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Increment reprint counter and return bill for printing' })
  reprintBill(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.reprintBill(id, tenantId);
  }
}
