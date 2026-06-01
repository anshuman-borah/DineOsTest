import { Controller, Post, Body, Headers, UnauthorizedException, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ChannelManagerService, IncomingBookingPayload } from './channel-manager.service';

@Controller('v1/hotel/webhooks')
export class HotelWebhookController {
  constructor(private readonly cmService: ChannelManagerService) {}

  @Post('channel-manager/:tenantId/:branchId')
  @HttpCode(HttpStatus.OK)
  async handleChannelManagerWebhook(
    @Param('tenantId') tenantId: string,
    @Param('branchId') branchId: string,
    @Headers('x-api-key') apiKey: string,
    @Body() payload: any
  ) {
    // In production, validate apiKey against tenant settings
    if (apiKey !== 'test_secret_key') {
      throw new UnauthorizedException('Invalid API Key');
    }

    if (payload.event === 'BookingCreated') {
      const bookingData: IncomingBookingPayload = {
        channelManagerId: payload.booking.id,
        roomTypeId: payload.booking.roomTypeId,
        guest: {
          firstName: payload.booking.guest.firstName,
          lastName: payload.booking.guest.lastName,
          email: payload.booking.guest.email,
          phone: payload.booking.guest.phone,
        },
        checkInDate: payload.booking.checkInDate,
        checkOutDate: payload.booking.checkOutDate,
        numAdults: payload.booking.numAdults || 1,
        numChildren: payload.booking.numChildren || 0,
        totalAmount: payload.booking.totalAmount,
      };

      await this.cmService.processIncomingBooking(tenantId, branchId, bookingData);
    }
    // We would also handle 'BookingModified' and 'BookingCancelled' here.

    return { status: 'success' };
  }
}
