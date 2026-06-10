import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OrderItem, KdsStatus } from '../orders/entities/order-item.entity';

const KDS_BUMPED_MARKER = '__KDS_BUMPED__';

@Injectable()
export class KdsService {
  constructor(
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Show all KDS-visible items:
   * - pending / acknowledged / preparing / ready
   * - NOT bumped (void_reason marker)
   * - NOT from served/cancelled/billed/void orders
   */
  async getPendingItems(branchId: string, tenantId: string) {
    return this.dataSource.query(
      `
      SELECT
        oi.id                    AS order_item_id,
        oi.name                  AS item_name,
        oi.quantity,
        oi.notes,
        oi.kds_status,
        oi.created_at,
        oi.kds_ready_at,
        oi.menu_item_id,
        o.id                     AS order_id,
        o.order_number           AS order_order_number,
        o.order_type,
        o.status                 AS order_status,
        t.table_number           AS table_name,
        c.name                   AS category_name,
        EXTRACT(EPOCH FROM (NOW() - oi.created_at))::INT AS age_seconds
      FROM order_items oi
      INNER JOIN orders o    ON o.id  = oi.order_id
      LEFT JOIN tables t     ON t.id  = o.table_id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN categories c  ON c.id  = mi.category_id
      WHERE o.branch_id = $1
        AND o.tenant_id = $2
        AND oi.kds_status IN ('pending', 'acknowledged', 'preparing', 'ready')
        AND oi.is_voided = false
        AND COALESCE(oi.void_reason, '') <> $3
        AND o.status NOT IN ('cancelled', 'billed', 'void', 'served')
      ORDER BY
        CASE oi.kds_status
          WHEN 'pending'      THEN 0
          WHEN 'acknowledged' THEN 1
          WHEN 'preparing'    THEN 2
          WHEN 'ready'        THEN 3
        END ASC,
        oi.created_at ASC
      `,
      [branchId, tenantId, KDS_BUMPED_MARKER],
    );
  }

  /**
   * Normal status transitions:
   * - pending -> preparing
   * - preparing -> ready
   * - recall -> preparing
   */
  async updateItemStatus(itemId: string, status: KdsStatus, tenantId: string) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, tenantId },
      relations: ['order'],
    });
    if (!item) throw new NotFoundException('Order item not found');

    item.kdsStatus = status;
    item.voidReason = null; // clear bump marker

    if (status === KdsStatus.ACKNOWLEDGED || status === KdsStatus.PREPARING) {
      item.kdsAcknowledgedAt = item.kdsAcknowledgedAt || new Date();
    }

    if (status === KdsStatus.READY) {
      item.kdsReadyAt = new Date();
    }

    await this.itemRepo.save(item);

    // When marking ready, check if ALL items in this order are now ready
    if (status === KdsStatus.READY) {
      const orderItems = await this.itemRepo.find({
        where: { orderId: item.orderId, tenantId },
      });

      const allReady = orderItems.every(
        (oi) =>
          oi.id === itemId
            ? true
            : oi.kdsStatus === KdsStatus.READY || oi.isVoided,
      );

      if (allReady) {
        this.events.emit('kds.orderReady', {
          orderId: item.orderId,
          orderNumber: (item as any).order?.orderNumber,
          branchId: (item as any).order?.branchId,
        });
      }
    }

    this.events.emit('kds.itemStatus', {
      itemId,
      orderId: item.orderId,
      status,
      branchId: (item as any).order?.branchId,
    });

    return item;
  }

  /**
   * Bump = hide from KDS without changing DB enum.
   * Keeps status as READY but adds hidden marker in void_reason.
   */
  async bumpItem(itemId: string, tenantId: string) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, tenantId },
      relations: ['order'],
    });
    if (!item) throw new NotFoundException('Order item not found');

    item.kdsStatus = KdsStatus.READY;
    item.kdsReadyAt = item.kdsReadyAt || new Date();
    item.voidReason = KDS_BUMPED_MARKER;

    await this.itemRepo.save(item);

    // Check if ALL items in this order are now bumped
    const orderItems = await this.itemRepo.find({
      where: { orderId: item.orderId, tenantId },
    });

    const allBumped = orderItems.every(
      (oi) =>
        oi.id === itemId
          ? true
          : oi.voidReason === KDS_BUMPED_MARKER || oi.isVoided,
    );

    this.events.emit('kds.itemStatus', {
      itemId,
      orderId: item.orderId,
      status: 'bumped',
      branchId: (item as any).order?.branchId,
      allBumped,
    });

    return item;
  }

  /**
   * Bump ALL items in an order at once.
   * Called when waiter marks "Picked Up & Served" from dashboard.
   */
  async bumpOrderItems(orderId: string, tenantId: string) {
    const items = await this.itemRepo.find({
      where: { orderId, tenantId, isVoided: false },
      relations: ['order'],
    });

    let bumpedCount = 0;

    for (const item of items) {
      if (item.voidReason === KDS_BUMPED_MARKER) continue; // already bumped
      item.kdsStatus = KdsStatus.READY;
      item.kdsReadyAt = item.kdsReadyAt || new Date();
      item.voidReason = KDS_BUMPED_MARKER;
      bumpedCount++;
    }

    if (bumpedCount > 0) {
      await this.itemRepo.save(items);
    }

    const branchId = items[0]?.order?.branchId;

    this.events.emit('kds.orderBumped', {
      orderId,
      branchId,
      bumpedCount,
    });

    return { bumped: bumpedCount };
  }

  /**
   * Recall = bring bumped/ready item back into kitchen flow.
   * Manager/owner only.
   */
  async recallItem(itemId: string, tenantId: string) {
    const item = await this.itemRepo.findOne({
      where: { id: itemId, tenantId },
      relations: ['order'],
    });
    if (!item) throw new NotFoundException('Order item not found');

    item.kdsStatus = KdsStatus.PREPARING;
    item.voidReason = null;

    await this.itemRepo.save(item);

    this.events.emit('kds.itemStatus', {
      itemId,
      orderId: item.orderId,
      status: KdsStatus.PREPARING,
      branchId: (item as any).order?.branchId,
    });

    return item;
  }
}