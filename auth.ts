import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

// Microsoft Entra ID sign-in. Who may sign in is controlled in Entra:
// Enterprise applications -> this app -> Properties -> "Assignment required?" = Yes,
// then add the people or groups under "Users and groups".
export const entraConfigured = () =>
  Boolean(process.env.AUTH_SECRET && process.env.AUTH_MICROSOFT_ENTRA_ID_ID
    && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET && process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  ],
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: '/signin', error: '/signin' },
});
