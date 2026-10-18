import { Toaster as SonnerToaster } from 'sonner';

/**
 * Sonner-based toaster, themed to the SalonPro palette.
 * Mount once (in `main.tsx`); raise toasts with `toast()` from `sonner`
 * or the app-level `useToast()` wrapper in `components/Toast.tsx`.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={16}
      gap={10}
      duration={3200}
      visibleToasts={3}
      closeButton={false}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast:
            'group toast !rounded-2xl !border !border-border !bg-card !text-ink-900 !shadow-lift !font-sans !text-[13.5px] !px-4 !py-3.5',
          title: '!font-semibold !text-[13.5px]',
          description: '!text-ink-400 !text-[12.5px]',
          icon: '!mr-1',
          success: '!border-mint-500/25',
          error: '!border-rose-500/25',
          info: '!border-brand-200',
          loading: '!border-brand-200',
        },
      }}
    />
  );
}
