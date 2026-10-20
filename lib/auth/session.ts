import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

export const ADMIN_SESSION_COOKIE = 'sifr_admin_session';

export function getJwtSecretKey(): Uint8Array | null {
  const secret = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (secret) {
    if (secret.length < 32 && isProduction) {
      return null;
    }
    return new TextEncoder().encode(secret);
  }

  if (isProduction) {
    return null;
  }

  return new TextEncoder().encode('sifr-fallback-secret-key-minimum-32-characters-long');
}

export interface AdminSessionPayload {
  adminId: string;
  email: string;
  name?: string;
}

export async function encryptSession(payload: AdminSessionPayload): Promise<string> {
  const secretKey = getJwtSecretKey();
  if (!secretKey) {
    throw new Error('SERVER_CONFIGURATION_ERROR: Invalid or missing JWT secret key in production environment.');
  }
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secretKey);
}

export async function decryptSession(token: string): Promise<AdminSessionPayload | null> {
  const secretKey = getJwtSecretKey();
  if (!secretKey) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ['HS256'],
    });
    return {
      adminId: payload.adminId as string,
      email: payload.email as string,
      name: payload.name as string | undefined,
    };
  } catch {
    return null;
  }
}

export async function getAdminTokenFromCookies(): Promise<string | undefined> {
  try {
    const cookieStore = cookies();
    return cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

export async function setAdminSessionCookie(sessionToken: string): Promise<void> {
  const cookieStore = cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
