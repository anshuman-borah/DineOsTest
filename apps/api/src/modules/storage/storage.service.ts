import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export type StorageDriver = 'local' | 's3' | 'cloudinary';

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
    this.driver = config.get<StorageDriver>('STORAGE_DRIVER', 'local');
    this.localUploadsDir = path.join(process.cwd(), 'uploads');
    this.apiBaseUrl = config.get('API_URL', 'http://localhost:4000');

    if (this.driver === 'cloudinary') {
      // ── Configure Cloudinary SDK ──────────────────────────────────────
      cloudinary.config({
        cloud_name:  config.get('CLOUDINARY_CLOUD_NAME'),
        api_key:     config.get('CLOUDINARY_API_KEY'),
        api_secret:  config.get('CLOUDINARY_API_SECRET'),
        secure:      true,
      });
      this.s3Bucket   = '';
      this.s3PublicUrl = '';
      this.logger.log(`Storage driver: Cloudinary (${config.get('CLOUDINARY_CLOUD_NAME')})`);

    } else if (this.driver === 's3') {
      const endpoint       = config.get('S3_ENDPOINT', '');
      const region         = config.get('S3_REGION', 'ap-south-1');
      const accessKeyId    = config.get('S3_ACCESS_KEY', '');
      const secretAccessKey = config.get('S3_SECRET_KEY', '');
      this.s3Bucket      = config.get('S3_BUCKET', 'dinestay-assets');
      this.s3PublicUrl   = config.get('S3_PUBLIC_URL', endpoint
        ? `${endpoint}/${this.s3Bucket}`
        : `https://${this.s3Bucket}.s3.${region}.amazonaws.com`);

      this.s3Client = new S3Client({
        region,
        ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
        credentials: { accessKeyId, secretAccessKey },
      });
      this.logger.log(`Storage driver: S3 (${endpoint || 'AWS'}) bucket=${this.s3Bucket}`);

    } else {
      // ── Local disk ────────────────────────────────────────────────────
      this.s3Bucket   = '';
      this.s3PublicUrl = '';
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

    const folderPath = tenantId ? `${tenantId}/${folder}` : folder;

    if (this.driver === 'cloudinary') {
      return this.uploadToCloudinary(file, folderPath);
    }

    // For local/S3 — generate a unique filename
    const ext      = path.extname(file.originalname).toLowerCase() || this.mimetypeToExt(file.mimetype);
    const filename = `${crypto.randomBytes(12).toString('hex')}${ext}`;
    const key      = `${folderPath}/${filename}`;

    if (this.driver === 's3' && this.s3Client) {
      return this.uploadToS3(file, key);
    }
    return this.uploadToLocal(file, key);
  }

  // ─── Delete a file ────────────────────────────────────────────────────────────────

  async delete(key: string): Promise<void> {
    if (this.driver === 'cloudinary') {
      if (key.includes('res.cloudinary.com') || (!key.includes('/static/') && !key.endsWith('.webp') && !key.endsWith('.jpg') && !key.endsWith('.png'))) {
        // It's a Cloudinary URL or public_id — delete from Cloudinary
        const publicId = this.extractCloudinaryPublicId(key);
        await cloudinary.uploader.destroy(publicId);
        this.logger.log(`Cloudinary deleted: ${publicId}`);
      } else {
        // It's an old local file path (e.g. tenantId/general/abc.webp) — delete from disk
        const filePath = path.join(this.localUploadsDir, key);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          this.logger.log(`Local deleted (legacy): ${filePath}`);
        } else {
          this.logger.warn(`Local file not found (already deleted?): ${filePath}`);
        }
      }

    } else if (this.driver === 's3' && this.s3Client) {
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

  // ─── Private: Cloudinary upload ───────────────────────────────────────────

  private uploadToCloudinary(file: Express.Multer.File, folderPath: string): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder:           folderPath,
          resource_type:    'auto',
          // Let Cloudinary auto-optimize: serve WebP to browsers that support it,
          // auto quality — no sharp needed!
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' },  // max 1200px, keep ratio
            { fetch_format: 'auto', quality: 'auto' },      // auto format + quality
          ],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'));

          // public_id is used for deletion later (stored as the key)
          this.logger.log(`Cloudinary upload: ${result.public_id} (${result.bytes} bytes)`);

          resolve({
            url:      result.secure_url,   // full HTTPS CDN URL — stored in DB
            key:      result.public_id,    // e.g. "tenantId/menu-items/abc" — used for delete
            driver:   'cloudinary',
            size:     result.bytes,
            mimetype: file.mimetype,
          });
        },
      );

      // Pipe the file buffer into the upload stream
      const { Readable } = require('stream');
      Readable.from(file.buffer).pipe(uploadStream);
    });
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
        Bucket:        this.s3Bucket,
        Key:           key,
        Body:          file.buffer,
        ContentType:   file.mimetype,
        ContentLength: file.size,
      }),
    );

    const url = `${this.s3PublicUrl}/${key}`;
    this.logger.log(`S3 upload: ${key} (${file.size} bytes)`);

    return { url, key, driver: 's3', size: file.size, mimetype: file.mimetype };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

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

  /**
   * Extracts the Cloudinary public_id from either:
   *  - A full Cloudinary URL:  https://res.cloudinary.com/cloud/image/upload/v123/tenantId/folder/abc.webp
   *  - Already a public_id:   tenantId/folder/abc
   */
  private extractCloudinaryPublicId(keyOrUrl: string): string {
    if (keyOrUrl.includes('res.cloudinary.com')) {
      // Extract path after /upload/vXXXX/ or /upload/
      const match = keyOrUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
      if (match) {
        // Remove file extension — Cloudinary public_ids don't include extension
        return match[1].replace(/\.[^/.]+$/, '');
      }
    }
    // Already a public_id — strip extension if present
    return keyOrUrl.replace(/\.[^/.]+$/, '');
  }
}
