// Verifies a Microsoft Entra ID v2.0 id_token with Web Crypto (same as the GBP dashboard).
// Checks: RS256 signature against the tenant's published keys, issuer, audience, tenant, expiry, nonce.
import { b64urlDecode, b64urlDecodeJSON } from './session';

const enc = new TextEncoder();
type Jwk = { kid: string; kty: string; n: string; e: string };
let jwksCache: { url: string; at: number; keys: Jwk[] } = { url: '', at: 0, keys: [] };

async function getKeys(tenantId: string, force = false): Promise<Jwk[]> {
  const url = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`;
  if (!force && jwksCache.url === url && Date.now() - jwksCache.at < 6 * 3600 * 1000) return jwksCache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не вдалося отримати ключі Microsoft (HTTP ${res.status})`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { url, at: Date.now(), keys };
  return keys;
}

export type IdClaims = { iss: string; aud: string; tid: string; exp: number; nbf?: number; nonce?: string;
  oid?: string; sub: string; name?: string; email?: string; preferred_username?: string; upn?: string };

export async function verifyIdToken(idToken: string, { tenantId, clientId, nonce }: { tenantId: string; clientId: string; nonce: string }): Promise<IdClaims> {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Пошкоджений токен входу');
  const header = b64urlDecodeJSON<{ alg: string; kid: string }>(parts[0]);
  const claims = b64urlDecodeJSON<IdClaims>(parts[1]);
  if (header.alg !== 'RS256') throw new Error('Неочікуваний алгоритм токена');

  let jwk = (await getKeys(tenantId)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await getKeys(tenantId, true)).find((k) => k.kid === header.kid); // keys rotate
  if (!jwk) throw new Error('Невідомий ключ підпису');

  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('Невірний підпис токена');

  const now = Date.now() / 1000;
  if (claims.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0`) throw new Error('Токен видав інший тенант');
  if (claims.aud !== clientId) throw new Error('Токен виданий іншому застосунку');
  if (claims.tid !== tenantId) throw new Error('Акаунт не з тенанта FREITTY');
  if (!claims.exp || now > claims.exp + 300) throw new Error('Токен прострочений');
  if (claims.nbf && now + 300 < claims.nbf) throw new Error('Токен ще не дійсний');
  if (!nonce || claims.nonce !== nonce) throw new Error('Запит на вхід не збігся, спробуйте ще раз');
  return claims;
}
