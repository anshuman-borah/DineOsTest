import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, DefaultValuePipe, ParseIntPipe, HttpCode, HttpStatus, BadRequestException, Res
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TenantId, CurrentUser, BranchId } from '../../common/decorators/tenant.decorator';
import { HotelService } from './hotel.service';
import { RoomStatus } from './entities/room.entity';
import { ReservationStatus, BookingSource } from './entities/reservation.entity';
import { ChargeType } from './entities/folio-charge.entity';
import { HkStatus, HkTaskType, HkPriority } from './entities/housekeeping-task.entity';
import { PaymentMethod } from '../billing/entities/payment.entity';
import { ShiftsService } from '../shifts/shifts.service';
import { ShiftDepartment } from '../shifts/entities/shift.entity';

@ApiTags('hotel')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'hotel', version: '1' })
export class HotelController {
  constructor(
    private readonly svc: HotelService,
    private readonly shiftsService: ShiftsService,
  ) {}

  // ── Dashboard ──────────────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles('owner', 'manager', 'cashier', 'receptionist', 'hotel_manager')
  @ApiOperation({ summary: 'Hotel overview — occupancy, arrivals, departures' })
  getDashboard(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
  ) {
    return this.svc.getDashboard(tenantId, branchId);
  }

  // ── Room Types ─────────────────────────────────────────────────────────────

  @Get('room-types')
  @Roles('owner', 'manager', 'cashier', 'waiter', 'receptionist', 'hotel_manager')
  listRoomTypes(@TenantId() tid: string, @BranchId() branchId: string) {
    return this.svc.listRoomTypes(tid, branchId);
  }

  @Post('room-types')
  @Roles('owner', 'manager', 'hotel_manager')
  createRoomType(@TenantId() tid: string, @BranchId() branchId: string, @Body() body: any) {
    return this.svc.createRoomType(tid, branchId, body);
  }

  @Patch('room-types/:id')
  @Roles('owner', 'manager', 'hotel_manager')
  updateRoomType(@Param('id') id: string, @TenantId() tid: string, @Body() body: any) {
    return this.svc.updateRoomType(id, tid, body);
  }

  @Delete('room-types/:id')
  @Roles('owner', 'manager', 'hotel_manager')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRoomType(@Param('id') id: string, @TenantId() tid: string) {
    return this.svc.deleteRoomType(id, tid);
  }

  // ── Rooms ──────────────────────────────────────────────────────────────────

  @Get('rooms')
  @Roles('owner', 'manager', 'cashier', 'waiter', 'housekeeping', 'receptionist', 'hotel_manager')
  @ApiQuery({ name: 'status', required: false })
  listRooms(
    @TenantId() tid: string,
    @BranchId() branchId: string,
    @Query('status') status?: RoomStatus,
  ) {
    return this.svc.listRooms(tid, branchId, status);
  }

  @Post('rooms')
  @Roles('owner', 'manager', 'hotel_manager')
  createRoom(
    @TenantId() tid: string,
    @BranchId() branchId: string,
    @Body() body: any,
  ) {
    if (!branchId) throw new BadRequestException('Branch ID is required to create a room');
    return this.svc.createRoom(tid, branchId, body);
  }

  @Patch('rooms/:id')
  @Roles('owner', 'manager', 'hotel_manager')
  updateRoom(@Param('id') id: string, @TenantId() tid: string, @Body() body: any) {
    return this.svc.updateRoom(id, tid, body);
  }

  @Patch('rooms/:id/status')
  @Roles('owner', 'manager', 'hotel_manager', 'cashier', 'housekeeping', 'receptionist')
  updateRoomStatus(
    @Param('id') id: string,
    @TenantId() tid: string,
    @Body('status') status: RoomStatus,
  ) {
    return this.svc.updateRoomStatus(id, tid, status);
  }

  // ── Guests ─────────────────────────────────────────────────────────────────

  @Get('guests')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  @ApiQuery({ name: 'q', required: false })
  searchGuests(@TenantId() tid: string, @Query('q') q?: string) {
    return this.svc.searchGuests(tid, q ?? '');
  }

  @Get('guests/:id')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  getGuest(@Param('id') id: string, @TenantId() tid: string) {
    return this.svc.getGuest(id, tid);
  }

  @Post('guests')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  createGuest(@TenantId() tid: string, @Body() body: any) {
    return this.svc.createGuest(tid, body);
  }

  @Patch('guests/:id')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  updateGuest(@Param('id') id: string, @TenantId() tid: string, @Body() body: any) {
    return this.svc.updateGuest(id, tid, body);
  }

  // ── Reservations ───────────────────────────────────────────────────────────

  @Get('reservations')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listReservations(
    @TenantId() tid: string,
    @BranchId() branchId: string,
    @Query('status') status?: ReservationStatus,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
  ) {
    return this.svc.listReservations(tid, { status, from, to, search, branchId, page, limit });
  }

  @Get('reservations/:id')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  getReservation(@Param('id') id: string, @TenantId() tid: string) {
    return this.svc.getReservation(id, tid);
  }

  @Post('reservations')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  createReservation(
    @TenantId() tid: string,
    @BranchId() branchId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    if (!branchId) throw new BadRequestException('Branch ID is required to create a reservation');
    return this.svc.createReservation(tid, branchId, body, user?.id);
  }

  @Post('reservations/:id/check-in')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  checkIn(@Param('id') id: string, @TenantId() tid: string) {
    return this.svc.checkIn(id, tid);
  }

  @Post('reservations/:id/check-out')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  checkOut(@Param('id') id: string, @TenantId() tid: string) {
    return this.svc.checkOut(id, tid);
  }

