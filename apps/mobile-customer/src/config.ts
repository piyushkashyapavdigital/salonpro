/**
 * Build-time configuration for the customer app.
 *
 * `BUILD_API_BASE` is where this build looks for the API by default. It is only
 * a default: the sign-in screen has a "Salon server address" card that stores a
 * different server on the phone, which is how one APK can be handed to any
 * salon. The release script rewrites this file from `SALONPRO_API_BASE` so a
 * published APK points at the hosted API out of the box.
 */
export const BUILD_API_BASE = 'https://salonpro-rosy.vercel.app';

/** One-tap options shown next to the address field. */
export const SERVER_PRESETS: string[] = [
  'http://192.168.1.34:4000',
  'http://10.0.2.2:4000',
];

export const APP_VERSION = '1.0.4';
export const APP_NAME = 'SalonPro';

/** Which APK this is — selects the matching asset from the GitHub release. */
export const APP_FLAVOR: 'customer' | 'admin' = 'customer';
