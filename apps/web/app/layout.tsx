import type { Metadata } from 'next';
import { Barlow, IBM_Plex_Mono } from 'next/font/google';
import { brand } from '@/lib/brand';
import './globals.css';

// ui-01 §S2 — the two 1a families, loaded via next/font (no other mechanism
// existed). Barlow = all UI text; IBM Plex Mono = all numbers + micro-labels.
// Do NOT load Barlow Semi Condensed (1c only).
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-barlow',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: `${brand.name} — Construction Management`,
  description: 'The all-in-one platform for residential and commercial contractors.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${barlow.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
