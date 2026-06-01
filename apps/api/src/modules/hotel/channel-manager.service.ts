import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RoomType } from './entities/room-type.entity';
import { Room, RoomStatus } from './entities/room.entity';
import { Guest } from './entities/guest.entity';
import { Reservation, BookingSource, ReservationStatus } from './entities/reservation.entity';

export interface IncomingBookingPayload {
  channelManagerId: string; // The OTA/Channel Manager reference ID
  roomTypeId: string;       // Channel Manager's internal ID for the room type
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  checkInDate: string;      // YYYY-MM-DD
  checkOutDate: string;     // YYYY-MM-DD
  numAdults: number;
  numChildren: number;
  totalAmount: number;      // Total cost in INR
}

@Injectable()
export class ChannelManagerService {
  private readonly logger = new Logger(ChannelManagerService.name);

  constructor(
    @InjectRepository(RoomType) private readonly roomTypeRepo: Repository<RoomType>,
    @InjectRepository(Room) private readonly roomRepo: Repository<Room>,
    @InjectRepository(Guest) private readonly guestRepo: Repository<Guest>,
    @InjectRepository(Reservation) private readonly reservationRepo: Repository<Reservation>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Process incoming booking from the Channel Manager webhook
   */
  async processIncomingBooking(tenantId: string, branchId: string, payload: IncomingBookingPayload): Promise<Reservation> {
    this.logger.log(`Processing incoming booking from Channel Manager: ${payload.channelManagerId}`);

    return this.dataSource.transaction(async (em) => {
      // 1. Map Channel Manager Room Type to DineOS Room Type
      const roomType = await em.findOne(RoomType, {
        where: { tenantId, branchId, channelManagerId: payload.roomTypeId },
      });

      if (!roomType) {
        throw new NotFoundException(`RoomType mapping not found for CM ID: ${payload.roomTypeId}`);
      }

      // 2. Find an available room of this type for the given dates
      // Simplified: Find first room of this type not occupied/maintenance
      // A robust implementation would check date overlaps exactly
      const availableRoom = await em.findOne(Room, {
        where: { tenantId, branchId, roomType: { id: roomType.id }, status: RoomStatus.AVAILABLE },
      });

      if (!availableRoom) {
        throw new Error(`No available rooms for mapped RoomType: ${roomType.name}. Overbooking alert!`);
      }

      // 3. Find or Create Guest
      let guest = await em.findOne(Guest, {
        where: [
          { tenantId, email: payload.guest.email },
          { tenantId, phone: payload.guest.phone }
        ]
      });

      if (!guest) {
        const newGuest = em.create(Guest, {
          tenantId,
          name: `${payload.guest.firstName} ${payload.guest.lastName}`.trim(),
          email: payload.guest.email,
          phone: payload.guest.phone,
        });
        guest = await em.save(newGuest);
      }

      // 4. Calculate Nights & Subtotal
      const checkIn = new Date(payload.checkInDate);
      const checkOut = new Date(payload.checkOutDate);
      const msPerDay = 86_400_000;
      const numNights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / msPerDay));
      
      const ratePerNight = payload.totalAmount / numNights;
      const taxRate = 0.12; // Standard 12% GST assumption
      const subtotal = payload.totalAmount / (1 + taxRate);
      const taxAmount = payload.totalAmount - subtotal;

      // 5. Create Reservation
      const reservation = em.create(Reservation, {
        tenantId,
        branchId,
        roomId: availableRoom.id,
        primaryGuestId: guest.id,
        numAdults: payload.numAdults,
        numChildren: payload.numChildren,
        checkInDate: payload.checkInDate,
        checkOutDate: payload.checkOutDate,
        status: ReservationStatus.CONFIRMED,
        ratePerNight: Math.round(ratePerNight * 100) / 100,
        numNights,
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: payload.totalAmount,
        balanceDue: payload.totalAmount, // Assuming OTA collects or pays later
        source: BookingSource.OTA,
        bookingRef: payload.channelManagerId,
        notes: 'Auto-synced from Channel Manager',
      });

      const savedReservation = await em.save(reservation);

      // 6. Mark room as reserved
      await em.update(Room, { id: availableRoom.id }, { status: RoomStatus.RESERVED });

      this.logger.log(`Successfully created reservation ${savedReservation.id} for OTA booking ${payload.channelManagerId}`);
      return savedReservation;
    });
  }

  /**
   * Process a cancellation from the Channel Manager webhook
   */
  async processCancellation(tenantId: string, branchId: string, bookingRef: string): Promise<void> {
    this.logger.log(`Processing Channel Manager cancellation: ${bookingRef}`);
    try {
      await this.dataSource.transaction(async (em) => {
        const reservation = await em.findOne(Reservation, {
          where: { tenantId, branchId, bookingRef },
          relations: ['room']
        });

        if (!reservation) {
          this.logger.warn(`Cancellation received for unknown bookingRef: ${bookingRef}`);
          return;
        }

        if (reservation.status === ReservationStatus.CANCELLED) return;

        reservation.status = ReservationStatus.CANCELLED;
        reservation.notes = (reservation.notes ? reservation.notes + '\n' : '') + 'Cancelled via Channel Manager';
        
        await em.save(reservation);

        if (reservation.room && reservation.room.status === RoomStatus.RESERVED) {
          await em.update(Room, { id: reservation.room.id }, { status: RoomStatus.AVAILABLE });
        }
        this.logger.log(`Successfully cancelled reservation ${reservation.id} via OTA`);
      });
    } catch (err: any) {
      this.logger.error(`Error in processCancellation: ${err.message}`, err.stack);
      throw new BadRequestException(`Cancellation failed: ${err.message}`);
    }
  }

  /**
   * Process a modification from the Channel Manager webhook
   */
  async processModification(tenantId: string, branchId: string, payload: IncomingBookingPayload): Promise<Reservation> {
    this.logger.log(`Processing Channel Manager modification: ${payload.channelManagerId}`);
    return this.dataSource.transaction(async (em) => {
      try {
        const reservation = await em.findOne(Reservation, {
          where: { tenantId, branchId, bookingRef: payload.channelManagerId }
        });

        if (!reservation) {
          throw new NotFoundException(`Cannot modify unknown bookingRef: ${payload.channelManagerId}`);
        }

        const checkIn = new Date(payload.checkInDate);
        const checkOut = new Date(payload.checkOutDate);
        const msPerDay = 86_400_000;
        const numNights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / msPerDay));
        
        const ratePerNight = payload.totalAmount / numNights;
        const taxRate = 0.12; 
        const subtotal = payload.totalAmount / (1 + taxRate);
        const taxAmount = payload.totalAmount - subtotal;

        reservation.checkInDate = payload.checkInDate;
        reservation.checkOutDate = payload.checkOutDate;
        reservation.numAdults = payload.numAdults;
        reservation.numChildren = payload.numChildren;
        reservation.numNights = numNights;
        reservation.ratePerNight = Math.round(ratePerNight * 100) / 100;
        reservation.subtotal = Math.round(subtotal * 100) / 100;
        reservation.taxAmount = Math.round(taxAmount * 100) / 100;
        reservation.totalAmount = payload.totalAmount;
        reservation.balanceDue = payload.totalAmount;
        reservation.notes = (reservation.notes ? reservation.notes + '\n' : '') + 'Modified via Channel Manager';

        const saved = await em.save(reservation);
        this.logger.log(`Successfully modified reservation ${reservation.id} via OTA`);
        return saved;
      } catch (err: any) {
        this.logger.error(`Error in processModification: ${err.message}`, err.stack);
        throw new BadRequestException(`Modification failed: ${err.message}`);
      }
    });
  }

  /**
   * Sync inventory BACK to Channel Manager when a booking is created/cancelled natively in DineOS
   */
  async syncInventoryOutbound(tenantId: string, branchId: string, roomTypeId: string) {
    try {
      const roomType = await this.roomTypeRepo.findOne({ where: { id: roomTypeId, tenantId } });
      if (!roomType || !roomType.channelManagerId) {
        return; // Not mapped, skip sync
      }

      // Calculate newly available inventory for this room type
      const availableRooms = await this.roomRepo.count({
        where: { tenantId, branchId, roomType: { id: roomTypeId }, status: RoomStatus.AVAILABLE }
      });

      this.logger.log(`[OUTBOUND SYNC] Pushing inventory to OTA. CM ID: ${roomType.channelManagerId}, Available: ${availableRooms}`);
      
      // In production, this makes an HTTP PATCH request to STAAH/SiteMinder API
      // Example implementation:
      /*
      await fetch('https://api.siteminder.com/v1/inventory', {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer YOUR_OTA_TOKEN`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ roomId: roomType.channelManagerId, count: availableRooms })
      });
      */
    } catch (err: any) {
      this.logger.error(`Failed to push inventory to OTA: ${err.message}`);
    }
  }
}
