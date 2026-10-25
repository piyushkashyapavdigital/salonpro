import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/* Bundled, not fetched at runtime: the wordmark and the review page must look
 * identical on a slow phone in a salon with one bar of signal. */
const serif = localFont({
  src: [
    { path: './fonts/InstrumentSerif-Regular.ttf', weight: '400', style: 'normal' },
    { path: './fonts/InstrumentSerif-Italic.ttf', weight: '400', style: 'italic' },
  ],
  variable: '--font-serif',
  display: 'swap',
});

const sans = localFont({
  src: [{ path: './fonts/Manrope.ttf', weight: '200 800', style: 'normal' }],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://salonpro-rosy.vercel.app'),
  title: {
    default: 'SalonPro — every chair, one quiet app',
    template: '%s · SalonPro',
  },
  description:
    'Bookings, walk-ins, wallets, private reviews and the numbers that matter — one app for the client, the salon and the platform.',
  applicationName: 'SalonPro',
  openGraph: {
    title: 'SalonPro — every chair, one quiet app',
    description: 'The salon operating system: clients, team and platform in one place.',
    type: 'website',
  },
  /* The icon, apple-icon and favicon files next to this layout are picked up
     automatically by Next's metadata file convention. */
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F2EDE4',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
