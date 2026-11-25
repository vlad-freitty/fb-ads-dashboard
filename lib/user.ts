import { cookies } from 'next/headers';
import { authConfig, SESSION_COOKIE, verify, type SessionUser } from '@/lib/auth/session';

/** The signed-in user for server components, or null (local preview without sign-in). */
export async function currentUserFromCookies(): Promise<SessionUser | null> {
  const cfg = authConfig();
  if (cfg.missing.length) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verify<SessionUser>(token, cfg.secret);
}
