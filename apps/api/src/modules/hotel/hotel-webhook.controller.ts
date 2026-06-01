import { Controller, Post, Body, Headers, UnauthorizedException, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ChannelManagerService, IncomingBookingPayload } from './channel-manager.service';

@Controller({ path: 'hotel/webhooks', version: '1' })
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
    } else if (payload.event === 'BookingModified') {
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

      await this.cmService.processModification(tenantId, branchId, bookingData);
    } else if (payload.event === 'BookingCancelled') {
      await this.cmService.processCancellation(tenantId, branchId, payload.booking.id);
    }

    return { status: 'success' };
  }
}
