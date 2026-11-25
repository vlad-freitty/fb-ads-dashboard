import Dashboard from '@/components/Dashboard';
import { auth, signOut } from '@/auth';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await auth();
  const user = session?.user?.name || session?.user?.email || null;
  return (
    <>
      {user && (
        <form className="userbar" action={async () => { 'use server'; await signOut({ redirectTo: '/signin' }); }}>
          <span>{user}</span>
          <button type="submit">Вийти</button>
        </form>
      )}
      <Dashboard />
    </>
  );
}
