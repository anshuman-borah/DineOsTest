import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum BranchType { RESTAURANT = 'restaurant', HOTEL = 'hotel', HOTEL_AND_RESTAURANT = 'hotel_and_restaurant', CAFE = 'cafe', BAKERY = 'bakery', CLOUD_KITCHEN = 'cloud_kitchen' }

@Entity('branches')
@Index(['tenantId', 'code'], { unique: true })
export class Branch {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) @Index() tenantId: string;
  @Column() name: string;
  @Column() code: string;
  @Column({ type: 'enum', enum: BranchType, default: BranchType.RESTAURANT }) type: BranchType;
  @Column({ nullable: true }) gstin: string;
  @Column({ name: 'fssai_no', nullable: true }) fssaiNo: string;
  @Column({ name: 'address_line1', nullable: true, type: 'text' }) addressLine1: string;
  @Column({ nullable: true }) city: string;
  @Column({ nullable: true }) state: string;
  @Column({ name: 'state_code', nullable: true, length: 2 }) stateCode: string;
  @Column({ nullable: true }) pincode: string;
  @Column({ nullable: true }) phone: string;
  @Column({ nullable: true }) email: string;
  @Column({ default: 'Asia/Kolkata' }) timezone: string;
  @Column({ default: 'INR' }) currency: string;
  @Column({ name: 'is_hq', default: false }) isHq: boolean;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ type: 'jsonb', default: {} }) settings: Record<string, any>;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
