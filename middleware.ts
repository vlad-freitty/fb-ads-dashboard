// Gates the whole site behind a Microsoft sign-in (same as the GBP dashboard and the CS Wiki).
// Only /api/auth/* and the Vercel cron route are reachable without a session.
import { NextResponse, type NextRequest } from 'next/server';
import { authConfig, currentUser } from '@/lib/auth/session';
import { landing, notConfigured } from '@/lib/auth/pages';

export async function middleware(request: NextRequest) {
  const cfg = authConfig();
  if (cfg.missing.length) return notConfigured(cfg.missing);
  if (await currentUser(request)) return NextResponse.next();

  const url = request.nextUrl;
  const wantsPage = request.method === 'GET' && !url.pathname.startsWith('/api/')
    && (request.headers.get('accept') || '').includes('text/html');
  if (wantsPage) return landing({ ret: url.pathname + url.search });
  return NextResponse.json({ error: 'signed_out' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

export const config = {
  matcher: ['/((?!api/auth/|api/cron/|_next/static|_next/image|favicon.ico).*)'],
};
