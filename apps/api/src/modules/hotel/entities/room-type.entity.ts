import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity('hotel_room_types')
@Index(['tenantId', 'branchId'])
export class RoomType {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'tenant_id' }) @Index() tenantId: string;
  @Column({ name: 'branch_id' })              branchId: string;

  @Column({ length: 100 })                    name: string;
  @Column({ nullable: true, type: 'text' })   description: string;

  /** Base rate per night in paise (integer) — avoids floating-point rounding */
  @Column({ name: 'base_rate', type: 'numeric', precision: 12, scale: 2 })
  baseRate: number;

  @Column({ name: 'max_occupancy', type: 'smallint', default: 2 })
  maxOccupancy: number;

  /** e.g. ["AC","WiFi","TV","Mini-bar","Balcony"] */
  @Column({ type: 'jsonb', default: [] })      amenities: string[];

  /** Total rooms of this type (denormalised counter for quick display) */
  @Column({ name: 'total_rooms', type: 'smallint', default: 0 })
  totalRooms: number;

  @Column({ name: 'is_active', default: true }) isActive: boolean;

  /** Used to map this room type to a Channel Manager (e.g. STAAH/SiteMinder) room ID */
  @Column({ name: 'channel_manager_id', length: 100, nullable: true })
  channelManagerId: string;

  @CreateDateColumn({ name: 'created_at' })   createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' })   updatedAt: Date;
}
