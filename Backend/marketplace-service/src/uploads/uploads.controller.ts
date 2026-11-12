import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import {
  ImageStorageService,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_UPLOAD,
  UploadedImage,
} from './image-storage.service';

@ApiTags('Marketplace Listings')
@Controller('listings/uploads')
export class UploadsController {
  constructor(private readonly storage: ImageStorageService) {}

  /**
   * POST /api/listings/uploads (multipart/form-data, champ « files », 6 images de 5 Mo maximum)
   * Renvoie les URL à placer dans le champ images[] de l'annonce.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', MAX_IMAGES_PER_UPLOAD, {
      limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_UPLOAD },
    }),
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiOperation({ summary: "Téléverser des photos d'annonce depuis l'ordinateur" })
  @ApiResponse({ status: 201, description: '{ urls: string[] }' })
  @ApiResponse({ status: 400, description: 'Fichier absent, trop nombreux ou qui n’est pas une image.' })
  @ApiResponse({ status: 413, description: 'Fichier de plus de 5 Mo.' })
  async upload(@UploadedFiles() files: UploadedImage[]) {
    return { urls: await this.storage.save(files) };
  }

  /** GET /api/listings/uploads/{nom} — photo publique (les annonces sont consultables sans compte). */
  @Get(':name')
  @ApiOperation({ summary: "Afficher une photo d'annonce" })
  async serve(@Param('name') name: string, @Res() res: Response) {
    const { file, contentType } = await this.storage.resolve(name);
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.sendFile(file);
  }
}
