import type { Metadata } from 'next';
import './globals.css';
import { PHARMACY_INFO } from '@/lib/constants';
import { AuthProvider } from '@/components/AuthProvider';
import ProtectedRoute from '@/components/ProtectedRoute';

export const metadata: Metadata = {
  title: `${PHARMACY_INFO.name} - Customer Reminders`,
  description: 'Medication refill reminder system',
  manifest: '/manifest.json',
  themeColor: '#f97316',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="bg-gray-50 min-h-screen">
        <AuthProvider>
          <ProtectedRoute>
            {children}
          </ProtectedRoute>
        </AuthProvider>
      </body>
    </html>
  );
}
