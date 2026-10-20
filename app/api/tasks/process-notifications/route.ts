import { NextRequest, NextResponse } from 'next/server';
import { processPendingNotifications } from '@/lib/notifications/notification-engine';
import crypto from 'crypto';

function verifyCronSecret(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;

  const providedToken = authHeader.slice(7);
  const bufA = Buffer.from(providedToken);
  const bufB = Buffer.from(cronSecret);

  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results = await processPendingNotifications(20);
    return NextResponse.json({
      success: true,
      processedCount: results.length,
      notifications: results,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error processing pending notifications' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
