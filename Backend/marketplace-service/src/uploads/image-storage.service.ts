import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

/** Fichier reçu par Multer (stockage mémoire par défaut). */
export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 Mo par image
export const MAX_IMAGES_PER_UPLOAD = 6;
export const PUBLIC_IMAGE_PREFIX = '/api/listings/uploads/';

/** Nom de fichier généré par le service : UUID v4 + extension autorisée (aucune traversée de chemin possible). */
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/**
 * Stockage persistant des photos d'annonces (volume Docker monté sur UPLOAD_DIR).
 * Le type est déterminé par la signature binaire du fichier, jamais par le nom ou le type MIME
 * envoyés par le navigateur ; le nom d'origine n'est pas réutilisé.
 */
@Injectable()
export class ImageStorageService {
  private readonly logger = new Logger(ImageStorageService.name);
  readonly dir = path.resolve(process.env.UPLOAD_DIR || '/data/uploads/marketplace');

  /** Extension réelle d'après les premiers octets, ou null si ce n'est pas une image autorisée. */
  static detectExtension(buf: Buffer): string | null {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
    const head = buf.subarray(0, 6).toString('ascii');
    if (head === 'GIF87a' || head === 'GIF89a') return 'gif';
    return null;
  }

  async save(files: UploadedImage[]): Promise<string[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('Aucune image reçue (champ « files »).');
    }
    if (files.length > MAX_IMAGES_PER_UPLOAD) {
      throw new BadRequestException(`${MAX_IMAGES_PER_UPLOAD} images maximum par envoi.`);
    }
    // Validation de tous les fichiers avant toute écriture
    const prepared = files.map((f) => {
      if (f.size > MAX_IMAGE_BYTES) {
        throw new BadRequestException(`« ${f.originalname} » dépasse 5 Mo.`);
      }
      const ext = ImageStorageService.detectExtension(f.buffer);
      if (!ext) {
        throw new BadRequestException(
          `« ${f.originalname} » n'est pas une image valide (formats acceptés : JPEG, PNG, WebP, GIF).`,
        );
      }
      return { file: f, name: `${randomUUID()}.${ext}` };
    });
    await fs.mkdir(this.dir, { recursive: true });
    const urls: string[] = [];
    for (const p of prepared) {
      await fs.writeFile(path.join(this.dir, p.name), p.file.buffer, { flag: 'wx' });
      urls.push(PUBLIC_IMAGE_PREFIX + p.name);
    }
    this.logger.log(`${urls.length} image(s) enregistrée(s)`);
    return urls;
  }

  /** Chemin absolu d'une image stockée ; 404 pour tout nom qui n'a pas été généré par le service. */
  async resolve(name: string): Promise<{ file: string; contentType: string }> {
    if (!STORED_NAME.test(name)) {
      throw new NotFoundException('Image introuvable.');
    }
    const file = path.join(this.dir, name);
    if (path.dirname(file) !== this.dir) {
      throw new NotFoundException('Image introuvable.');
    }
    try {
      await fs.access(file);
    } catch {
      throw new NotFoundException('Image introuvable.');
    }
    return { file, contentType: CONTENT_TYPES[name.split('.').pop() as string] };
  }

  /** Une URL d'image est acceptée si c'est une image stockée par le service ou une URL http(s). */
  static isAcceptedImageUrl(url: string): boolean {
    if (typeof url !== 'string' || url.length > 500) return false;
    if (url.startsWith(PUBLIC_IMAGE_PREFIX)) return STORED_NAME.test(url.substring(PUBLIC_IMAGE_PREFIX.length));
    return /^https?:\/\/[^\s<>"']+$/i.test(url);
  }
}
