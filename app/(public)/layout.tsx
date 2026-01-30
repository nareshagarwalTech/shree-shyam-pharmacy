import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shree Shyam Pharmacy | Your Trusted Neighbourhood Pharmacy in Hyderabad',
  description: 'Quality medicines at affordable prices with home delivery. Trusted pharmacy in Kukatpally, Hyderabad serving the community since 2010. Order via WhatsApp!',
  keywords: 'pharmacy, medical store, medicines, Hyderabad, Kukatpally, home delivery, WhatsApp order, healthcare',
  openGraph: {
    title: 'Shree Shyam Pharmacy | Your Trusted Neighbourhood Pharmacy',
    description: 'Quality medicines at affordable prices with home delivery in Hyderabad',
    type: 'website',
  },
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
