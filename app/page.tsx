import AdsDashboard from '@/components/AdsDashboard';
import Nav from '@/components/Nav';
import { currentUserFromCookies } from '@/lib/user';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await currentUserFromCookies();
  return (
    <>
      <Nav active="/" user={user && { name: user.name, email: user.email }} />
      <AdsDashboard />
    </>
  );
}
