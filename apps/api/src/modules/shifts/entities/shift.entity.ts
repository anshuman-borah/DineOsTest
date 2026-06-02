import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, OneToMany } from 'typeorm';
import { ShiftDenomination } from './shift-denomination.entity';

export enum ShiftStatus { OPEN = 'open', CLOSED = 'closed' }
export enum ShiftDepartment { RESTAURANT = 'restaurant', HOTEL = 'hotel' }

@Entity('shifts')
@Index(['branchId', 'department', 'shiftNumber'], { unique: true })
export class Shift {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'tenant_id' }) tenantId: string;
  @Column({ name: 'branch_id' }) @Index() branchId: string;
  @Column({ name: 'shift_number' }) shiftNumber: string;
  @Column({ type: 'varchar', length: 20, default: ShiftDepartment.RESTAURANT }) department: ShiftDepartment;
  @Column({ type: 'enum', enum: ShiftStatus, default: ShiftStatus.OPEN }) status: ShiftStatus;
  @Column({ name: 'opened_by' }) openedBy: string;
  @Column({ name: 'closed_by', nullable: true }) closedBy: string;
  @Column({ name: 'opening_cash', type: 'numeric', precision: 12, scale: 2, default: 0 }) openingCash: number;
  @Column({ name: 'closing_cash', type: 'numeric', precision: 12, scale: 2, default: 0 }) closingCash: number;
  @Column({ name: 'expected_cash', type: 'numeric', precision: 12, scale: 2, default: 0 }) expectedCash: number;
  @Column({ name: 'cash_difference', type: 'numeric', precision: 12, scale: 2, default: 0 }) cashDifference: number;
  @Column({ name: 'total_sales', type: 'numeric', precision: 12, scale: 2, default: 0 }) totalSales: number;
  @Column({ name: 'total_orders', default: 0 }) totalOrders: number;
  @Column({ name: 'cash_sales', type: 'numeric', precision: 12, scale: 2, default: 0 }) cashSales: number;
  @Column({ name: 'card_sales', type: 'numeric', precision: 12, scale: 2, default: 0 }) cardSales: number;
  @Column({ name: 'upi_sales', type: 'numeric', precision: 12, scale: 2, default: 0 }) upiSales: number;
  @Column({ name: 'wallet_sales', type: 'numeric', precision: 12, scale: 2, default: 0 }) walletSales: number;
  @Column({ name: 'credit_sales', type: 'numeric', precision: 12, scale: 2, default: 0 }) creditSales: number;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 }) complimentary: number;
  @Column({ name: 'total_refund', type: 'numeric', precision: 12, scale: 2, default: 0 }) totalRefund: number;
  @Column({ name: 'total_cgst', type: 'numeric', precision: 12, scale: 2, default: 0 }) totalCgst: number;
  @Column({ name: 'total_sgst', type: 'numeric', precision: 12, scale: 2, default: 0 }) totalSgst: number;
  @Column({ name: 'total_igst', type: 'numeric', precision: 12, scale: 2, default: 0 }) totalIgst: number;
  @Column({ nullable: true, type: 'text' }) notes: string;
  @Column({ name: 'opened_at', default: () => 'now()' }) openedAt: Date;
  @Column({ name: 'closed_at', nullable: true }) closedAt: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @OneToMany(() => ShiftDenomination, (d) => d.shift, { cascade: true }) denominations: ShiftDenomination[];
}
