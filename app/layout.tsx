import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

const manrope = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = {
  title: 'Freight Box Hub · Аналітика Meta',
  description: 'Реклама й органіка в Meta: ліди, ціна ліда, підписники, перегляди і найкращі публікації',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={manrope.variable}>
      <body>
        <a href="#main" className="skip caption-3">Перейти до вмісту</a>
        {children}
      </body>
    </html>
  );
}
