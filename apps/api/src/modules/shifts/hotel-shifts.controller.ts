import {
  Controller, Get, Post, Body,
  Param, UseGuards, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId, BranchId, CurrentUser } from '../common/decorators/tenant.decorator';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto, CloseShiftDto } from './dto/shift.dto';
import { ShiftDepartment } from './entities/shift.entity';

@ApiTags('hotel-shifts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'hotel-shifts', version: '1' })
export class HotelShiftsController {
  constructor(private readonly svc: ShiftsService) {}

  @Post('open')
  @Roles('hotel_manager', 'receptionist', 'manager', 'owner')
  @ApiOperation({ summary: 'Open a new hotel shift' })
  async openShift(
    @Body() dto: OpenShiftDto,
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.openShift(
      branchId,
      tenantId,
      user.id,
      dto.openingCash,
      dto.denominations,
      ShiftDepartment.HOTEL,
    );
  }

  @Post(':id/close')
  @Roles('hotel_manager', 'receptionist', 'manager', 'owner')
  @ApiOperation({ summary: 'Close hotel shift' })
  async closeShift(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.closeShift(
      id,
      tenantId,
      user.id,
      dto.closingCash,
      dto.denominations,
      dto.notes,
    );
  }

  @Get('current')
  @Roles('hotel_manager', 'receptionist', 'housekeeping', 'manager', 'owner')
  @ApiOperation({ summary: 'Get current active hotel shift' })
  getCurrent(@TenantId() tenantId: string, @BranchId() branchId: string) {
    return this.svc.getActiveShift(branchId, tenantId, ShiftDepartment.HOTEL);
  }

  @Get('active')
  @Roles('hotel_manager', 'receptionist', 'housekeeping', 'manager', 'owner')
  @ApiOperation({ summary: 'Get active hotel shift' })
  getActive(@TenantId() tenantId: string, @BranchId() branchId: string) {
    return this.svc.getActiveShift(branchId, tenantId, ShiftDepartment.HOTEL);
  }

  @Get('stats/summary')
  @Roles('hotel_manager', 'manager', 'owner')
  @ApiOperation({ summary: 'Get hotel shift statistics' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate',   required: false })
  async getStats(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?: string,
  ) {
    return this.svc.getShiftStats(
      branchId,
      tenantId,
      startDate ? new Date(startDate) : undefined,
      endDate   ? new Date(endDate)   : undefined,
      ShiftDepartment.HOTEL,
    );
  }

  @Get(':id/summary')
  @Roles('hotel_manager', 'receptionist', 'manager', 'owner')
  @ApiOperation({ summary: 'Get hotel shift summary' })
  getSummary(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.svc.getShiftSummary(id, tenantId);
  }

  @Get()
  @Roles('hotel_manager', 'manager', 'owner')
  @ApiOperation({ summary: 'List all hotel shifts' })
  @ApiQuery({ name: 'limit',       required: false })
  @ApiQuery({ name: 'offset',      required: false })
  @ApiQuery({ name: 'status',      required: false })
  @ApiQuery({ name: 'startDate',   required: false })
  @ApiQuery({ name: 'endDate',     required: false })
  @ApiQuery({ name: 'shiftNumber', required: false })
  list(
    @TenantId() tenantId: string,
    @BranchId() branchId: string,
    @Query('limit')       limit?: number,
    @Query('offset')      offset?: number,
    @Query('status')      status?: string,
    @Query('startDate')   startDate?: string,
    @Query('endDate')     endDate?: string,
    @Query('shiftNumber') shiftNumber?: string,
  ) {
    return this.svc.listShifts(
      branchId,
      tenantId,
      limit  ? Number(limit)  : 20,
      offset ? Number(offset) : 0,
      { status, startDate, endDate, shiftNumber },
      ShiftDepartment.HOTEL,
    );
  }

  @Post(':id/refresh')
  @Roles('hotel_manager', 'manager', 'owner')
  @ApiOperation({ summary: 'Refresh hotel shift calculations' })
  async refreshShift(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    const shift = await this.svc.getShiftSummary(id, tenantId);
    const openingCash  = Number(shift.openingCash);
    const cashSales    = Number(shift.cashSales);
    const totalRefund  = Number(shift.totalRefund  || 0);
    const expectedCash = openingCash + cashSales - totalRefund;
    const actualCash   = Number(shift.closingCash  || 0);
    const difference   = actualCash - expectedCash;

    return {
      shiftId: id,
      openingCash,
      cashSales,
      totalRefund,
      expectedCash,
      actualCash,
      difference,
      message: difference >= 0 ? 'Surplus cash found' : 'Cash shortage detected',
    };
  }
}
