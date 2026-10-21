import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SalonPro Reviews',
    template: '%s · SalonPro',
  },
  description: 'Share a private review for your salon visit. Only the salon team can see it.',
  applicationName: 'SalonPro',
  /* The icon, apple-icon and favicon files next to this layout are picked up
     automatically by Next's metadata file convention. */
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F7F3EC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
