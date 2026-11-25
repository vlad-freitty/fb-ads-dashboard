// Starts the Microsoft sign-in: OpenID Connect, id_token via form_post, account picker every time.
// No client secret is needed; the callback checks the id_token signature against Microsoft's keys.
import { authConfig, b64urlEncode, cookie, NONCE_COOKIE, safeReturnPath, sign } from '@/lib/auth/session';
import { notConfigured } from '@/lib/auth/pages';

export const dynamic = 'force-dynamic';

const randomId = () => b64urlEncode(crypto.getRandomValues(new Uint8Array(24)));

export async function GET(request: Request) {
  const cfg = authConfig();
  if (cfg.missing.length) return notConfigured(cfg.missing);
  const url = new URL(request.url);
  const nonce = randomId();
  const state = randomId();
  const r = safeReturnPath(url.searchParams.get('r') || '/');
  const pending = await sign({ nonce, state, r, exp: Math.floor(Date.now() / 1000) + 600 }, cfg.secret);

  const auth = new URL(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize`);
  auth.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'id_token',
    response_mode: 'form_post',
    redirect_uri: `${url.origin}/api/auth/callback`,
    scope: 'openid profile email',
    nonce,
    state,
    prompt: 'select_account',
  }).toString();

  return new Response(null, {
    status: 302,
    headers: {
      Location: auth.toString(),
      // Microsoft posts back cross-site, so this short-lived cookie must be SameSite=None.
      'Set-Cookie': cookie(NONCE_COOKIE, pending, { maxAge: 600, sameSite: 'None', path: '/api/auth' }),
      'Cache-Control': 'no-store',
    },
  });
}
