import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShiftsService } from './shifts.service';
import { ShiftsController } from './shifts.controller';
import { HotelShiftsController } from './hotel-shifts.controller';
import { Shift } from './entities/shift.entity';
import { ShiftDenomination } from './entities/shift-denomination.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shift, ShiftDenomination])],
  providers: [ShiftsService],
  controllers: [ShiftsController, HotelShiftsController],
  exports: [ShiftsService],
})
export class ShiftsModule {}
