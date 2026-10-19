import { Capacitor } from '@capacitor/core';

/**
 * Thin, lazily-imported wrapper around the Capacitor plugins.
 *
 * Everything here is a no-op on the web (and in jsdom tests), so the same
 * components run in the browser, the PWA and both Android apps.
 */

export const isNative = () => Capacitor.isNativePlatform();
export const nativePlatform = () => Capacitor.getPlatform();

/* ------------------------------------------------------------------ */
/* App chrome (splash, status bar)                                     */
/* ------------------------------------------------------------------ */

export async function initNativeChrome() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // `Style.Dark` = dark glyphs, for our light blush canvas.
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#FDF2F7' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    /* status bar plugin unavailable — ignore */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    // The launch fade is configured via `launchFadeOutDuration` in capacitor.config.ts.
    await SplashScreen.hide();
  } catch {
    /* splash already hidden */
  }
}

/* ------------------------------------------------------------------ */
/* Hardware back button                                                */
/* ------------------------------------------------------------------ */

/**
 * Android hardware back: pop the SPA history, otherwise double-tap-to-exit —
 * exactly what a native app does. Returns an unsubscribe function.
 *
 * The only trustworthy "is there anywhere to go back to" signal is Capacitor's
 * `canGoBack`, which mirrors the WebView's own `canGoBack()`. Do not reach for
 * `window.history.length`: it counts entries the user has already popped (a
 * back press leaves the count unchanged), so a deeper stack would pin the app
 * in a `history.back()` no-op loop and the back button would appear dead.
 */
export async function initBackButton(onExitBlocked?: () => void) {
  if (!isNative()) return () => {};

  const { App } = await import('@capacitor/app');
  let lastPress = 0;

  const listener = await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
      return;
    }

    const now = Date.now();
    if (now - lastPress < 2000) {
      App.exitApp();
      return;
    }
    lastPress = now;
    onExitBlocked?.();
  });

  return () => {
    void listener.remove();
  };
}

/* ------------------------------------------------------------------ */
/* Haptics                                                             */
/* ------------------------------------------------------------------ */

export async function hapticTap() {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    /* ignore */
  }
}

export async function hapticSuccess() {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* ignore */
  }
}

export async function hapticError() {
  if (!isNative()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Share                                                               */
/* ------------------------------------------------------------------ */

/** Native share sheet on device, Web Share on mobile web, clipboard otherwise. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied' | 'dismissed'> {
  if (isNative()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    } catch {
      return 'dismissed';
    }
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch {
      return 'dismissed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'dismissed';
  }
}
