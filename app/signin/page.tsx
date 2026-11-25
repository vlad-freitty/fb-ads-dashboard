import { entraConfigured, signIn } from '@/auth';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  AccessDenied: 'Вашому акаунту не надано доступ до дашборду. Зверніться до адміністратора.',
  Configuration: 'Вхід налаштований неправильно. Перевірте змінні Entra у Vercel.',
};

export default async function SignIn({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const callbackUrl = sp.callbackUrl?.startsWith('/') && !sp.callbackUrl.startsWith('//') ? sp.callbackUrl : '/';
  const error = sp.error ? ERRORS[sp.error] ?? 'Не вдалося увійти. Спробуйте ще раз.' : null;
  const ready = entraConfigured();

  return (
    <main className="signin">
      <div className="card signin-card">
        <p className="eyebrow">Meta Ads · Freight Box Hub</p>
        <h1>Ліди з Facebook Ads</h1>
        {ready ? (
          <>
            <p className="note">Увійдіть робочим акаунтом Microsoft.</p>
            {error && <p className="error">{error}</p>}
            <form action={async () => {
              'use server';
              await signIn('microsoft-entra-id', { redirectTo: callbackUrl });
            }}>
              <button type="submit" className="primary">Увійти через Microsoft</button>
            </form>
          </>
        ) : (
          <p className="note">Вхід через Microsoft ще не налаштований.</p>
        )}
      </div>
    </main>
  );
}
