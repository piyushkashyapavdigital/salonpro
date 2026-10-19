import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import { MemoryRouter } from 'react-router-dom';
import { TabDock, DockAction, type DockItem } from '../src/components/magic/tab-dock';
import { IconWallet } from '../src/components/icons';

/*
 * Native-feel / mobile UX regression suite.
 *
 * Every assertion here exists because something broke in a real APK build:
 * sideways page scrolling on the admin dashboard ("it scrolls like a website"),
 * a bottom dock whose items did not share width evenly, the Android hardware
 * back button doing nothing, and the status bar clashing with the app canvas.
 * These are assertions about behaviour and layout contracts, not pixel snaps.
 */

const WEB_ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(WEB_ROOT, rel), 'utf8');

/* ------------------------------------------------------------------ */
/* Shell / CSS contracts                                               */
/* ------------------------------------------------------------------ */

describe('mobile shell', () => {
  it('opts into edge-to-edge layout with a device-width viewport', () => {
    const html = read('index.html');
    expect(html).toMatch(/name="viewport"[^>]*width=device-width/);
    expect(html).toMatch(/viewport-fit=cover/);
  });

  it('tints the browser/PWA chrome to match the app canvas, not the dark hero card', () => {
    const html = read('index.html');
    const css = read('src/index.css');
    const themeColor = html.match(/name="theme-color" content="([^"]+)"/)?.[1];
    expect(themeColor).toBeTruthy();
    /* The blush canvas is what the stylesheet paints behind everything, and what
     * the native status bar is set to in `initNativeChrome()`. */
    expect(themeColor!.toUpperCase()).toBe('#FDF2F7');
    const native = read('src/lib/native.ts');
    expect(native).toMatch(/setBackgroundColor\(\{\s*color:\s*'#FDF2F7'/);
    expect(css).toBeTruthy();
  });

  it('pads the safe areas so nothing hides under the notch or the dock', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/--safe-top:\s*env\(safe-area-inset-top/);
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom/);
    expect(css).toMatch(/\.pb-nav\s*\{[^}]*var\(--safe-bottom\)/);
  });

  it('lets cards shrink inside grid/flex containers instead of forcing a horizontal scroll', () => {
    const css = read('src/index.css');
    /* Root cause fix for the "scrolls left ↔ right like a web page" bug: a grid
     * item defaults to min-width:auto, so one long value widens the page. The
     * utility compiles to `min-width: 0`; the literal is accepted too. */
    expect(css).toMatch(/\.card\s*\{[^}]*min-w-0|\.card\s*\{[^}]*min-width:\s*0/);
  });

  it('never masks overflow with overflow-x: hidden (the bug would come back)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(css|ts|tsx|html)$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          if (/overflow-x:\s*hidden/.test(text)) offenders.push(path.relative(WEB_ROOT, full));
        }
      }
    };
    walk(path.join(WEB_ROOT, 'src'));
    if (/overflow-x:\s*hidden/.test(read('index.html'))) offenders.push('index.html');
    expect(offenders).toEqual([]);
  });

  it('clips stray horizontal overflow at the shell level on both apps', () => {
    const layout = read('src/components/layout.tsx');
    const clips = layout.match(/overflow-x-clip/g) ?? [];
    expect(clips.length).toBeGreaterThanOrEqual(2); // customer shell + admin shell
  });

  it('disables rubber-banding and the 300ms tap delay', () => {
    const css = read('src/index.css');
    expect(css).toMatch(/overscroll-behavior-y:\s*none/);
    expect(css).toMatch(/touch-action:\s*manipulation/);
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
  });

  it('honours prefers-reduced-motion', () => {
    expect(read('src/index.css')).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    /* CSS covers the CSS-driven animations; Framer Motion needs telling. */
    expect(read('src/App.tsx')).toMatch(/MotionConfig reducedMotion="user"/);
  });

  it('keeps the dock reachable with a thumb: fixed, centred and capped in width', () => {
    const layout = read('src/components/layout.tsx');
    expect(layout).toMatch(/fixed bottom-0[^"]*max-w-\[560px\]/);
  });
});

/* ------------------------------------------------------------------ */
/* Bottom navigation                                                   */
/* ------------------------------------------------------------------ */

const ITEMS: DockItem[] = [
  { to: '/app', label: 'Home', icon: IconWallet, end: true },
  { to: '/app/services', label: 'Services', icon: IconWallet },
  { to: '/app/bookings', label: 'Bookings', icon: IconWallet },
  { to: '/app/wallet', label: 'Wallet', icon: IconWallet },
  { to: '/app/profile', label: 'Profile', icon: IconWallet },
];

function renderDock(initial = '/app') {
  const onSelect = vi.fn();
  const utils = render(
    <MemoryRouter initialEntries={[initial]}>
      <div data-testid="bar">
        <TabDock items={ITEMS} layoutId="test-dock" onSelect={onSelect} />
        <DockAction label="More" icon={IconWallet} onClick={() => {}} />
      </div>
    </MemoryRouter>,
  );
  return { ...utils, onSelect };
}

