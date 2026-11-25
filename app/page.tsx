import { cookies } from 'next/headers';
import Dashboard from '@/components/Dashboard';
import { authConfig, SESSION_COOKIE, verify, type SessionUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const cfg = authConfig();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = cfg.missing.length ? null : await verify<SessionUser>(token, cfg.secret);
  return (
    <>
      {user && (
        <div className="userbar">
          <span>{user.name || user.email}</span>
          <a href="/api/auth/logout">Вийти</a>
        </div>
      )}
      <Dashboard />
    </>
  );
}
