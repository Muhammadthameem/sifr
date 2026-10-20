import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const ADMIN_SESSION_COOKIE = 'sifr_admin_session';

function getJwtSecretKey(): Uint8Array | null {
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

async function verifyAuthToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secretKey = getJwtSecretKey();
  if (!secretKey) return false;
  try {
    await jwtVerify(token, secretKey, { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Target /admin routes
  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const isAuthenticated = await verifyAuthToken(token);

  // Unauthenticated root /admin request -> redirect to /admin/dashboard or /admin/login
  if (pathname === '/admin') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    } else {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  // Handling /admin/login route
  if (pathname === '/admin/login') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // All other /admin/* routes require auth
  if (!isAuthenticated) {
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
