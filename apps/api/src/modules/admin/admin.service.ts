import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Plan } from '../subscriptions/entities/plan.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(Plan) private readonly planRepo: Repository<Plan>,
  ) {}

  // ── Platform-wide stats ──────────────────────────────────────────────────

  async getStats() {
    const [tenants, orders, revenue, activeToday] = await Promise.all([
      this.db.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active FROM tenants WHERE slug != '_system'`),
      this.db.query(`SELECT COUNT(*) AS total FROM orders WHERE created_at >= NOW() - INTERVAL '30 days'`),
      this.db.query(`SELECT COALESCE(SUM(grand_total),0) AS mrr FROM bills WHERE created_at >= DATE_TRUNC('month', NOW()) AND status != 'void'`),
      this.db.query(`SELECT COUNT(DISTINCT tenant_id) AS count FROM orders WHERE created_at >= NOW() - INTERVAL '1 day'`),
    ]);

    const [subStats] = await this.db.query(`
      SELECT
        SUM(CASE WHEN s.status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN s.status = 'trial'  THEN 1 ELSE 0 END) AS trial,
        SUM(CASE WHEN s.status = 'past_due' OR s.status = 'cancelled' THEN 1 ELSE 0 END) AS churned
      FROM subscriptions s
      JOIN tenants t ON t.id = s.tenant_id
      WHERE t.slug != '_system'
    `);

    return {
      tenants: {
        total:  parseInt(tenants[0].total),
        active: parseInt(tenants[0].active),
      },
      subscriptions: {
        active:  parseInt(subStats.active || 0),
        trial:   parseInt(subStats.trial || 0),
        churned: parseInt(subStats.churned || 0),
      },
      orders30d:   parseInt(orders[0].total),
      activeToday: parseInt(activeToday[0].count),
      mrr:         parseFloat(revenue[0].mrr),
    };
  }

  // ── Tenant list ──────────────────────────────────────────────────────────

  async listTenants(page = 1, limit = 20, search?: string) {
    const offset = (page - 1) * limit;
    const searchClause = search
      ? `AND (t.name ILIKE $3 OR t.email ILIKE $3 OR t.slug ILIKE $3)`
      : '';
    const params: any[] = [limit, offset, ...(search ? [`%${search}%`] : [])];

    const rows = await this.db.query(`
      SELECT
        t.id, t.name, t.slug, t.email, t.phone, t.address,
        t.is_active, t.created_at,
        s.status  AS sub_status,
        s.trial_ends_at,
        p.name    AS plan_name,
        p.price_monthly,
        (SELECT COUNT(*) FROM users   u WHERE u.tenant_id = t.id AND u.is_active) AS user_count,
        (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id)                AS branch_count,
        (SELECT COUNT(*) FROM orders  o WHERE o.tenant_id = t.id AND o.created_at >= NOW() - INTERVAL '30 days') AS orders_30d
      FROM tenants t
      LEFT JOIN LATERAL (
        SELECT status, trial_ends_at, plan_id
        FROM subscriptions
        WHERE tenant_id = t.id
        ORDER BY created_at DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN plans p ON p.id = s.plan_id
      WHERE t.slug != '_system' ${searchClause}
      ORDER BY t.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    const [{ count }] = await this.db.query(
      `SELECT COUNT(*) FROM tenants t WHERE t.slug != '_system' ${searchClause}`,
      search ? [`%${search}%`] : [],
    );

    return { data: rows, total: parseInt(count), page, limit };
  }

  // ── Tenant detail ────────────────────────────────────────────────────────

  async getTenant(id: string) {
    const [tenant] = await this.db.query(`
      SELECT
        t.id, t.name, t.slug, t.email, t.phone, t.gstin, t.address,
        t.logo_url, t.settings, t.is_active, t.created_at, t.updated_at,
        s.status AS sub_status, s.trial_ends_at, s.current_period_end,
        p.name AS plan_name, p.price_monthly, p.max_branches, p.max_users,
        (SELECT COUNT(*) FROM users   u WHERE u.tenant_id = t.id AND u.is_active)    AS user_count,
        (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id)                   AS branch_count,
        (SELECT COUNT(*) FROM orders  o WHERE o.tenant_id = t.id)                    AS total_orders,
        (SELECT COALESCE(SUM(grand_total),0) FROM bills b WHERE b.tenant_id = t.id AND b.status != 'void') AS total_revenue
      FROM tenants t
      LEFT JOIN subscriptions s ON s.tenant_id = t.id
      LEFT JOIN plans p ON p.id = s.plan_id
      WHERE t.id = $1
    `, [id]);

    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  // ── Suspend / activate tenant ────────────────────────────────────────────

  async setTenantActive(id: string, isActive: boolean) {
    await this.db.query(
      `UPDATE tenants SET is_active = $1, updated_at = NOW() WHERE id = $2`,
      [isActive, id],
    );
    return { success: true, isActive };
  }

  // ── Change subscription plan (manual override) ───────────────────────────

  async changePlan(tenantId: string, planCode: string, status: string) {
    const [plan] = await this.db.query(`SELECT id FROM plans WHERE code = $1`, [planCode]);
    if (!plan) throw new NotFoundException(`Plan '${planCode}' not found`);

    await this.db.query(`
      UPDATE subscriptions
      SET plan_id = $1, status = $2, updated_at = NOW()
      WHERE tenant_id = $3
    `, [plan.id, status, tenantId]);

    return { success: true };
  }

  // ── Subscription overview ────────────────────────────────────────────────

  async getSubscriptions(page = 1, limit = 25, status?: string, search?: string) {
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [limit, offset];

    if (status) {
      params.push(status);
      conditions.push(`s.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(t.name ILIKE $${params.length} OR t.email ILIKE $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await this.db.query(`
      SELECT
        t.id AS tenant_id, t.name, t.email,
        s.status      AS sub_status,
        s.trial_ends_at,
        s.current_period_start,
        s.current_period_end,
        p.name        AS plan_name,
        p.price_monthly AS mrr
      FROM subscriptions s
      JOIN tenants t ON t.id = s.tenant_id
      LEFT JOIN plans p ON p.id = s.plan_id
      ${where}
      ORDER BY
        CASE s.status
          WHEN 'active'   THEN 1
          WHEN 'trial'    THEN 2
          WHEN 'past_due' THEN 3
          ELSE 4
        END,
        t.name
      LIMIT $1 OFFSET $2
    `, params);

    // Count query — reuse same conditions but replace LIMIT/OFFSET params
    const countParams = params.slice(2); // skip $1 and $2 (limit/offset)
    const countConditions: string[] = [];
    if (status) countConditions.push(`s.status = $${countConditions.length + 1}`);
    if (search) countConditions.push(`(t.name ILIKE $${countConditions.length + 1} OR t.email ILIKE $${countConditions.length + 1})`);
    const countWhere = countConditions.length ? `WHERE ${countConditions.join(' AND ')}` : '';

    const [{ count }] = await this.db.query(`
      SELECT COUNT(*) FROM subscriptions s
      JOIN tenants t ON t.id = s.tenant_id
      ${countWhere}
    `, countParams);

    return { data: rows, total: parseInt(count), page, limit };
  }

  // ── Create tenant ────────────────────────────────────────────────────────

  async createTenant(dto: {
    name: string; email: string; phone?: string;
    businessType?: string; planCode?: string;
    ownerName?: string; ownerPassword?: string;
  }) {
    // Check email uniqueness
    const [existing] = await this.db.query(`SELECT id FROM tenants WHERE email = $1`, [dto.email]);
    if (existing) throw new ConflictException('A business with this email already exists');

    const slug = dto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      + '-' + Math.random().toString(36).slice(2, 6);

    return this.db.transaction(async (em) => {
      // Create tenant
      const [tenant] = await em.query(`
        INSERT INTO tenants (name, slug, email, phone, is_active)
        VALUES ($1, $2, $3, $4, true)
        RETURNING id, name, slug, email
      `, [dto.name, slug, dto.email, dto.phone ?? null]);

      // Create HQ branch
      const [branch] = await em.query(`
        INSERT INTO branches (tenant_id, name, code, is_hq, is_active)
        VALUES ($1, $2, 'HQ', true, true)
        RETURNING id
      `, [tenant.id, dto.name]);

      // Attach a trial subscription
      const planCode = dto.planCode ?? 'starter';
      const [plan] = await em.query(`SELECT id FROM plans WHERE code = $1`, [planCode]);
      if (plan) {
        await em.query(`
          INSERT INTO subscriptions (tenant_id, plan_id, status, trial_ends_at)
          VALUES ($1, $2, 'trial', NOW() + INTERVAL '14 days')
        `, [tenant.id, plan.id]);
      }

      // Create owner account if credentials provided
      if (dto.ownerName && dto.ownerPassword) {
        const hash = await bcrypt.hash(dto.ownerPassword, 12);
        const [firstName, ...rest] = dto.ownerName.trim().split(' ');
        await em.query(`
          INSERT INTO users (tenant_id, branch_id, email, password_hash, first_name, last_name, role)
          VALUES ($1, $2, $3, $4, $5, $6, 'owner')
        `, [tenant.id, branch.id, dto.email, hash, firstName, rest.join(' ') || null]);
      }

      return { ...tenant, branchId: branch.id };
    });
  }

  // ── Delete tenant ─────────────────────────────────────────────────────────

  async deleteTenant(id: string) {
    const [tenant] = await this.db.query(`SELECT id, slug FROM tenants WHERE id = $1`, [id]);
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.slug === '_system') throw new ConflictException('Cannot delete the system tenant');

    // Cascade deletes handle child records via FK ON DELETE CASCADE
    await this.db.query(`DELETE FROM tenants WHERE id = $1`, [id]);
    return { success: true };
  }

  // ── Recent activity log ───────────────────────────────────────────────────

  async getRecentActivity(limit = 50) {
    // Aggregate recent significant events: new tenants, orders, plan changes
    const [orders, newTenants] = await Promise.all([
      this.db.query(`
        SELECT
          'order_created' AS event_type,
          o.id,
          t.name          AS tenant_name,
          NULL            AS actor_email,
          'Order #' || o.order_number AS detail,
          o.created_at
        FROM orders o
        JOIN tenants t ON t.id = o.tenant_id
        ORDER BY o.created_at DESC
        LIMIT $1
      `, [Math.ceil(limit * 0.7)]),

      this.db.query(`
        SELECT
          'tenant_registered' AS event_type,
          t.id,
          t.name              AS tenant_name,
          t.email             AS actor_email,
          'Joined the platform' AS detail,
          t.created_at
        FROM tenants t
        ORDER BY t.created_at DESC
        LIMIT $1
      `, [Math.ceil(limit * 0.3)]),
    ]);

    // Merge and sort by created_at desc, return top `limit` rows
    const merged = [...orders, ...newTenants]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    return { data: merged, total: merged.length };
  }

  // ── Orders trend (last 30 days, daily) ───────────────────────────────────

  async getOrdersTrend() {
    const rows = await this.db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'DD Mon') AS date,
        COUNT(*) AS orders,
        COALESCE(SUM(grand_total), 0) AS revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at)
    `);
    return rows.map((r: any) => ({
      date: r.date,
      orders: parseInt(r.orders),
      revenue: parseFloat(r.revenue),
    }));
  }

  // ── Tenant signups trend (last 30 days, daily) ────────────────────────────

  async getSignupsTrend() {
    const rows = await this.db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'DD Mon') AS date,
        COUNT(*) AS signups
      FROM tenants
      WHERE slug != '_system'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at)
    `);
    return rows.map((r: any) => ({
      date: r.date,
      signups: parseInt(r.signups),
    }));
  }

  // ── Plan management ────────────────────────────────────────────────────────

  async listPlans() {
    return this.planRepo.find({ order: { priceMonthly: 'ASC' } });
  }

  async createPlan(data: Partial<Plan>) {
    const existing = await this.planRepo.findOne({ where: { code: data.code } });
    if (existing) throw new ConflictException(`Plan code '${data.code}' already exists`);
    const plan = this.planRepo.create(data);
    return this.planRepo.save(plan);
  }

  async updatePlan(id: string, data: Partial<Plan>) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    
    if (data.code && data.code !== plan.code) {
      const existing = await this.planRepo.findOne({ where: { code: data.code } });
      if (existing) throw new ConflictException(`Plan code '${data.code}' already exists`);
    }

    Object.assign(plan, data);
    return this.planRepo.save(plan);
  }

  async deletePlan(id: string) {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    
    const [sub] = await this.db.query(`SELECT id FROM subscriptions WHERE plan_id = $1 LIMIT 1`, [id]);
    if (sub) {
      // Soft delete if subscriptions exist
      plan.isActive = false;
      await this.planRepo.save(plan);
      return { success: true, message: 'Plan deactivated because it has active subscriptions' };
    }
    
    await this.planRepo.delete(id);
    return { success: true, message: 'Plan permanently deleted' };
  }
}
