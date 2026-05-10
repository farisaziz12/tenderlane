import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tenderlane - Next.js Stripe Checkout',
  description: 'End-to-end Tenderlane checkout with Stripe',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
