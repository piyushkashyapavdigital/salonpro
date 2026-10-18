import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor wraps the built web app (`dist/`) into a native Android shell.
 *
 * `androidScheme: 'http'` + `cleartext: true` let the packaged app talk to the
 * SalonPro API over the local network during development
 * (e.g. http://192.168.1.34:4000). For production, host the API over HTTPS and
 * point `VITE_API_BASE` at it instead.
 */
const config: CapacitorConfig = {
  appId: 'com.salonpro.app',
  appName: 'SalonPro',
  webDir: 'dist',
  // Blush webview background so there is never a white flash on launch.
  backgroundColor: '#FDF2F7',
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    // `launchAutoHide: false` keeps the splash up until React has mounted and
    // `SplashScreen.hide()` runs in `lib/native.ts` — a clean native hand-off.
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
