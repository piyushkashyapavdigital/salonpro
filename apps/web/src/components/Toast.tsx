import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, Sparkles } from 'lucide-react';
import { toast as sonner } from 'sonner';
import { Toaster } from './shadcn/sonner';
import { hapticError, hapticSuccess } from '../lib/native';

type Tone = 'success' | 'error' | 'info' | 'brand';

interface ToastApi {
  push: (toast: { tone: Tone; title: string; description?: string }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  brand: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<Tone, ReactNode> = {
  success: <CircleCheck className="h-[18px] w-[18px] text-mint-500" />,
  error: <CircleAlert className="h-[18px] w-[18px] text-rose-500" />,
  info: <Info className="h-[18px] w-[18px] text-sky-500" />,
  brand: <Sparkles className="h-[18px] w-[18px] text-brand-500" />,
};

/**
 * App-level toast API. Rendered with Sonner (see `components/shadcn/sonner`),
 * so call sites keep using `useToast()` while the presentation stays animated
 * and native-feeling. Successes and failures also fire haptics on device.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const push = useCallback(({ tone, title, description }: { tone: Tone; title: string; description?: string }) => {
    if (tone === 'success') void hapticSuccess();
    if (tone === 'error') void hapticError();
    sonner(title, { description, icon: ICONS[tone] });
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description) => push({ tone: 'error', title, description }),
      info: (title, description) => push({ tone: 'info', title, description }),
      brand: (title, description) => push({ tone: 'brand', title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
