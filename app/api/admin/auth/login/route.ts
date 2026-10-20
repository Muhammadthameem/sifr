import { NextRequest } from 'next/server';
import { adminLoginSchema } from '@/lib/validation/auth';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { encryptSession, setAdminSessionCookie } from '@/lib/auth/session';
import { apiSuccess, apiError } from '@/lib/utils/api-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Validate payload using Zod
    const parseResult = adminLoginSchema.safeParse(body);
    if (!parseResult.success) {
      return apiError('Invalid request format', 400, 'VALIDATION_ERROR', parseResult.error.flatten());
    }

    const { email, password } = parseResult.data;

    // 2. Query admin user from database (with fallback seed check for Phase 1 convenience)
    let admin = await prisma.adminUser.findUnique({
      where: { email },
    });

    // Fallback: If DB has no admin user matching env default, handle initial seed creation dynamically
    if (!admin && email === (process.env.ADMIN_EMAIL || 'admin@sifr.in')) {
      const defaultEnvPassword = process.env.ADMIN_PASSWORD;
      if (!defaultEnvPassword) {
        console.error('Server configuration error: ADMIN_PASSWORD environment variable is not configured');
        return apiError('Server configuration error: ADMIN_PASSWORD is not configured', 500, 'SERVER_CONFIGURATION_ERROR');
      }
      if (password === defaultEnvPassword) {
        const hashedPassword = await hashPassword(defaultEnvPassword);
        admin = await prisma.adminUser.create({
          data: {
            email,
            name: 'SIFR Owner',
            passwordHash: hashedPassword,
          },
        });
      }
    }

    if (!admin) {
      return apiError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // 3. Verify password
    const isPasswordValid = await verifyPassword(password, admin.passwordHash);
    if (!isPasswordValid) {
      return apiError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    // 4. Update last login timestamp safely
    try {
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { lastLoginAt: new Date() },
      });
    } catch {
      // Non-critical timestamp update failure swallow
    }

    // 5. Generate session token and set HTTP-only cookie
    const token = await encryptSession({
      adminId: admin.id,
      email: admin.email,
      name: admin.name || undefined,
    });

    await setAdminSessionCookie(token);

    return apiSuccess({
      email: admin.email,
      name: admin.name,
    });
  } catch (error) {
    console.error('[Admin Login API Error]:', error);
    return apiError('An unexpected server error occurred', 500, 'SERVER_ERROR');
  }
}
