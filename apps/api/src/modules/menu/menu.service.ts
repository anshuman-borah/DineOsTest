import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MenuItem } from './entities/menu-item.entity';
import { MenuItemVariation } from './entities/menu-item-variation.entity';
import { Category } from './entities/category.entity';
import { GstRate } from '../billing/entities/gst-rate.entity';
import { StorageService } from '../storage/storage.service';

function nullifyEmpty(value: any): string | null {
  if (value === '' || value === undefined || value === null) return null;
  return value;
}

const DEFAULT_GST_RATES = [
  { name: 'Exempt',   rate: 0,  cgstRate: 0,   sgstRate: 0,   igstRate: 0,  hsnSacCode: '9963' },
  { name: 'GST 5%',  rate: 5,  cgstRate: 2.5,  sgstRate: 2.5, igstRate: 5,  hsnSacCode: '9963' },
  { name: 'GST 12%', rate: 12, cgstRate: 6,   sgstRate: 6,   igstRate: 12, hsnSacCode: '9963' },
  { name: 'GST 18%', rate: 18, cgstRate: 9,   sgstRate: 9,   igstRate: 18, hsnSacCode: '9963' },
  { name: 'GST 28%', rate: 28, cgstRate: 14,  sgstRate: 14,  igstRate: 28, hsnSacCode: '2203' },
];

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    @InjectRepository(MenuItem)
    private readonly itemRepo: Repository<MenuItem>,
    @InjectRepository(MenuItemVariation)
    private readonly variationRepo: Repository<MenuItemVariation>,
    @InjectRepository(Category)
    private readonly catRepo: Repository<Category>,
    @InjectRepository(GstRate)
    private readonly gstRepo: Repository<GstRate>,
    private readonly storageService: StorageService,
  ) {}

  // ── Categories ─────────────────────────────────────────────────────────────

  getCategories(tenantId: string, branchId?: string) {
    const where: any = { tenantId, isActive: true };
    if (branchId) where.branchId = branchId;
    return this.catRepo.find({ where, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  createCategory(data: Partial<Category>) {
    return this.catRepo.save(this.catRepo.create(data as Category));
  }

  async updateCategory(id: string, tenantId: string, data: Partial<Category>) {
    const cat = await this.catRepo.findOne({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Category not found');
    await this.catRepo.update(id, data);
    return this.catRepo.findOne({ where: { id } });
  }

  async removeCategory(id: string, tenantId: string) {
    const cat = await this.catRepo.findOne({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('Category not found');
    await this.catRepo.update(id, { isActive: false });
    return { success: true };
  }

  // ── Menu Items ─────────────────────────────────────────────────────────────

  getItems(tenantId: string, branchId?: string, categoryId?: string) {
    const where: any = { tenantId, isActive: true };
    if (branchId)   where.branchId   = branchId;
    if (categoryId) where.categoryId = categoryId;
    return this.itemRepo.find({
      where,
      order: { sortOrder: 'ASC', name: 'ASC' },
      relations: ['variations', 'gstRate'],
    });
  }

  async getItem(id: string, tenantId: string) {
    const item = await this.itemRepo.findOne({
      where: { id, tenantId },
      relations: ['variations', 'gstRate'],
    });
    if (!item) throw new NotFoundException('Menu item not found');
    return item;
  }

  createItem(data: Partial<MenuItem>) {
    const sanitised: any = {
      ...data,
      categoryId: nullifyEmpty(data.categoryId),
      gstRateId:  nullifyEmpty((data as any).gstRateId),
    };
    return this.itemRepo.save(this.itemRepo.create(sanitised as MenuItem));
  }

  async updateItem(id: string, tenantId: string, data: Partial<MenuItem>) {
    const oldItem = await this.getItem(id, tenantId);

    // ── Image cleanup on update ───────────────────────────────────────────────
    // Case 1: Image was replaced (new URL is different from old URL)
    // Case 2: Image was removed (new imageUrl is empty/null, old had one)
    const newImageUrl = (data as any).imageUrl ?? null;
    const oldImageUrl = oldItem.imageUrl ?? null;
    const imageChanged =
      newImageUrl !== undefined &&          // imageUrl key was explicitly sent
      newImageUrl !== oldImageUrl;          // and it's actually different

    if (imageChanged && oldImageUrl) {
      const key = this.extractStorageKey(oldImageUrl);
      if (key) {
        await this.storageService.delete(key)
          .then(() => this.logger.log(`Old image deleted on update: ${key}`))
          .catch((err) => this.logger.warn(`Failed to delete old image on update: ${key} — ${err.message}`));
      }
    }

    const sanitised: any = {
      ...data,
      categoryId: nullifyEmpty(data.categoryId),
      gstRateId:  nullifyEmpty((data as any).gstRateId),
    };
    await this.itemRepo.update(id, sanitised);
    return this.getItem(id, tenantId);
  }

  async removeItem(id: string, tenantId: string) {
    // Fetch the item first so we can clean up its image from storage
    const item = await this.itemRepo.findOne({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Menu item not found');

    // Delete the image file from storage if one exists
    if (item.imageUrl) {
      const key = this.extractStorageKey(item.imageUrl);
      if (key) {
        await this.storageService.delete(key)
          .then(() => this.logger.log(`Image deleted for item ${id}: ${key}`))
          .catch((err) => this.logger.warn(`Failed to delete image for item ${id}: ${key} — ${err.message}`));
      }
    }

    return this.itemRepo.update(id, { isActive: false });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Extracts the storage key from a stored imageUrl.
   * Handles both:
   *   - Relative paths:  /static/tenantId/menu-items/abc.webp  → tenantId/menu-items/abc.webp
   *   - Full URLs:       http://localhost:4000/static/tenantId/menu-items/abc.webp → same
   *   - S3 URLs:        https://bucket.s3.amazonaws.com/tenantId/menu-items/abc.webp → same
   */
  private extractStorageKey(imageUrl: string): string | null {
    if (!imageUrl) return null;
    try {
      if (imageUrl.startsWith('http')) {
        // Local API URL (http://localhost:4000/static/tenantId/...) → strip to key
        if (imageUrl.includes('/static/')) {
          const pathname = new URL(imageUrl).pathname;
          return pathname.replace('/static/', '');
        }
        // Cloudinary or S3 full URL → return as-is so StorageService can parse it
        return imageUrl;
      }
      // Relative path: /static/tenantId/folder/file.webp
      if (imageUrl.startsWith('/static/')) {
        return imageUrl.replace('/static/', '');
      }
      return imageUrl;
    } catch {
      return null;
    }
  }

  // ── Variations ─────────────────────────────────────────────────────────────

  async getVariations(menuItemId: string, tenantId: string) {
    await this.getItem(menuItemId, tenantId);
    return this.variationRepo.find({
      where: { menuItemId, tenantId, isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createVariation(
    menuItemId: string,
    tenantId: string,
    data: Partial<MenuItemVariation>,
  ) {
    await this.getItem(menuItemId, tenantId);
    return this.variationRepo.save(
      this.variationRepo.create({ ...data, menuItemId, tenantId } as MenuItemVariation),
    );
  }

  async updateVariation(id: string, tenantId: string, data: Partial<MenuItemVariation>) {
    const v = await this.variationRepo.findOne({ where: { id, tenantId } });
    if (!v) throw new NotFoundException('Variation not found');
    await this.variationRepo.update(id, data);
    return this.variationRepo.findOneOrFail({ where: { id } });
  }

  async removeVariation(id: string, tenantId: string) {
    const v = await this.variationRepo.findOne({ where: { id, tenantId } });
    if (!v) throw new NotFoundException('Variation not found');
    return this.variationRepo.update(id, { isActive: false });
  }

  // ── GST Rates ──────────────────────────────────────────────────────────────

  async getGstRates(tenantId: string) {
    const rates = await this.gstRepo.find({ where: { tenantId, isActive: true } });

    // Auto-seed for existing tenants who registered before auto-seeding was added
    if (rates.length === 0) {
      const seeded = DEFAULT_GST_RATES.map((d) =>
        this.gstRepo.create({ ...d, tenantId } as GstRate),
      );
      return this.gstRepo.save(seeded);
    }

    return rates;
  }

  createGstRate(tenantId: string, data: Partial<GstRate>) {
    const rate = this.gstRepo.create({
      ...data,
      tenantId,
      cgstRate: data.rate ? Number(data.rate) / 2 : 0,
      sgstRate: data.rate ? Number(data.rate) / 2 : 0,
      igstRate: data.rate ? Number(data.rate)     : 0,
    } as GstRate);
    return this.gstRepo.save(rate);
  }

  async updateGstRate(id: string, tenantId: string, data: Partial<GstRate>) {
    const gst = await this.gstRepo.findOne({ where: { id, tenantId } });
    if (!gst) throw new NotFoundException('GST rate not found');
    await this.gstRepo.update(id, data);
    return this.gstRepo.findOne({ where: { id } });
  }

  async removeGstRate(id: string, tenantId: string) {
    const gst = await this.gstRepo.findOne({ where: { id, tenantId } });
    if (!gst) throw new NotFoundException('GST rate not found');
    await this.gstRepo.update(id, { isActive: false });
    return { success: true };
  }

  async seedDefaultGstRates(tenantId: string) {
    const existing = await this.gstRepo.count({ where: { tenantId } });
    if (existing > 0) return { message: 'GST rates already seeded', count: existing };

    const rates = DEFAULT_GST_RATES.map((d) =>
      this.gstRepo.create({ ...d, tenantId } as GstRate),
    );
    return this.gstRepo.save(rates);
  }
}