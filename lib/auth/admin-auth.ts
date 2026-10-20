import { decryptSession, getAdminTokenFromCookies, AdminSessionPayload } from './session';
import { redirect } from 'next/navigation';

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const token = await getAdminTokenFromCookies();
  if (!token) return null;
  return decryptSession(token);
}

export async function requireAdminAuth(): Promise<AdminSessionPayload> {
  const session = await getAdminSession();
  if (!session) {
    redirect('/admin/login');
  }
  return session;
}
