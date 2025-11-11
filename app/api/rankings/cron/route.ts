import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

function authorize(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn('[rankings/cron] CRON_SECRET not configured – allowing request for compatibility.');
    return true;
  }

  const urlSecret = request.nextUrl.searchParams.get('secret');
  const headerSecret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null;

  if (urlSecret && urlSecret === secret) {
    return true;
  }

  if (headerSecret && headerSecret === secret) {
    return true;
  }

  return false;
}

function buildForwardUrl(request: NextRequest) {
  const forwardUrl = new URL('/api/rankings/fetch', request.url);
  const params = request.nextUrl.searchParams;

  const limit = params.get('limit');
  const ids = params.get('ids');
  const keyword = params.get('keyword');

  if (limit) forwardUrl.searchParams.set('limit', limit);
  if (ids) forwardUrl.searchParams.set('ids', ids);
  if (keyword) forwardUrl.searchParams.set('keyword', keyword);

  return forwardUrl;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const forwardUrl = buildForwardUrl(request);
    const response = await fetch(forwardUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[rankings/cron] Forwarded fetch failed', {
        status: response.status,
        statusText: response.statusText,
        payload,
      });
      return NextResponse.json(
        {
          ok: false,
          status: response.status,
          payload,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      triggeredAt: new Date().toISOString(),
      status: response.status,
      payload,
    });
  } catch (error: any) {
    console.error('[rankings/cron] Unexpected failure', error);
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? 'Unexpected error',
      },
      { status: 500 }
    );
  }
}

