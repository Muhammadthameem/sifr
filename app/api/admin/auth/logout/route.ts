import { clearAdminSessionCookie } from '@/lib/auth/session';
import { apiSuccess } from '@/lib/utils/api-response';

export async function POST() {
  await clearAdminSessionCookie();
  return apiSuccess({ message: 'Logged out successfully' });
}