describe('bottom dock', () => {
  it('renders tabs and the "More" action as siblings of one flex bar', () => {
    renderDock();
    const bar = screen.getByTestId('bar');
    /* The regression: a wrapper element made the tabs 91px wide and pushed the
     * active pill out of alignment. Tabs must be direct children. */
    expect(bar.children).toHaveLength(ITEMS.length + 1);
    for (const child of Array.from(bar.children)) {
      expect(child.className).toContain('flex-1');
      expect(child.className).toContain('min-w-0');
    }
  });

  it('gives every tab the same geometry classes, so widths stay even', () => {
    renderDock();
    const bar = screen.getByTestId('bar');
    const tabs = Array.from(bar.children).slice(0, ITEMS.length) as HTMLElement[];
    /* React Router appends its own `active` token to the className string;
     * everything else must be identical or the tabs drift out of alignment. */
    const geometry = tabs.map((t) => t.className.split(/\s+/).filter((c) => c !== 'active').sort().join(' '));
    expect(new Set(geometry).size).toBe(1);
    for (const cls of ['flex-1', 'min-w-0', 'flex-col', 'items-center']) {
      expect(geometry[0]).toContain(cls);
    }
  });

  it('labels every tab in the dock, for touch and for screen readers', () => {
    renderDock();
    for (const item of ITEMS) expect(screen.getByText(item.label)).toBeInTheDocument();
    /* Each tab is a real link: long-press/copy/accessibility all work. */
    for (const item of ITEMS) expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.to);
  });

  it('reports selection so the caller can fire haptics', async () => {
    const { onSelect } = renderDock();
    await userEvent.click(screen.getByRole('link', { name: 'Wallet' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ */
/* Native bridge behaviour                                             */
/* ------------------------------------------------------------------ */

describe('native bridge on the web', () => {
  it('reports "not native" and every helper is a safe no-op', async () => {
    const native = await import('../src/lib/native');
    expect(native.isNative()).toBe(false);
    await expect(native.initNativeChrome()).resolves.toBeUndefined();
    await expect(native.hapticTap()).resolves.toBeUndefined();
    await expect(native.hapticSuccess()).resolves.toBeUndefined();
    await expect(native.hapticError()).resolves.toBeUndefined();
    const unsubscribe = await native.initBackButton();
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('shares via the Web Share API when the platform has it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText: vi.fn() } });
    const native = await import('../src/lib/native');
    await expect(native.shareText('SalonPro', 'BOOK-50')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: 'BOOK-50' }));
  });

  it('falls back to the clipboard when sharing is unavailable, and says which happened', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    const native = await import('../src/lib/native');
    await expect(native.shareText('SalonPro', 'BOOK-50')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('BOOK-50');
  });

  it('reports a dismissed share rather than claiming success', async () => {
    const share = vi.fn().mockRejectedValue(new Error('user cancelled'));
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText: vi.fn() } });
    const native = await import('../src/lib/native');
    await expect(native.shareText('SalonPro', 'BOOK-50')).resolves.toBe('dismissed');
  });
});

describe('native bridge on Android', () => {
  const exitApp = vi.fn();
  let backHandler: ((event: { canGoBack: boolean }) => void) | null = null;
  let hint: () => void;

  beforeEach(async () => {
    vi.resetModules();
    backHandler = null;
    exitApp.mockClear();
    hint = vi.fn();
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
    }));
    vi.doMock('@capacitor/app', () => ({
      App: {
        addListener: async (_event: string, handler: (event: { canGoBack: boolean }) => void) => {
          backHandler = handler;
          return { remove: async () => {} };
        },
        exitApp,
      },
    }));
    vi.doMock('@capacitor/status-bar', () => ({
      StatusBar: { setStyle: async () => {}, setBackgroundColor: async () => {}, setOverlaysWebView: async () => {} },
      Style: { Dark: 'DARK' },
    }));
    vi.doMock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: async () => {} } }));
    vi.doMock('@capacitor/haptics', () => ({
      Haptics: { impact: async () => {}, notification: async () => {} },
      ImpactStyle: { Light: 'LIGHT' },
      NotificationType: { Success: 'SUCCESS', Error: 'ERROR' },
    }));
    vi.doMock('@capacitor/share', () => ({ Share: { share: async () => {} } }));
  });

  afterEach(() => {
    vi.doUnmock('@capacitor/core');
    vi.doUnmock('@capacitor/app');
  });

  it('detects the native platform and applies the themed chrome', async () => {
    const native = await import('../src/lib/native');
    expect(native.isNative()).toBe(true);
    expect(native.nativePlatform()).toBe('android');
    await expect(native.initNativeChrome()).resolves.toBeUndefined();
  });

  it('navigates back inside the app rather than exiting', async () => {
    window.history.pushState({}, '', '/app/book');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const native = await import('../src/lib/native');
    await native.initBackButton(hint);
    backHandler!({ canGoBack: true });
    expect(back).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();
    expect(hint).not.toHaveBeenCalled();
    back.mockRestore();
    window.history.pushState({}, '', '/');
  });

  it('double-press to exit, exactly like a native app', async () => {
    window.history.pushState({}, '', '/app');
    const native = await import('../src/lib/native');
    await native.initBackButton(hint);

    backHandler!({ canGoBack: false });
    expect(exitApp).not.toHaveBeenCalled();
    expect(hint).toHaveBeenCalledTimes(1);

    backHandler!({ canGoBack: false });
    expect(exitApp).toHaveBeenCalledTimes(1);
    window.history.pushState({}, '', '/');
  });

  it('forgets the first press once enough time has passed', async () => {
    window.history.pushState({}, '', '/app');
    const native = await import('../src/lib/native');
    await native.initBackButton(hint);

    const now = Date.now();
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValue(now);
    backHandler!({ canGoBack: false });
    clock.mockReturnValue(now + 5000);
    backHandler!({ canGoBack: false });
    expect(exitApp).not.toHaveBeenCalled();
    expect(hint).toHaveBeenCalledTimes(2);
    clock.mockRestore();
    window.history.pushState({}, '', '/');
  });
});
