import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tenderlane — Checkout Demo',
  description: 'Reactive payment orchestration demo',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
