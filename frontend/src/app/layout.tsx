import type { Metadata, Viewport } from 'next';
import type { CSSProperties, ReactNode } from 'react';
import './globals.css';
import Providers from '@/components/layout/Providers';
import { MOBILE_NAV_THEME } from '../../../shared/ui/mobileNavigationTheme';

export const metadata: Metadata = {
  title: 'VidyaSetu — Connected Education for India',
  description: 'One connected education platform for student learning, schools, teachers, parents, competitions and education communities across India.',
  applicationName: 'VidyaSetu',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'VidyaSetu',
  },
};

export const viewport: Viewport = {
  themeColor: MOBILE_NAV_THEME.orange,
};

const sharedThemeStyle = {
  '--mobile-nav-bg': MOBILE_NAV_THEME.orange,
  '--mobile-nav-edge': MOBILE_NAV_THEME.orangeEdge,
  '--mobile-nav-ink': MOBILE_NAV_THEME.navy,
  '--mobile-nav-active': MOBILE_NAV_THEME.cream,
  '--mobile-nav-button-border': MOBILE_NAV_THEME.buttonBorder,
} as CSSProperties;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="hi" style={sharedThemeStyle}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
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
