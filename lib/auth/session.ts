// Signed session cookie, same scheme as the GBP dashboard and the CS Wiki.
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, SESSION_SECRET)).
// Web Crypto only, so it runs in middleware and in route handlers.

export const SESSION_COOKIE = 'fa_session';
export const NONCE_COOKIE = 'fa_auth';

const enc = new TextEncoder();
const dec = new TextDecoder();

export type SessionUser = { sub: string; email: string; name: string; exp: number };

export function b64urlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str: string): Uint8Array<ArrayBuffer> {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64urlDecodeJSON<T = any>(str: string): T {
  return JSON.parse(dec.decode(b64urlDecode(str)));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sign(payload: object, secret: string): Promise<string> {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return body + '.' + b64urlEncode(new Uint8Array(sig));
}

/** The payload if the signature is valid and it has not expired, else null. */
export async function verify<T extends { exp?: number }>(token: string | null | undefined, secret: string): Promise<T | null> {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  let sig: Uint8Array<ArrayBuffer>;
  try { sig = b64urlDecode(token.slice(dot + 1)); } catch { return null; }
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), sig, enc.encode(body));
  if (!ok) return null;
  let payload: T;
  try { payload = b64urlDecodeJSON<T>(body); } catch { return null; }
  if (!payload.exp || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function cookie(name: string, value: string, { maxAge, sameSite = 'Lax', path = '/' }: { maxAge?: number; sameSite?: string; path?: string } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; Secure; SameSite=${sameSite}`;
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  return c;
}

export function authConfig(env: Record<string, string | undefined> = process.env) {
  const missing = ['AUTH_TENANT_ID', 'AUTH_CLIENT_ID', 'SESSION_SECRET'].filter((k) => !env[k]);
  const secret = env.SESSION_SECRET || '';
  if (secret && secret.length < 32) missing.push('SESSION_SECRET (щонайменше 32 символи)');
  return {
    tenantId: env.AUTH_TENANT_ID || '',
    clientId: env.AUTH_CLIENT_ID || '',
    secret,
    allowed: (env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    sessionHours: Number(env.SESSION_HOURS || 12),
    missing,
  };
}

/** The signed-in user for this request, or null. */
export async function currentUser(request: Request): Promise<SessionUser | null> {
  const cfg = authConfig();
  if (cfg.missing.length) return null;
  return verify<SessionUser>(getCookie(request, SESSION_COOKIE), cfg.secret);
}

/** Only same-site relative return paths ("/x", never "//evil" or "https://..."). */
export function safeReturnPath(p: unknown): string {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\')) return '/';
  if (p.startsWith('/api/')) return '/';
  return p.slice(0, 500);
}
