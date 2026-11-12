import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtempSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ImageStorageService, PUBLIC_IMAGE_PREFIX, UploadedImage } from './image-storage.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

function file(name: string, buffer: Buffer): UploadedImage {
  return { originalname: name, mimetype: 'image/png', size: buffer.length, buffer };
}

describe('ImageStorageService', () => {
  let dir: string;
  let service: ImageStorageService;

  beforeEach(() => {
    // Dossier temporaire propre au test (le système le nettoie)
    dir = mkdtempSync(path.join(os.tmpdir(), 'pc-uploads-'));
    process.env.UPLOAD_DIR = dir;
    service = new ImageStorageService();
  });

  it('détecte le type réel par la signature binaire', () => {
    expect(ImageStorageService.detectExtension(PNG)).toBe('png');
    expect(ImageStorageService.detectExtension(JPG)).toBe('jpg');
    expect(ImageStorageService.detectExtension(Buffer.from('<?php echo 1; ?>....'))).toBeNull();
  });

  it('enregistre les images sous un nom aléatoire et les relit', async () => {
    const [url] = await service.save([file('../../etc/passwd.png', PNG)]);
    expect(url.startsWith(PUBLIC_IMAGE_PREFIX)).toBe(true);
    const name = url.substring(PUBLIC_IMAGE_PREFIX.length);
    expect(name).toMatch(/^[0-9a-f-]{36}\.png$/);
    const resolved = await service.resolve(name);
    expect(resolved.contentType).toBe('image/png');
    expect(path.dirname(resolved.file)).toBe(path.resolve(dir));
  });

  it("refuse un fichier qui n'est pas une image, même renommé en .jpg", async () => {
    await expect(service.save([file('photo.jpg', Buffer.from('MZ executable content....'))])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuse un envoi vide ou trop volumineux', async () => {
    await expect(service.save([])).rejects.toBeInstanceOf(BadRequestException);
    const big = file('big.png', PNG);
    big.size = 6 * 1024 * 1024;
    await expect(service.save([big])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bloque toute traversée de chemin à la lecture', async () => {
    await expect(service.resolve('../../etc/passwd')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve('..%2F..%2Fsecret.png')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve('00000000-0000-4000-8000-000000000000.png')).rejects.toBeInstanceOf(NotFoundException);
  });

  it("n'accepte dans une annonce que des photos téléversées ou des URL http(s)", () => {
    expect(ImageStorageService.isAcceptedImageUrl(`${PUBLIC_IMAGE_PREFIX}0f8fad5b-d9cb-469f-a165-70867728950e.jpg`)).toBe(true);
    expect(ImageStorageService.isAcceptedImageUrl('https://exemple.tn/photo.jpg')).toBe(true);
    expect(ImageStorageService.isAcceptedImageUrl('javascript:alert(1)')).toBe(false);
    expect(ImageStorageService.isAcceptedImageUrl(`${PUBLIC_IMAGE_PREFIX}../../secret.png`)).toBe(false);
  });
});
