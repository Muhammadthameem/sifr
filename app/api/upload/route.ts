import { NextRequest } from 'next/server';
import { decryptSession, ADMIN_SESSION_COOKIE } from '@/lib/auth/session';
import { imageStorage } from '@/lib/storage/image-storage';
import { apiSuccess, apiError } from '@/lib/utils/api-response';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const session = token ? await decryptSession(token) : null;

    if (!session) {
      return apiError('Unauthorized', 401);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return apiError('No file provided in form data', 400);
    }

    // Validate mime type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
    if (!validTypes.includes(file.type)) {
      return apiError('Invalid file type. Only JPEG, PNG, WEBP, and AVIF images are allowed.', 400);
    }

    // Convert file to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save image via storage abstraction
    const stored = await imageStorage.saveImage(buffer, file.name, 'products');

    return apiSuccess({
      url: stored.url,
      storageKey: stored.storageKey,
      altText: file.name.replace(/\.[^/.]+$/, ''),
    });
  } catch (error: any) {
    console.error('[Image Upload Error]:', error);
    return apiError(error.message || 'Image upload failed', 500);
  }
}
