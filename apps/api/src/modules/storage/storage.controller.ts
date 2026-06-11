import {
  Controller, Post, Delete, Param, Query,
  UseInterceptors, UploadedFile, UseGuards,
  HttpCode, HttpStatus, ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('storage')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'storage', version: '1' })
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file — auto-routes to local disk, MinIO, or S3 based on config' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, folder: { type: 'string' } } } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),   // keep in memory — StorageService decides where it goes
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @TenantId() tenantId: string,
    @Query('folder') folder = 'general',
  ) {
    return this.storageService.upload(file, folder, tenantId);
  }

  @Delete(':key(*)')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an uploaded file by its storage key (tenant-scoped)' })
  delete(
    @Param('key') key: string,
    @TenantId() tenantId: string,
  ) {
    // ── Tenant isolation check ────────────────────────────────────────────────
    // Files are stored as  {tenantId}/{folder}/{filename}
    // A tenant must only be able to delete files under their own prefix.
    // This prevents one restaurant from deleting another's images.
    if (!key.startsWith(`${tenantId}/`)) {
      throw new ForbiddenException('You can only delete files belonging to your account');
    }

    return this.storageService.delete(key);
  }
}
