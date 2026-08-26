import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import Providers from '@/components/layout/Providers';

export const metadata: Metadata = {
  title: 'VidyaSetu — Connected Education for India',
  description: 'One connected education platform for student learning, schools, teachers, parents, competitions and education communities across India.',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.pexels.com" />
        <link rel="preconnect" href="https://images.pexels.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;600;700;800&family=Noto+Sans:wght@300;400;600&family=Noto+Sans+Devanagari:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
