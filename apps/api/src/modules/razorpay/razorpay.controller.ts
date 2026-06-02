import {
  Controller, Post, Body, Req, Headers, RawBodyRequest,
  HttpCode, HttpStatus, UseGuards, Get, Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { RazorpayService } from './razorpay.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('razorpay')
@Controller({ path: 'razorpay', version: '1' })
export class RazorpayController {
  constructor(private readonly razorpayService: RazorpayService) {}

  // ─── Create order (called before Razorpay checkout opens) ────────────────
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('create-order')
  @ApiOperation({ summary: 'Create a Razorpay payment order for plan upgrade' })
  createOrder(
    @TenantId() tenantId: string,
    @Body() body: { planCode: string; frequency?: 'monthly' | 'yearly' },
  ) {
    return this.razorpayService.createSubscription(tenantId, body.planCode, body.frequency || 'monthly');
  }

  // ─── Verify payment after checkout succeeds ───────────────────────────────
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('verify-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify payment signature and activate subscription' })
  async verifyPayment(
    @TenantId() tenantId: string,
    @Body() body: {
      razorpayOrderId: string;
      razorpayPaymentId: string;
      razorpaySignature: string;
      planCode: string;
      frequency?: 'monthly' | 'yearly';
    },
  ) {
    const valid = await this.razorpayService.verifyPaymentSignature({
      orderId: body.razorpayOrderId,
      paymentId: body.razorpayPaymentId,
      signature: body.razorpaySignature,
    });

    if (!valid) {
      return { success: false, message: 'Payment verification failed — invalid signature' };
    }

    const subscription = await this.razorpayService.activateSubscription({
      tenantId,
      planCode: body.planCode,
      frequency: body.frequency || 'monthly',
      razorpayPaymentId: body.razorpayPaymentId,
      razorpayOrderId: body.razorpayOrderId,
    });

    return { success: true, subscription };
  }

  // ─── Webhook endpoint (called by Razorpay server) ────────────────────────
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Razorpay webhook receiver' })
  handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const rawBody = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));
    return this.razorpayService.handleWebhook(rawBody, signature);
  }
}
