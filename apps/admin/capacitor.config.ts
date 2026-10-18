import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Standalone owner/staff app. This is a *second* native shell that shares the
 * same web source as the customer app but is built with `VITE_APP_MODE=admin`
 * (output: `apps/web/dist-admin`, dashboard-only).
 *
 * `androidScheme: 'http'` + `cleartext: true` let it talk to the SalonPro API
 * over the local network during development (e.g. http://192.168.1.34:4000).
 */
const config: CapacitorConfig = {
  appId: 'com.salonpro.admin',
  appName: 'SalonPro Admin',
  webDir: '../web/dist-admin',
  backgroundColor: '#FDF2F7',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 1200,
      // Fade is configured here (not on hide()) — Android ignores fadeOutDuration
      // for the launch splash and warns about it otherwise.
      launchFadeOutDuration: 280,
      backgroundColor: '#FDF2F7',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#FDF2F7',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
