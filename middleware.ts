import { NextResponse, type NextRequest } from 'next/server';

// TEMPORARY password gate (HTTP Basic auth) until Microsoft Entra sign-in replaces it.
// Any user name works; the password is DASH_PASSWORD. The cron route has its own secret.
export function middleware(req: NextRequest) {
  const password = process.env.DASH_PASSWORD;
  if (!password) return new NextResponse('DASH_PASSWORD is not set', { status: 503 });

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(':') + 1);
      if (safeEqual(given, password)) return NextResponse.next();
    } catch {
      /* malformed header: fall through to the challenge */
    }
  }
  return new NextResponse('Потрібен пароль', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Freight Box Hub Ads", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const config = {
  matcher: ['/((?!api/cron|_next/static|_next/image|favicon.ico).*)'],
};
