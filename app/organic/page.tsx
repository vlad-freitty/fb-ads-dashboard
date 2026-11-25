import OrganicDashboard from '@/components/OrganicDashboard';
import Nav from '@/components/Nav';
import { currentUserFromCookies } from '@/lib/user';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Органіка · Freight Box Hub' };

export default async function Page() {
  const user = await currentUserFromCookies();
  return (
    <>
      <Nav active="/organic" user={user && { name: user.name, email: user.email }} />
      <OrganicDashboard />
    </>
  );
}
