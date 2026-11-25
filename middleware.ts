import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { auth, entraConfigured } from '@/auth';

// Everything except sign-in itself and the cron route needs a Microsoft Entra session.
// Until Entra is configured the site stays closed for everyone.
const requireSession = auth((req) => {
  if (req.auth?.user) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Потрібно увійти' }, { status: 401 });
  }
  const url = new URL('/signin', req.nextUrl.origin);
  url.searchParams.set('callbackUrl', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
});

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (req.nextUrl.pathname === '/signin') return NextResponse.next();
  if (!entraConfigured()) {
    return new NextResponse('Вхід через Microsoft ще не налаштований.', { status: 503 });
  }
  return (requireSession as unknown as (r: NextRequest, e: NextFetchEvent) => Promise<Response>)(req, ev);
}

export const config = {
  matcher: ['/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico).*)'],
};