  @Post('reservations/:id/cancel')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  cancel(
    @Param('id') id: string,
    @TenantId() tid: string,
    @Body('reason') reason: string,
  ) {
    return this.svc.cancelReservation(id, tid, reason ?? 'Cancelled by staff');
  }

  // ── Folio ──────────────────────────────────────────────────────────────────

  @Get('reservations/:id/folio')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  getFolio(@Param('id') id: string, @TenantId() tid: string) {
    return this.svc.getFolio(id, tid);
  }

  @Post('reservations/:id/folio/charges')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  addCharge(@Param('id') id: string, @TenantId() tid: string, @Body() body: any) {
    return this.svc.addFolioCharge(id, tid, body);
  }

  // ── Billing ────────────────────────────────────────────────────────────────

  @Post('reservations/:id/bill')
  @Roles('owner', 'manager', 'cashier', 'receptionist')
  async generateBill(
    @Param('id') id: string,
    @TenantId() tid: string,
    @BranchId() branchId: string,
    @Body('paymentMethod') paymentMethod?: PaymentMethod,
    @Body('amountPaid') amountPaid?: number,
    @Body('shiftId') shiftId?: string,
  ) {
    // ── Resolve hotel shift & enforce cash-only shift requirement ──────────
    let resolvedShiftId = shiftId;

    if (!resolvedShiftId) {
      // Auto-detect active hotel shift for this branch
      const activeShift = await this.shiftsService.getActiveShift(
        branchId, tid, ShiftDepartment.HOTEL,
      );
      if (activeShift?.id) resolvedShiftId = activeShift.id;
    }

    // Cash payments REQUIRE an active hotel shift (for cash drawer accountability)
    const method = paymentMethod ?? PaymentMethod.CASH;
    if (method === PaymentMethod.CASH && !resolvedShiftId) {
      throw new BadRequestException(
        'No active hotel shift. Open a shift before accepting cash payments.',
      );
    }

    // Non-cash methods (card, UPI, wallet, etc.) proceed without a shift
    return this.svc.generateBill(id, tid, method, amountPaid, resolvedShiftId);
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  @Get('reports/revenue')
  @Roles('owner', 'manager', 'hotel_manager')
  @ApiOperation({ summary: 'Revenue report by date range' })
  async getRevenueReport(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return this.svc.getRevenueReport(tenantId, branchId, fromDate, toDate);
  }

  @Get('reports/bookings')
  @Roles('owner', 'manager', 'hotel_manager', 'receptionist')
  @ApiOperation({ summary: 'Bookings report by date range' })
  async getBookingsReport(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return this.svc.getBookingsReport(tenantId, branchId, fromDate, toDate);
  }

  @Get('reports/rooms')
  @Roles('owner', 'manager', 'hotel_manager', 'receptionist')
  @ApiOperation({ summary: 'Room performance report' })
  async getRoomsReport(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return this.svc.getRoomsPerformanceReport(tenantId, branchId, fromDate, toDate);
  }

  @Get('reports/occupancy-summary')
  @Roles('owner', 'manager', 'hotel_manager', 'receptionist')
  @ApiOperation({ summary: 'Current occupancy summary' })
  async getOccupancySummary(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
  ) {
    return this.svc.getOccupancySummary(tenantId, branchId);
  }

  @Get('reports/payments')
  @Roles('owner', 'manager', 'hotel_manager')
  @ApiOperation({ summary: 'Payment methods report' })
  async getPaymentsReport(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return this.svc.getPaymentsReport(tenantId, branchId, fromDate, toDate);
  }

  @Get('reports/gst')
  @Roles('owner', 'manager', 'hotel_manager')
  @ApiOperation({ summary: 'GST report by date range' })
  async getGstReport(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return this.svc.getGstReport(tenantId, branchId, fromDate, toDate);
  }

  @Get('reports/gstr1-export')
  @Roles('owner', 'manager', 'hotel_manager')
  @ApiOperation({ summary: 'Export GSTR-1 JSON for GST portal' })
  async exportGstr1(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    const data = await this.svc.getGstr1Export(tenantId, branchId, fromDate, toDate);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=gstr1-${from}-${to}.json`);
    res.send(data);
  }

  @Get('reports/frontdesk')
  @Roles('owner', 'manager', 'hotel_manager')
  @ApiOperation({ summary: 'Front desk staff performance report' })
  async getFrontDeskReport(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    return this.svc.getFrontDeskReport(tenantId, branchId, fromDate, toDate);
  }

  // ── Housekeeping ───────────────────────────────────────────────────────────

  @Get('housekeeping')
  @Roles('owner', 'manager', 'cashier', 'housekeeping', 'receptionist')
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'date', required: false })
  listTasks(
    @TenantId() tid: string,
    @BranchId() branchId: string,
    @Query('date') date?: string,
  ) {
    return this.svc.listHousekeepingTasks(tid, branchId, date);
  }

  @Post('housekeeping')
  @Roles('owner', 'manager')
  createTask(
    @TenantId() tid: string,
    @BranchId() branchId: string,
    @Body() body: any,
  ) {
    if (!branchId) throw new BadRequestException('Branch ID is required to create a task');
    return this.svc.createHousekeepingTask(tid, branchId, body);
  }

  @Patch('housekeeping/:id')
  @Roles('owner', 'manager', 'cashier', 'housekeeping', 'receptionist')
  updateTask(
    @Param('id') id: string,
    @TenantId() tid: string,
    @Body('status') status: HkStatus,
    @Body('notes') notes?: string,
  ) {
    return this.svc.updateHousekeepingTask(id, tid, status, notes);
  }
}