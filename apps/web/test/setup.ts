import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

/* jsdom does not implement scrolling; the shells call it on every route change. */
window.scrollTo = (() => {}) as unknown as typeof window.scrollTo;

/* jsdom does not implement ResizeObserver, which recharts' ResponsiveContainer
 * needs to size itself. The stub reports a phone-sized box on `observe` so the
 * chart actually draws its axes in tests instead of collapsing to nothing. */
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      const rect = { width: 480, height: 240, top: 0, left: 0, bottom: 240, right: 480, x: 0, y: 0, toJSON: () => ({}) };
      this.callback([{ target, contentRect: rect, borderBoxSize: [], contentBoxSize: [] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

/* jsdom does not implement matchMedia, which some components probe. */
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
