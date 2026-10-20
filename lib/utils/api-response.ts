import { NextResponse } from 'next/server';

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  details?: unknown;
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>(
    {
      success: true,
      data,
    },
    { status }
  );
}

export function apiError(message: string, status = 400, code?: string, details?: unknown) {
  return NextResponse.json<ApiResponse>(
    {
      success: false,
      error: message,
      code,
      details,
    },
    { status }
  );
}
