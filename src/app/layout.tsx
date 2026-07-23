import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';

// One typeface for the whole app (UI + figures). Inter has a plain zero. If the getdesign.md
// pick specifies a different font WITH a plain zero, swap it here and update --font-app usage.
const appFont = Inter({
  subsets: ['latin'],
  variable: '--font-app',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kapsoon',
  description: 'Track your coffee capsules — stock, cups a day, and what you spend.',
  manifest: '/manifest.webmanifest',
  // One SVG serves every favicon slot — browsers scale it, so there's no .ico to regenerate. The
  // PNGs below it exist only for the installed-app icon, where Android still wants a raster.
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#101114',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={appFont.variable}>
      {/* The app shell (header + views + sticky nav) owns internal padding and safe-area insets. */}
      <body className="mx-auto min-h-dvh max-w-[430px]">{children}</body>
    </html>
  );
}
