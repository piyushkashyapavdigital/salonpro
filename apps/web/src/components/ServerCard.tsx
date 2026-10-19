import { useState } from 'react';
import { buildApiBase, checkApiBase, getApiBase, normalizeApiBase, setApiBase } from '../lib/api';
import { Alert, Button, Card, Field, Input } from './ui';

/**
 * "Which server does this app talk to?"
 *
 * The APK has to be built against *some* address, but that address is only a
 * default: a phone pointed at a salon's server needs a way to change it (the
 * LAN address changes, the owner moves the API, or the app was shared with
 * someone else). This card is that way in — it tests the address against
 * `/api/health` before saving, so a wrong address can never look "connected",
 * and it only appears in the native apps where the setting is meaningful.
 */
export function ServerCard({
  defaultOpen = false,
  onSaved = () => {
    window.setTimeout(() => window.location.reload(), 900);
  },
}: {
  defaultOpen?: boolean;
  /** What to do once a new address is stored (tests pass a spy). */
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [value, setValue] = useState(() => getApiBase());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const current = getApiBase();
  const fallback = buildApiBase();

  const save = async () => {
    setBusy(true);
    setResult(null);
    const check = await checkApiBase(value);
    setResult(check);
    if (check.ok) {
      setApiBase(value);
      /* Every query, cached page and the stored session belong to the old
       * server — a reload is the only honest way to switch. */
      onSaved();
    }
    setBusy(false);
  };

  return (
    <Card className="mt-4 overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0">
          <span className="block text-[13.5px] font-semibold text-ink-800">Server</span>
          <span className="block truncate text-[12px] text-ink-400">{current || 'same origin'}</span>
        </span>
        <span className="shrink-0 pl-3 text-ink-400">{open ? '−' : '+'}</span>
      </button>

      {open ? (
        <div className="border-t border-ink-100 p-4">
          <Field
            label="SalonPro server address"
            hint="The address of the API, e.g. http://192.168.1.34:4000 or https://salon.example.com"
          >
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
              placeholder="http://192.168.1.34:4000"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>

          {result ? (
            <Alert tone={result.ok ? 'success' : 'danger'} className="mt-3">
              {result.message}
            </Alert>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="brand" size="sm" loading={busy} onClick={() => void save()}>
              Test and save
            </Button>
            {fallback && normalizeApiBase(value) !== fallback ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setValue(fallback);
                  setResult(null);
                }}
              >
                Use built-in default
              </Button>
            ) : null}
          </div>

          <p className="mt-3 text-[11.5px] leading-snug text-ink-400">
            The app is reachable only while the server is running and this phone can reach it — same Wi-Fi, or a
            publicly hosted address.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
