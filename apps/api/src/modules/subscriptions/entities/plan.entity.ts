import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', unique: true }) code: string;
  @Column() name: string;
  @Column({ nullable: true, type: 'text' }) description: string;
  @Column({ name: 'price_monthly', type: 'numeric', precision: 10, scale: 2 }) priceMonthly: number;
  @Column({ name: 'price_annual', type: 'numeric', precision: 10, scale: 2, nullable: true }) priceAnnual: number;
  @Column({ name: 'max_branches', type: 'smallint', default: 1 }) maxBranches: number;
  @Column({ name: 'max_users', type: 'smallint', default: 5 }) maxUsers: number;
  @Column({ name: 'max_menu_items', default: 100 }) maxMenuItems: number;
  @Column({ type: 'jsonb', default: [] }) features: string[];
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
