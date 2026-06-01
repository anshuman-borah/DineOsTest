import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportsService {
  constructor(@InjectDataSource() private readonly db: DataSource) { }

  private assertDate(value: string, name: string): void {
    if (!value || isNaN(new Date(value).getTime())) {
      throw new BadRequestException(
        `Invalid date for '${name}': "${value}". Use ISO 8601 format (YYYY-MM-DD).`,
      );
    }
  }

  private toDateRange(from: string, to: string): { start: string; end: string } {
    return {
      start: `${from}T00:00:00.000+05:30`,
      end: `${to}T23:59:59.999+05:30`,
    };
  }

  // ── Daily Sales ────────────────────────────────────────────────────────────

  async getDailySales(branchId: string, tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    return this.db.query(`
      SELECT
        date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')
          AT TIME ZONE 'Asia/Kolkata'                              AS date,
        COUNT(*)::int                     AS total_bills,
        COALESCE(SUM(grand_total),     0) AS gross_sales,
        COALESCE(SUM(discount_amount), 0) AS total_discount,
        COALESCE(SUM(total_tax),       0) AS total_tax,
        COALESCE(SUM(cgst_amount),     0) AS cgst,
        COALESCE(SUM(sgst_amount),     0) AS sgst,
        COALESCE(SUM(igst_amount),     0) AS igst
      FROM bills
      WHERE branch_id = $1
        AND tenant_id = $2
        AND status NOT IN ('void', 'refunded')
        AND created_at BETWEEN $3 AND $4
      GROUP BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')
      ORDER BY date ASC
    `, [branchId, tenantId, start, end]);
  }

  // ── Item Sales ─────────────────────────────────────────────────────────────

  async getItemSalesReport(branchId: string, tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    return this.db.query(`
      SELECT
        oi.name                                   AS item_name,
        oi.menu_item_id,
        SUM(oi.quantity)::numeric                 AS total_qty,
        COALESCE(SUM(oi.line_total), 0)::numeric  AS total_revenue,
        SUM(
          oi.taxable_amount::numeric
          * (1.0 - COALESCE(
              o.discount_amount::numeric / NULLIF(o.subtotal::numeric, 0), 0
            ))
        )                                         AS taxable,
        COUNT(DISTINCT oi.order_id)::int          AS order_count
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.branch_id  = $1
        AND o.tenant_id  = $2
        AND oi.is_voided = false
        AND o.status     = 'billed'
        AND o.created_at BETWEEN $3 AND $4
      GROUP BY oi.name, oi.menu_item_id
      ORDER BY total_revenue DESC
      LIMIT 100
    `, [branchId, tenantId, start, end]);
  }

  // ── Payment Methods ────────────────────────────────────────────────────────

  async getPaymentMethodReport(branchId: string, tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    return this.db.query(`
      SELECT
        method,
        COUNT(*)::int            AS transaction_count,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM payments
      WHERE branch_id  = $1
        AND tenant_id  = $2
        AND status     = 'success'
        AND created_at BETWEEN $3 AND $4
      GROUP BY method
      ORDER BY total_amount DESC
    `, [branchId, tenantId, start, end]);
  }

  // ── Hourly ─────────────────────────────────────────────────────────────────

  async getHourlyReport(branchId: string, tenantId: string, date: string) {
    this.assertDate(date, 'date');
    const { start, end } = this.toDateRange(date, date);

    return this.db.query(`
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
        COUNT(*)::int                 AS total_bills,
        COALESCE(SUM(grand_total), 0) AS revenue
      FROM bills
      WHERE branch_id = $1
        AND tenant_id = $2
        AND status NOT IN ('void', 'refunded')
        AND created_at BETWEEN $3 AND $4
      GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata')
      ORDER BY hour
    `, [branchId, tenantId, start, end]);
  }

  // ── Category ───────────────────────────────────────────────────────────────

  async getCategoryReport(branchId: string, tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    return this.db.query(`
      SELECT
        COALESCE(c.name, 'Uncategorised') AS category_name,
        SUM(oi.quantity)::numeric          AS total_qty,
        COALESCE(SUM(oi.line_total), 0)   AS total_revenue
      FROM order_items   oi
      JOIN   orders      o  ON o.id  = oi.order_id
      LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
      LEFT JOIN categories  c  ON c.id  = mi.category_id
      WHERE o.branch_id  = $1
        AND o.tenant_id  = $2
        AND oi.is_voided = false
        AND o.status     = 'billed'
        AND o.created_at BETWEEN $3 AND $4
      GROUP BY COALESCE(c.name, 'Uncategorised')
      ORDER BY total_revenue DESC
    `, [branchId, tenantId, start, end]);
  }

  // ── GST Report ─────────────────────────────────────────────────────────────

  async getGstReport(branchId: string, tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    return this.db.query(`
      SELECT
        DATE_TRUNC('month', issued_at AT TIME ZONE 'Asia/Kolkata')
          AT TIME ZONE 'Asia/Kolkata'                              AS month,
        COALESCE(SUM(taxable_amount), 0) AS taxable_value,
        COALESCE(SUM(cgst_amount),    0) AS cgst,
        COALESCE(SUM(sgst_amount),    0) AS sgst,
        COALESCE(SUM(igst_amount),    0) AS igst,
        COALESCE(SUM(cess_amount),    0) AS cess,
        COALESCE(SUM(total_tax),      0) AS total_tax,
        COALESCE(SUM(grand_total),    0) AS gross_value,
        COUNT(*)::int                    AS total_invoices
      FROM bills
      WHERE branch_id = $1
        AND tenant_id = $2
        AND status NOT IN ('void', 'refunded')
        AND issued_at BETWEEN $3 AND $4
      GROUP BY DATE_TRUNC('month', issued_at AT TIME ZONE 'Asia/Kolkata')
      ORDER BY month
    `, [branchId, tenantId, start, end]);
  }

  // ── GSTR-1 Export ──────────────────────────────────────────────────────────

  async getGstr1Export(branchId: string, tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    const bills = await this.db.query(`
      SELECT
        b.bill_number,
        b.issued_at,
        b.customer_name,
        b.customer_phone,
        b.customer_gstin,
        b.supply_type,
        b.taxable_amount,
        b.cgst_amount,
        b.sgst_amount,
        b.igst_amount,
        b.cess_amount,
        b.total_tax,
        b.grand_total,
        b.gst_summary,
        br.name          AS branch_name,
        br.gstin         AS branch_gstin,
        br.address_line1 AS branch_address,
        br.state_code    AS branch_state_code
      FROM bills b
      LEFT JOIN branches br ON br.id = b.branch_id
      WHERE b.branch_id = $1
        AND b.tenant_id = $2
        AND b.status NOT IN ('void', 'refunded')
        AND b.issued_at BETWEEN $3 AND $4
      ORDER BY b.issued_at ASC
    `, [branchId, tenantId, start, end]);

    const b2b: any[] = [];
    const b2c: any[] = [];

    for (const bill of bills) {
      const isInterState = !!bill.customer_gstin;

      const invoiceDate = new Date(bill.issued_at)
        .toLocaleDateString('en-IN', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });

      const items = (bill.gst_summary || []).map((g: any) => ({
        num: 1,
        itm_det: {
          rt: Number(g.gstRate || 0),
          txval: Number(g.taxableAmount || 0),
          camt: isInterState ? 0 : Number(g.cgstAmount || 0),
          samt: isInterState ? 0 : Number(g.sgstAmount || 0),
          iamt: isInterState ? Number(g.igstAmount || 0) : 0,
          csamt: 0,
        },
      }));

      const invoice = {
        inum: bill.bill_number,
        idt: invoiceDate,
        val: Number(bill.grand_total),
        pos: bill.branch_state_code || '27',
        rchrg: 'N',
        inv_typ: isInterState ? 'R' : 'B2CL',
        itms: items,
      };

      if (isInterState) {
        const existing = b2b.find((b: any) => b.ctin === bill.customer_gstin);
        if (existing) {
          existing.inv.push(invoice);
        } else {
          b2b.push({ ctin: bill.customer_gstin, inv: [invoice] });
        }
      } else {
        b2c.push(invoice);
      }
    }

    return {
      gstin: bills[0]?.branch_gstin || '',
      fp: from.slice(0, 7).replace('-', ''),
      version: 'GST3.0.4',
      hash: 'hash',
      b2b,
      b2cs: b2c,
    };
  }

  // ── Shift Report ───────────────────────────────────────────────────────────

  async getShiftReport(branchId: string, tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    return this.db.query(`
      SELECT
        s.id                                                       AS shift_id,
        s.shift_number,
        s.opened_at,
        s.closed_at,
        CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))      AS cashier_name,
        s.opening_cash,
        s.closing_cash,
        s.expected_cash,
        s.cash_difference,
        COALESCE(s.total_sales,   0)                               AS total_sales,
        COALESCE(s.total_orders,  0)                               AS total_orders,
        COALESCE(s.cash_sales,    0)                               AS cash_sales,
        COALESCE(s.card_sales,    0)                               AS card_sales,
        COALESCE(s.upi_sales,     0)                               AS upi_sales,
        COALESCE(s.wallet_sales,  0)                               AS wallet_sales,
        COALESCE(s.credit_sales,  0)                               AS credit_sales,
        COALESCE(s.complimentary, 0)                               AS complimentary,
        COALESCE(s.total_cgst,    0)                               AS total_cgst,
        COALESCE(s.total_sgst,    0)                               AS total_sgst,
        COALESCE(s.total_igst,    0)                               AS total_igst,
        s.status
      FROM shifts s
      LEFT JOIN users u ON u.id = s.opened_by
      WHERE s.branch_id = $1
        AND s.tenant_id = $2
        AND s.opened_at BETWEEN $3 AND $4
      ORDER BY s.opened_at DESC
    `, [branchId, tenantId, start, end]);
  }

  // ── Waiter Report ──────────────────────────────────────────────────────────

  async getWaiterReport(branchId: string, tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    return this.db.query(`
      SELECT
        CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))      AS waiter_name,
        u.id                                                        AS waiter_id,
        u.employee_code,
        COUNT(DISTINCT o.id)::int                                  AS total_orders,
        COALESCE(SUM(o.grand_total), 0)                            AS total_revenue,
        COALESCE(
          SUM(o.grand_total) / NULLIF(COUNT(DISTINCT o.id), 0), 0
        )                                                           AS avg_order_value,
        COUNT(DISTINCT o.id) FILTER (WHERE o.type = 'dine_in')::int
                                                                    AS dine_in_orders,
        COUNT(DISTINCT o.id) FILTER (WHERE o.type = 'takeaway')::int
                                                                    AS takeaway_orders,
        COUNT(DISTINCT o.table_id)                                  AS tables_served,
        COALESCE(AVG(
          EXTRACT(EPOCH FROM (o.billed_at - o.placed_at)) / 60
        ) FILTER (WHERE o.billed_at IS NOT NULL AND o.placed_at IS NOT NULL), 0)
                                                                    AS avg_turnaround_min
      FROM orders o
      JOIN users u ON u.id = o.waiter_id
      WHERE o.branch_id  = $1
        AND o.tenant_id  = $2
        AND o.status     = 'billed'
        AND o.created_at BETWEEN $3 AND $4
      GROUP BY u.id, u.first_name, u.last_name, u.employee_code
      ORDER BY total_revenue DESC
    `, [branchId, tenantId, start, end]);
  }

  // ── Dashboard Summary ──────────────────────────────────────────────────────

  async getDashboardSummary(branchId: string, tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);

    const { start: dayStart, end: dayEnd } = this.toDateRange(today, today);
    const { start: weekStart, end: weekEnd } = this.toDateRange(
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      today,
    );

    const [
      todaySales, weekSales, pendingOrders,
      stockAlerts, orderStats, revLeakage, tableStats,
    ] = await Promise.all([

      this.db.query(`
        SELECT
          COALESCE(SUM(grand_total), 0) AS today_sales,
          COUNT(*)::int                 AS today_bills
        FROM bills
        WHERE branch_id = $1 AND tenant_id = $2
          AND (source = 'pos' OR source IS NULL)
          AND status NOT IN ('void', 'refunded')
          AND created_at BETWEEN $3 AND $4
      `, [branchId, tenantId, dayStart, dayEnd]),

      this.db.query(`
        SELECT COALESCE(SUM(grand_total), 0) AS week_sales
        FROM bills
        WHERE branch_id = $1 AND tenant_id = $2
          AND (source = 'pos' OR source IS NULL)
          AND status NOT IN ('void', 'refunded')
          AND created_at BETWEEN $3 AND $4
      `, [branchId, tenantId, weekStart, weekEnd]),

      this.db.query(`
        SELECT COUNT(*)::int AS pending
        FROM orders
        WHERE branch_id = $1 AND tenant_id = $2
          AND status NOT IN ('billed', 'cancelled')
      `, [branchId, tenantId]),

      this.db.query(`
        SELECT COUNT(*)::int AS low_stock
        FROM inventory_items
        WHERE (branch_id = $1 OR branch_id IS NULL)
          AND tenant_id = $2
          AND current_stock <= min_stock_level
          AND is_active = true
      `, [branchId, tenantId]),

      this.db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'billed' AND NOT is_complimentary)::int AS successful,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int                       AS cancelled,
          COUNT(*) FILTER (WHERE is_complimentary = true)::int                   AS complimentary,
          COUNT(*) FILTER (WHERE is_sales_return  = true)::int                   AS returns
        FROM orders
        WHERE branch_id = $1 AND tenant_id = $2
          AND created_at BETWEEN $3 AND $4
      `, [branchId, tenantId, dayStart, dayEnd]),

      this.db.query(`
        SELECT
          (SELECT COUNT(*)::int
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.branch_id = $1 AND o.tenant_id = $2
             AND oi.is_voided = true
             AND oi.created_at BETWEEN $3 AND $4
          ) AS voided_items,
          (SELECT COUNT(*)::int
           FROM orders
           WHERE branch_id = $1 AND tenant_id = $2
             AND status = 'cancelled'
             AND grand_total > 0
             AND created_at BETWEEN $3 AND $4
          ) AS cancelled_with_value
      `, [branchId, tenantId, dayStart, dayEnd]),

      this.db.query(`
        SELECT COALESCE(AVG(
          EXTRACT(EPOCH FROM (billed_at - placed_at)) / 60
        ), 0) AS avg_turnaround_minutes
        FROM orders
        WHERE branch_id = $1 AND tenant_id = $2
          AND type = 'dine_in'
          AND placed_at IS NOT NULL
          AND billed_at IS NOT NULL
          AND billed_at BETWEEN $3 AND $4
      `, [branchId, tenantId, dayStart, dayEnd]),
    ]);

    return {
      todaySales: Number(todaySales[0]?.today_sales || 0),
      todayBills: Number(todaySales[0]?.today_bills || 0),
      weekSales: Number(weekSales[0]?.week_sales || 0),
      pendingOrders: Number(pendingOrders[0]?.pending || 0),
      lowStockAlerts: Number(stockAlerts[0]?.low_stock || 0),
      orderStats: {
        successful: Number(orderStats[0]?.successful || 0),
        cancelled: Number(orderStats[0]?.cancelled || 0),
        complimentary: Number(orderStats[0]?.complimentary || 0),
        returns: Number(orderStats[0]?.returns || 0),
      },
      revenueLeakage: {
        voidedItems: Number(revLeakage[0]?.voided_items || 0),
        cancelledWithValue: Number(revLeakage[0]?.cancelled_with_value || 0),
      },
      tableStats: {
        avgTurnaroundMinutes: Math.round(
          Number(tableStats[0]?.avg_turnaround_minutes || 0),
        ),
      },
    };
  }

  // ── Hotel Dashboard Summary ────────────────────────────────────────────────

  async getHotelDashboardSummary(branchId: string, tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { start: dayStart, end: dayEnd } = this.toDateRange(today, today);

    const [
      todaySales, weekSales, todayCheckins,
      todayCheckouts, roomsData, weeklyChart,
    ] = await Promise.all([

      this.db.query(`
        SELECT COALESCE(SUM(grand_total), 0) AS revenue, COUNT(*)::int AS count
        FROM bills
        WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id = $2
          AND source = 'hotel'
          AND status NOT IN ('void', 'refunded')
          AND created_at BETWEEN $3 AND $4
      `, [branchId, tenantId, dayStart, dayEnd]),

      this.db.query(`
        SELECT COALESCE(SUM(grand_total), 0) AS revenue
        FROM bills
        WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id = $2
          AND source = 'hotel'
          AND status NOT IN ('void', 'refunded')
          AND created_at >= NOW() - INTERVAL '7 days'
      `, [branchId, tenantId]),

      this.db.query(`
        SELECT COUNT(*)::int AS count
        FROM hotel_reservations
        WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id = $2
          AND check_in_date = $3
          AND status NOT IN ('cancelled', 'no_show')
      `, [branchId, tenantId, today]),

      this.db.query(`
        SELECT COUNT(*)::int AS count
        FROM hotel_reservations
        WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id = $2
          AND check_out_date = $3
          AND status NOT IN ('cancelled', 'no_show')
      `, [branchId, tenantId, today]),

      this.db.query(`
        SELECT
          COUNT(*)::int AS total_rooms,
          COUNT(*) FILTER (WHERE status = 'available')::int AS available_rooms,
          COUNT(*) FILTER (WHERE status = 'occupied')::int AS occupied_rooms,
          COUNT(*) FILTER (WHERE status = 'cleaning')::int AS cleaning_rooms,
          COUNT(*) FILTER (WHERE status = 'reserved')::int AS reserved_rooms,
          COUNT(*) FILTER (WHERE status IN ('maintenance', 'out_of_order'))::int AS maintenance_rooms
        FROM hotel_rooms
        WHERE ($1::uuid IS NULL OR branch_id = $1) 
          AND tenant_id = $2 
          AND (is_active = true OR is_active IS NULL)
      `, [branchId, tenantId]),

      this.db.query(`
        SELECT
          TO_CHAR(date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), 'Mon DD') AS date,
          COALESCE(SUM(grand_total), 0) AS revenue
        FROM bills
        WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id = $2
          AND source = 'hotel'
          AND status NOT IN ('void', 'refunded')
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')
        ORDER BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata') ASC
      `, [branchId, tenantId]),
    ]);

    const totalRooms = Number(roomsData[0]?.total_rooms || 0);
    const occupiedRooms = Number(roomsData[0]?.occupied_rooms || 0);
    const occupancyRate = totalRooms > 0
      ? Math.round((occupiedRooms / totalRooms) * 100)
      : 0;

    const todayRev = Number(todaySales[0]?.revenue || 0);
    const adr = occupiedRooms > 0 ? todayRev / occupiedRooms : 0;

    return {
      todaySales: todayRev,
      todayBills: Number(todaySales[0]?.count || 0),
      weekSales: Number(weekSales[0]?.revenue || 0),
      todayCheckins: Number(todayCheckins[0]?.count || 0),
      todayCheckouts: Number(todayCheckouts[0]?.count || 0),
      occupancyRate,
      adr: Math.round(adr),
      roomStats: {
        total: totalRooms,
        available: Number(roomsData[0]?.available_rooms || 0),
        occupied: occupiedRooms,
        cleaning: Number(roomsData[0]?.cleaning_rooms || 0),
        reserved: Number(roomsData[0]?.reserved_rooms || 0),
        maintenance: Number(roomsData[0]?.maintenance_rooms || 0),
      },
      weeklyChart: weeklyChart.map((r: any) => ({
        date: r.date,
        revenue: Number(r.revenue || 0),
      })),
    };
  }

  // ── Owner Dashboard Summary ────────────────────────────────────────────────

  async getOwnerDashboardSummary(branchId: string | null, tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { start: dayStart, end: dayEnd } = this.toDateRange(today, today);

    const [
      totalRevToday, totalRevWeek, posSalesToday, hotelSalesToday,
      pendingOrders, occupancy, checkins, checkouts,
      weeklyChart, paymentBreakdown, lowStock, branchComparison
    ] = await Promise.all([
      // Total revenue today (POS + Hotel combined)
      this.db.query(`
        SELECT COALESCE(SUM(grand_total),0) AS revenue, COUNT(*) AS bills
        FROM bills WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2
        AND status NOT IN ('void','refunded')
        AND created_at BETWEEN $3 AND $4
      `, [branchId || null, tenantId, dayStart, dayEnd]),

      // Total revenue 7 days (POS + Hotel combined)
      this.db.query(`
        SELECT COALESCE(SUM(grand_total),0) AS revenue
        FROM bills WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2
        AND status NOT IN ('void','refunded')
        AND created_at >= NOW() - INTERVAL '7 days'
      `, [branchId || null, tenantId]),

      // POS-only today
      this.db.query(`
        SELECT COALESCE(SUM(grand_total),0) AS revenue, COUNT(*) AS bills
        FROM bills WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2 
        AND (source = 'pos' OR source IS NULL)
        AND status NOT IN ('void','refunded')
        AND created_at BETWEEN $3 AND $4
      `, [branchId || null, tenantId, dayStart, dayEnd]),

      // Hotel-only today
      this.db.query(`
        SELECT COALESCE(SUM(grand_total),0) AS revenue, COUNT(*) AS bills
        FROM bills WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2 
        AND source = 'hotel'
        AND status NOT IN ('void','refunded')
        AND created_at BETWEEN $3 AND $4
      `, [branchId || null, tenantId, dayStart, dayEnd]),

      // Pending orders
      this.db.query(`
        SELECT COUNT(*) AS count
        FROM orders WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2
        AND status NOT IN ('billed','cancelled')
      `, [branchId || null, tenantId]),

      // Occupancy
      this.db.query(`
        SELECT
          (SELECT COUNT(*) FROM hotel_rooms WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2 AND status != 'out_of_order') AS total_rooms,
          (SELECT COUNT(*) FROM hotel_reservations WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2 AND status = 'checked_in') AS occupied_rooms
      `, [branchId || null, tenantId]),

      // Today's check-ins
      this.db.query(`
        SELECT COUNT(*) AS count
        FROM hotel_reservations WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2
        AND check_in_date=$3 AND status NOT IN ('cancelled','no_show')
      `, [branchId || null, tenantId, today]),

      // Today's check-outs
      this.db.query(`
        SELECT COUNT(*) AS count
        FROM hotel_reservations WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2
        AND check_out_date=$3 AND status NOT IN ('cancelled','no_show')
      `, [branchId || null, tenantId, today]),

      // Weekly chart (POS + Hotel stacked by day)
      this.db.query(`
        SELECT
          TO_CHAR(date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), 'Mon DD') AS date,
          COALESCE(SUM(grand_total) FILTER (WHERE source='pos' OR source IS NULL), 0) AS pos,
          COALESCE(SUM(grand_total) FILTER (WHERE source='hotel'), 0) AS hotel,
          COALESCE(SUM(grand_total), 0) AS total
        FROM bills
        WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2
        AND status NOT IN ('void','refunded')
        AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')
        ORDER BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata') ASC
      `, [branchId || null, tenantId]),

      // Payment method breakdown today
      this.db.query(`
        SELECT method, COALESCE(SUM(amount),0) AS total
        FROM payments
        WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2
        AND status='success'
        AND created_at BETWEEN $3 AND $4
        GROUP BY method ORDER BY total DESC
      `, [branchId || null, tenantId, dayStart, dayEnd]),

      // Low stock count
      this.db.query(`
        SELECT COUNT(*) AS count
        FROM inventory_items
        WHERE ($1::uuid IS NULL OR branch_id = $1) AND tenant_id=$2
        AND current_stock <= min_stock_level AND is_active=true
      `, [branchId || null, tenantId]),

      // Branch Comparison (only meaningful in global mode)
      branchId ? Promise.resolve([]) : this.db.query(`
        SELECT b.name AS branch_name, COALESCE(SUM(bills.grand_total), 0) AS revenue
        FROM branches b
        LEFT JOIN bills ON bills.branch_id = b.id 
          AND bills.status NOT IN ('void','refunded') 
          AND bills.created_at >= NOW() - INTERVAL '7 days'
        WHERE b.tenant_id=$1
        GROUP BY b.id, b.name
        ORDER BY revenue DESC
      `, [tenantId]),
    ]);

    const totalRooms = Number(occupancy[0]?.total_rooms || 0);
    const occupiedRooms = Number(occupancy[0]?.occupied_rooms || 0);
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;

    return {
      totalRevenueToday: Number(totalRevToday[0]?.revenue || 0),
      totalBillsToday: Number(totalRevToday[0]?.bills || 0),
      totalRevenueWeek: Number(totalRevWeek[0]?.revenue || 0),
      posRevenueToday: Number(posSalesToday[0]?.revenue || 0),
      posBillsToday: Number(posSalesToday[0]?.bills || 0),
      hotelRevenueToday: Number(hotelSalesToday[0]?.revenue || 0),
      hotelBillsToday: Number(hotelSalesToday[0]?.bills || 0),
      pendingOrders: Number(pendingOrders[0]?.count || 0),
      occupancyRate,
      todayCheckins: Number(checkins[0]?.count || 0),
      todayCheckouts: Number(checkouts[0]?.count || 0),
      lowStockAlerts: Number(lowStock[0]?.count || 0),
      weeklyChart: (weeklyChart || []).map((r: any) => ({
        date: r.date,
        pos: Number(r.pos || 0),
        hotel: Number(r.hotel || 0),
        total: Number(r.total || 0),
      })),
      paymentBreakdown: (paymentBreakdown || []).map((r: any) => ({
        method: r.method,
        total: Number(r.total || 0),
      })),
      branchComparison: (branchComparison || []).map((r: any) => ({
        name: r.branch_name,
        revenue: Number(r.revenue || 0),
      })),
    };
  }

  // ── Branch Performance ──────────────────────────────────────────────────────

  async getBranchPerformance(tenantId: string, from: string, to: string) {
    this.assertDate(from, 'from');
    this.assertDate(to, 'to');
    const { start, end } = this.toDateRange(from, to);

    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffDays = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000));
    const prevEnd = new Date(fromDate.getTime() - 86_400_000).toISOString().slice(0, 10);
    const prevStart = new Date(fromDate.getTime() - diffDays * 86_400_000).toISOString().slice(0, 10);
    const { start: pStart, end: pEnd } = this.toDateRange(prevStart, prevEnd);

    const [branches, current, previous] = await Promise.all([
      this.db.query(
        `SELECT id, name, code, type, city, is_hq
         FROM branches
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY is_hq DESC, name ASC`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           b.id AS branch_id,
           COALESCE(SUM(bi.grand_total),0)::numeric AS revenue,
           COUNT(DISTINCT bi.id)::int                AS bills,
           COALESCE(SUM(bi.grand_total) FILTER (WHERE bi.source='pos' OR bi.source IS NULL),0) AS pos_revenue,
           COALESCE(SUM(bi.grand_total) FILTER (WHERE bi.source='hotel'),0)                    AS hotel_revenue,
           COUNT(DISTINCT o.id)::int                 AS orders
         FROM branches b
         LEFT JOIN bills  bi ON bi.branch_id = b.id
           AND bi.tenant_id = $1
           AND bi.status NOT IN ('void','refunded')
           AND bi.created_at BETWEEN $2 AND $3
         LEFT JOIN orders o ON o.branch_id = b.id
           AND o.tenant_id = $1
           AND o.status = 'billed'
           AND o.created_at BETWEEN $2 AND $3
         WHERE b.tenant_id = $1 AND b.is_active = true
         GROUP BY b.id`,
        [tenantId, start, end],
      ),
      this.db.query(
        `SELECT
           b.id AS branch_id,
           COALESCE(SUM(bi.grand_total),0)::numeric AS revenue
         FROM branches b
         LEFT JOIN bills bi ON bi.branch_id = b.id
           AND bi.tenant_id = $1
           AND bi.status NOT IN ('void','refunded')
           AND bi.created_at BETWEEN $2 AND $3
         WHERE b.tenant_id = $1 AND b.is_active = true
         GROUP BY b.id`,
        [tenantId, pStart, pEnd],
      ),
    ]);

    const currMap: Record<string, any> = {};
    for (const r of current) currMap[r.branch_id] = r;

    const prevMap: Record<string, any> = {};
    for (const r of previous) prevMap[r.branch_id] = r;

    const branchList = branches.map((b: any) => {
      const c = currMap[b.id] || {};
      const p = prevMap[b.id] || {};
      const rev = Number(c.revenue || 0);
      const prevRev = Number(p.revenue || 0);
      const growthPct = prevRev > 0 ? Math.round(((rev - prevRev) / prevRev) * 100) : null;
      return {
        branchId: b.id,
        branchName: b.name,
        branchCode: b.code,
        type: b.type,
        city: b.city,
        isHq: b.is_hq,
        revenue: rev,
        posRevenue: Number(c.pos_revenue || 0),
        hotelRevenue: Number(c.hotel_revenue || 0),
        bills: Number(c.bills || 0),
        orders: Number(c.orders || 0),
        growthPct,
      };
    });

    branchList.sort((a: any, b: any) => b.revenue - a.revenue);

    const totalRevenue = branchList.reduce((s: number, b: any) => s + b.revenue, 0);
    const totalOrders = branchList.reduce((s: number, b: any) => s + b.orders, 0);
    const totalBills = branchList.reduce((s: number, b: any) => s + b.bills, 0);
    const avgRevenue = branchList.length > 0 ? Math.round(totalRevenue / branchList.length) : 0;

    return {
      totalBranches: branchList.length,
      totalRevenue,
      totalOrders,
      totalBills,
      avgRevenue,
      topBranch: branchList[0] || null,
      branches: branchList,
      period: { from, to, prevFrom: prevStart, prevTo: prevEnd },
    };
  }

  // ── Branch Summary (Branch Manager Dashboard) ───────────────────────────────

  async getBranchSummary(branchId: string | null, tenantId: string, from?: string, to?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const rangeFrom = from || today;
    const rangeTo = to || today;
    const monthStart = `${today.slice(0, 7)}-01`;
    const { start: rangeStart, end: rangeEnd } = this.toDateRange(rangeFrom, rangeTo);
    const { start: monthS, end: monthE } = this.toDateRange(monthStart, today);
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
    const { start: weekS, end: weekE } = this.toDateRange(weekAgo, today);
    const { start: dayStart, end: dayEnd } = this.toDateRange(today, today);

    // Use null-safe branch filter so owners in global mode (branchId=null) get aggregate data
    const bid = branchId || null;

    const [
      revenueToday, revenueMonth, revenueWeek,
      restaurantToday, hotelToday,
      ordersToday, billsToday,
      openShifts,
      lowStock,
      hotel,
      housekeepingPending,
      staff,
      paymentBreakdown,
      weeklyChart,
    ] = await Promise.all([

      // Total revenue for selected range (POS + Hotel)
      this.db.query(
        `SELECT COALESCE(SUM(grand_total),0) AS revenue, COUNT(*)::int AS bills
       FROM bills WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2
       AND status NOT IN ('void','refunded') AND created_at BETWEEN $3 AND $4`,
        [bid, tenantId, rangeStart, rangeEnd],
      ),

      // Monthly revenue
      this.db.query(
        `SELECT COALESCE(SUM(grand_total),0) AS revenue
       FROM bills WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2
       AND status NOT IN ('void','refunded') AND created_at BETWEEN $3 AND $4`,
        [bid, tenantId, monthS, monthE],
      ),

      // 7-day revenue
      this.db.query(
        `SELECT COALESCE(SUM(grand_total),0) AS revenue
       FROM bills WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2
       AND status NOT IN ('void','refunded') AND created_at BETWEEN $3 AND $4`,
        [bid, tenantId, weekS, weekE],
      ),

      // Restaurant revenue for selected range
      this.db.query(
        `SELECT COALESCE(SUM(grand_total),0) AS revenue, COUNT(*)::int AS bills
       FROM bills WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2
       AND (source='pos' OR source IS NULL)
       AND status NOT IN ('void','refunded') AND created_at BETWEEN $3 AND $4`,
        [bid, tenantId, rangeStart, rangeEnd],
      ),

      // Hotel revenue for selected range
      this.db.query(
        `SELECT COALESCE(SUM(grand_total),0) AS revenue, COUNT(*)::int AS bills
       FROM bills WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2
       AND source='hotel'
       AND status NOT IN ('void','refunded') AND created_at BETWEEN $3 AND $4`,
        [bid, tenantId, rangeStart, rangeEnd],
      ),

      // Restaurant: orders for selected range
      this.db.query(
        `SELECT
         COUNT(*)::int                                       AS total_orders,
         COUNT(*) FILTER (WHERE status='billed')::int       AS billed_orders,
         COUNT(*) FILTER (WHERE status NOT IN ('billed','cancelled'))::int AS pending_orders,
         COALESCE(AVG(grand_total) FILTER (WHERE status='billed'), 0) AS avg_order_value
       FROM orders WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2 AND created_at BETWEEN $3 AND $4`,
        [bid, tenantId, rangeStart, rangeEnd],
      ),

      // Bills for selected range
      this.db.query(
        `SELECT COUNT(*)::int AS bills
       FROM bills WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2
       AND created_at BETWEEN $3 AND $4`,
        [bid, tenantId, rangeStart, rangeEnd],
      ),

      // Open shifts
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM shifts
       WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2 AND status='open'`,
        [bid, tenantId],
      ),

      // Low stock alerts
      this.db.query(
        `SELECT COUNT(*)::int AS count FROM inventory_items
       WHERE ($1::uuid IS NULL OR branch_id=$1 OR branch_id IS NULL) AND tenant_id=$2
       AND current_stock <= min_stock_level AND is_active=true`,
        [bid, tenantId],
      ),

      // Hotel: reservations today, check-ins, check-outs, occupancy
      this.db.query(
        `SELECT
         COUNT(*) FILTER (WHERE check_in_date=$3 AND status NOT IN ('cancelled','no_show'))::int  AS reservations_today,
         COUNT(*) FILTER (WHERE check_in_date=$3 AND status NOT IN ('cancelled','no_show'))::int  AS checkins_today,
         COUNT(*) FILTER (WHERE check_out_date=$3 AND status NOT IN ('cancelled','no_show'))::int AS checkouts_today,
         COUNT(*) FILTER (WHERE status='checked_in')::int                                          AS in_house,
         (SELECT COUNT(*)::int FROM hotel_rooms WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2 AND is_active=true)                     AS total_rooms,
         (SELECT COUNT(*) FILTER (WHERE status='available')::int FROM hotel_rooms WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2 AND is_active=true) AS available_rooms
       FROM hotel_reservations WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2`,
        [bid, tenantId, today],
      ),

      // Housekeeping tasks pending
      this.db.query(
        `SELECT COUNT(*)::int AS pending
       FROM hotel_housekeeping_tasks
       WHERE ($1::uuid IS NULL OR branch_id=$1)
         AND tenant_id=$2
         AND status = 'pending'
         AND scheduled_for = $3`,
        [bid, tenantId, today],
      ),

      // Staff counts by role
      this.db.query(
        `SELECT role, COUNT(*)::int AS count
       FROM users WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2 AND is_active=true
       GROUP BY role`,
        [bid, tenantId],
      ),

      // Payment breakdown for selected range
      this.db.query(
        `SELECT method, COALESCE(SUM(amount),0) AS total, COUNT(*)::int AS txns
       FROM payments WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2
       AND status='success' AND created_at BETWEEN $3 AND $4
       GROUP BY method ORDER BY total DESC`,
        [bid, tenantId, rangeStart, rangeEnd],
      ),

      // Revenue chart for selected range
      this.db.query(
        `SELECT
         TO_CHAR(date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), 'Mon DD') AS date,
         COALESCE(SUM(grand_total) FILTER (WHERE source='pos' OR source IS NULL), 0) AS pos,
         COALESCE(SUM(grand_total) FILTER (WHERE source='hotel'), 0)                 AS hotel,
         COALESCE(SUM(grand_total), 0)                                               AS total
       FROM bills WHERE ($1::uuid IS NULL OR branch_id=$1) AND tenant_id=$2
       AND status NOT IN ('void','refunded')
       AND created_at BETWEEN $3 AND $4
       GROUP BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata')
       ORDER BY date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata') ASC`,
        [bid, tenantId, rangeStart, rangeEnd],
      ),
    ]);

    // Staff map
    const staffMap: Record<string, number> = {};
    for (const r of staff) staffMap[r.role] = Number(r.count);
    const totalStaff = staff.reduce((s: number, r: any) => s + Number(r.count), 0);

    const hotelRow = hotel[0] || {};
    const totalRooms = Number(hotelRow.total_rooms || 0);
    const inHouse = Number(hotelRow.in_house || 0);
    const occupancyPct = totalRooms > 0 ? Math.round((inHouse / totalRooms) * 100) : 0;

    return {
      branch: { id: branchId },
      period: { from: rangeFrom, to: rangeTo },
      revenue: {
        total: Number(revenueToday[0]?.revenue || 0),
        week: Number(revenueWeek[0]?.revenue || 0),
        month: Number(revenueMonth[0]?.revenue || 0),
        restaurant: Number(restaurantToday[0]?.revenue || 0),
        hotel: Number(hotelToday[0]?.revenue || 0),
        totalBills: Number(revenueToday[0]?.bills || 0),
      },
      restaurant: {
        ordersToday: Number(ordersToday[0]?.total_orders || 0),
        billedOrders: Number(ordersToday[0]?.billed_orders || 0),
        pendingOrders: Number(ordersToday[0]?.pending_orders || 0),
        billsToday: Number(billsToday[0]?.bills || 0),
        avgOrderValue: Math.round(Number(ordersToday[0]?.avg_order_value || 0)),
        openShifts: Number(openShifts[0]?.count || 0),
        lowStockItems: Number(lowStock[0]?.count || 0),
      },
      hotel: {
        reservationsToday: Number(hotelRow.reservations_today || 0),
        checkinsToday: Number(hotelRow.checkins_today || 0),
        checkoutsToday: Number(hotelRow.checkouts_today || 0),
        inHouse,
        totalRooms,
        availableRooms: Number(hotelRow.available_rooms || 0),
        occupancyPct,
        housekeepingPending: Number(housekeepingPending[0]?.pending || 0),
      },
      staff: {
        total: totalStaff,
        managers: (staffMap['manager'] || 0) + (staffMap['restaurant_manager'] || 0) + (staffMap['hotel_manager'] || 0),
        cashiers: staffMap['cashier'] || 0,
        waiters: staffMap['waiter'] || 0,
        kitchen: staffMap['kitchen'] || 0,
        housekeeping: staffMap['housekeeping'] || 0,
        receptionist: staffMap['receptionist'] || 0,
        byRole: staffMap,
      },
      paymentBreakdown: paymentBreakdown.map((r: any) => ({
        method: r.method,
        total: Number(r.total),
        txns: Number(r.txns),
      })),
      weeklyChart: weeklyChart.map((r: any) => ({
        date: r.date,
        pos: Number(r.pos || 0),
        hotel: Number(r.hotel || 0),
        total: Number(r.total || 0),
      })),
      alerts: {
        lowStock: Number(lowStock[0]?.count || 0),
        openShifts: Number(openShifts[0]?.count || 0),
        housekeepingPending: Number(housekeepingPending[0]?.pending || 0),
      },
    };
  }
}