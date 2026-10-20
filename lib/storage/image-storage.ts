import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface StoredImageResult {
  url: string;
  storageKey: string;
}

export interface ImageStorageProvider {
  saveImage(buffer: Buffer, originalFilename: string, subfolder?: string): Promise<StoredImageResult>;
  deleteImage(storageKey: string): Promise<void>;
}

class LocalFileSystemStorage implements ImageStorageProvider {
  private baseUploadDir: string;

  constructor() {
    this.baseUploadDir = path.join(process.cwd(), 'public', 'uploads');
  }

  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async saveImage(buffer: Buffer, originalFilename: string, subfolder = 'products'): Promise<StoredImageResult> {
    const targetDir = path.join(this.baseUploadDir, subfolder);
    await this.ensureDirectory(targetDir);

    const ext = path.extname(originalFilename) || '.jpg';
    const uniqueHash = crypto.randomBytes(8).toString('hex');
    const safeFilename = `${Date.now()}-${uniqueHash}${ext.toLowerCase()}`;
    const filePath = path.join(targetDir, safeFilename);

    await fs.writeFile(filePath, buffer);

    const relativePath = `/uploads/${subfolder}/${safeFilename}`;
    const storageKey = `uploads/${subfolder}/${safeFilename}`;

    return {
      url: relativePath,
      storageKey,
    };
  }

  async deleteImage(storageKey: string): Promise<void> {
    try {
      const fullPath = path.join(process.cwd(), 'public', storageKey);
      await fs.unlink(fullPath);
    } catch {
      // Ignore if file already removed
    }
  }
}

// Singleton storage provider export
export const imageStorage: ImageStorageProvider = new LocalFileSystemStorage();
