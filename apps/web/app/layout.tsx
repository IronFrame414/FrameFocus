import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FrameFocus — Construction Management',
  description: 'The all-in-one platform for residential and commercial contractors.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
