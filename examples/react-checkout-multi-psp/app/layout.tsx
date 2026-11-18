import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tenderlane example checkout',
  description: 'One checkout routed between payment providers by application state.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
