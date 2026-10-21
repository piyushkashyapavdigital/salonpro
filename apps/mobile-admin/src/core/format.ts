/* ------------------------------------------------------------------
 * GENERATED FILE — do not edit here.
 * Source: packages/shared/src/format.ts
 * Re-run: bash scripts/sync-mobile-shared.sh
 * ------------------------------------------------------------------ */
/** Shared formatting + small pure helpers (safe to use on client and server). */

/** ₹1,234.50 from paise */
export function formatMoney(paise: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '\u20b9' : `${currency} `;
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const grouped = rupees.toLocaleString('en-IN');
  return `${sign}${symbol}${grouped}${p ? '.' + String(p).padStart(2, '0') : ''}`;
}

/** Compact: ₹1.2k */
export function formatMoneyShort(paise: number, currency = 'INR'): string {
  const symbol = currency === 'INR' ? '\u20b9' : `${currency} `;
  const rupees = Math.round(paise / 100);
  if (Math.abs(rupees) >= 10000000) return `${symbol}${(rupees / 10000000).toFixed(2)}Cr`;
  if (Math.abs(rupees) >= 100000) return `${symbol}${(rupees / 100000).toFixed(2)}L`;
  if (Math.abs(rupees) >= 1000) return `${symbol}${(rupees / 1000).toFixed(1)}k`;
  return `${symbol}${rupees}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export function maskPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}

/** "14:30" -> 870 minutes from midnight */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 870 -> "14:30" */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "14:30" -> "2:30 PM" */
export function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function weekdayIndex(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date;
  return d.getDay();
}

export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseCalendarDate(date: string): Date {
  // Date-only values are calendar dates, not UTC instants. Full ISO timestamps
  // (for example users.createdAt) must be parsed as-is or appending a time
  // produces an invalid value.
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date(date);
}

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = parseCalendarDate(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...opts });
}

export function formatDateLong(date: string): string {
  const d = parseCalendarDate(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) {
    const hours = Math.floor(diff / 3600000);
    if (hours <= 0) return 'just now';
    return `${hours}h ago`;
  }
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Deterministic id generator (no external dep). Prefixed, sortable-ish. */
export function newId(prefix: string): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 10);
  const r2 = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${t}${r}${r2}`;
}

/** Add N days to an ISO date string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

/** Whole days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00`).getTime();
  const d2 = new Date(`${b}T00:00:00`).getTime();
  return Math.round((d2 - d1) / 86400000);
}

export function titleCase(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    booked: 'Booked',
    confirmed: 'Confirmed',
    checked_in: 'Checked in',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No show',
    unpaid: 'Unpaid',
    partially_paid: 'Partially paid',
    paid: 'Paid',
    refunded: 'Refunded',
    pending: 'Pending',
    sent: 'Sent',
    delivered: 'Delivered',
    failed: 'Failed',
    suppressed: 'Suppressed',
    queued: 'Queued',
    credited: 'Credited',
    reversed: 'Reversed',
    rejected: 'Rejected',
    registered: 'Registered',
    qualified: 'Qualified',
    rewarded: 'Rewarded',
    posted: 'Posted',
    created: 'Created',
    attempted: 'Attempted',
    processed: 'Processed',
  };
  return map[status] ?? titleCase(status);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
