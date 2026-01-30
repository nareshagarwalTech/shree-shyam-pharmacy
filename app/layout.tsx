import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Shree Shyam Pharmacy | Your Trusted Neighbourhood Pharmacy in Hyderabad',
  description: 'Quality medicines at affordable prices with home delivery in Kukatpally, Hyderabad. Order via WhatsApp!',
  themeColor: '#10b981',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body className="bg-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
