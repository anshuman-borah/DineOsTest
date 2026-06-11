import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export type StorageDriver = 'local' | 's3';

export interface UploadResult {
  url: string;          // public URL to access the file
  key: string;          // storage key / relative path (for deletion)
  driver: StorageDriver;
  size: number;
  mimetype: string;
}

const ALLOWED_MIMETYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  private readonly s3Client: S3Client | null = null;
  private readonly s3Bucket: string;
  private readonly s3PublicUrl: string;
  private readonly localUploadsDir: string;
  private readonly apiBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.driver = (config.get('STORAGE_DRIVER', 'local') as StorageDriver);
    this.localUploadsDir = path.join(process.cwd(), 'uploads');
    this.apiBaseUrl = config.get('API_URL', 'http://localhost:4000');

    if (this.driver === 's3') {
      const endpoint = config.get('S3_ENDPOINT', '');   // empty = AWS, set for MinIO/R2/DO Spaces
      const region = config.get('S3_REGION', 'ap-south-1');
      const accessKeyId = config.get('S3_ACCESS_KEY', '');
      const secretAccessKey = config.get('S3_SECRET_KEY', '');
      this.s3Bucket = config.get('S3_BUCKET', 'dinestay-assets');
      this.s3PublicUrl = config.get('S3_PUBLIC_URL', endpoint ? `${endpoint}/${this.s3Bucket}` : `https://${this.s3Bucket}.s3.${region}.amazonaws.com`);

      this.s3Client = new S3Client({
        region,
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),  // forcePathStyle needed for MinIO
        credentials: { accessKeyId, secretAccessKey },
      });

      this.logger.log(`Storage driver: S3 (${endpoint || 'AWS'}) bucket=${this.s3Bucket}`);
    } else {
      this.s3Bucket = '';
      this.s3PublicUrl = '';
      // Ensure uploads directory exists
      if (!fs.existsSync(this.localUploadsDir)) {
        fs.mkdirSync(this.localUploadsDir, { recursive: true });
      }
      this.logger.log(`Storage driver: local (${this.localUploadsDir})`);
    }
  }

  // ─── Main upload method ───────────────────────────────────────────────────

  async upload(
    file: Express.Multer.File,
    folder = 'general',
    tenantId?: string,
  ): Promise<UploadResult> {
    this.validateFile(file);

    const isImage = file.mimetype.startsWith('image/');

    // ── Optimise images before storing ────────────────────────────────
    // Images are resized to max 1200px and converted to WebP (80% quality).
    // This typically reduces file sizes by 85–95% with no visible quality loss.
    // PDFs and other non-image files are stored as-is.
    let processedBuffer = file.buffer;
    let processedMime   = file.mimetype;
    let ext = path.extname(file.originalname).toLowerCase() || this.mimetypeToExt(file.mimetype);

    if (isImage) {
      processedBuffer = await this.optimizeImage(file.buffer);
      processedMime   = 'image/webp';
      ext             = '.webp';
    }

    const filename = `${crypto.randomBytes(12).toString('hex')}${ext}`;
    const key = tenantId
      ? `${tenantId}/${folder}/${filename}`
      : `${folder}/${filename}`;

    // Build a mutated file object so the private upload methods stay unchanged
    const processedFile: Express.Multer.File = {
      ...file,
      buffer:   processedBuffer,
      size:     processedBuffer.length,
      mimetype: processedMime,
    };

    if (this.driver === 's3' && this.s3Client) {
      return this.uploadToS3(processedFile, key);
    }
    return this.uploadToLocal(processedFile, key);
  }

  // ─── Delete a file ────────────────────────────────────────────────────────

  async delete(key: string, driver?: StorageDriver): Promise<void> {
    const d = driver || this.driver;

    if (d === 's3' && this.s3Client) {
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.s3Bucket, Key: key }));
      this.logger.log(`S3 deleted: ${key}`);
    } else {
      const filePath = path.join(this.localUploadsDir, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Local deleted: ${filePath}`);
      }
    }
  }

  // ─── Private: Local disk upload ───────────────────────────────────────────

  private async uploadToLocal(file: Express.Multer.File, key: string): Promise<UploadResult> {
    const destDir = path.join(this.localUploadsDir, path.dirname(key));
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const destPath = path.join(this.localUploadsDir, key);
    fs.writeFileSync(destPath, file.buffer);

    const url = `${this.apiBaseUrl}/static/${key}`;
    this.logger.log(`Local upload: ${key} (${file.size} bytes)`);

    return { url, key, driver: 'local', size: file.size, mimetype: file.mimetype };
  }

  // ─── Private: S3 / MinIO / R2 / DO Spaces upload ─────────────────────────

  private async uploadToS3(file: Express.Multer.File, key: string): Promise<UploadResult> {
    await this.s3Client!.send(
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
        // Public read ACL — omit if bucket policy handles it (R2, MinIO with policy)
        // ACL: 'public-read',
      }),
    );

    const url = `${this.s3PublicUrl}/${key}`;
    this.logger.log(`S3 upload: ${key} (${file.size} bytes)`);

    return { url, key, driver: 's3', size: file.size, mimetype: file.mimetype };
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  private validateFile(file: Express.Multer.File): void {
    if (!file) throw new BadRequestException('No file provided');
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException(`File too large — max ${MAX_SIZE_BYTES / 1024 / 1024}MB`);
    }
    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
    }
  }

  private mimetypeToExt(mimetype: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
      'image/gif': '.gif', 'application/pdf': '.pdf',
    };
    return map[mimetype] || '.bin';
  }

  // ── Image optimisation ─────────────────────────────────────────────────

  /**
   * Resize to max 1200 × 1200 (keeping aspect ratio) and convert to WebP.
   * Animated GIFs are flattened to a single frame — acceptable for menu photos.
   * Processing is done entirely in-memory; no temp files are created.
   */
  private async optimizeImage(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer)
      .resize(1200, 1200, {
        fit: 'inside',          // never upscale, keep aspect ratio
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })   // convert to WebP at 80% quality
      .toBuffer();
  }
}
