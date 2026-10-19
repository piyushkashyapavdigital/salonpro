import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './shadcn/button';

/**
 * Last line of defence for a crash inside render.
 *
 * React unmounts the whole tree when an error escapes render, which on a phone
 * looks like the app closed or went blank — no message, no way back. This turns
 * that into a readable card with the real error text and a reload button, and
 * logs the component stack to the console so a crash report is actionable.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SalonPro] screen crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-50 px-6 text-center">
        <span className="text-4xl" aria-hidden>
          💔
        </span>
        <h1 className="text-lg font-semibold text-ink-900">This screen ran into a problem</h1>
        <p className="max-w-sm text-[13.5px] text-ink-500">
          {error.message || 'An unexpected error occurred while drawing this screen.'}
        </p>
        <Button onClick={() => window.location.reload()}>Reload the app</Button>
      </div>
    );
  }
}
