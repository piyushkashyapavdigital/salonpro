import type { OpeningHours, SalonSettings, WorkingHours } from '@salonpro/shared';
import { parseJson } from '../db';

export const DEFAULT_TEMPLATES: SalonSettings['templates'] = {
  day7:
    'Hello {{customer_name}}! It’s time for your next grooming session at {{salon_name}}. Our evening slots may be available today. Book your preferred time here: {{booking_link}}',
  day14:
    'Hello {{customer_name}}! We would love to welcome you back to {{salon_name}}. Book your next salon visit and enjoy a fresh look: {{booking_link}}',
  day30:
    'Hello {{customer_name}}, we miss you at {{salon_name}}! Enjoy a special welcome-back offer on your next visit. Book here: {{booking_link}}',
  appointment_confirmation:
    'Hello {{customer_name}}, your appointment at {{salon_name}} is scheduled for {{appointment_date}} at {{appointment_time}}. Manage your booking here: {{booking_link}}',
  referral_reward:
    'Great news {{customer_name}}! Your referral reward of {{reward_amount}} has been credited to your {{salon_name}} wallet.',
  wallet_credit:
    'Hello {{customer_name}}, {{amount}} has been added to your {{salon_name}} wallet. Your balance is {{balance}}.',
};

export const DEFAULT_SALON_SETTINGS: SalonSettings = {
  spendingOrder: ['bonus', 'cash'],
  reminderStages: ['day7', 'day14', 'day30'],
  reminderChannels: ['whatsapp', 'push'],
  referral: {
    referrerReward: 5000,
    refereeReward: 5000,
    currency: 'INR',
    maxRewardsPerMonth: 10,
    requireFirstPaidVisit: true,
  },
  bonusExpiryDays: null,
  cashExpiryDays: null,
  slotGranularityMinutes: 15,
  loyaltyEnabled: true,
  loyaltyPointsPerHundred: 1,
  templates: DEFAULT_TEMPLATES,
  googlePlaceId: null,
};

export function readSettings(raw: unknown): SalonSettings {
  const stored = parseJson<Partial<SalonSettings>>(raw, {});
  return {
    ...DEFAULT_SALON_SETTINGS,
    ...stored,
    referral: { ...DEFAULT_SALON_SETTINGS.referral, ...(stored.referral ?? {}) },
    templates: { ...DEFAULT_TEMPLATES, ...(stored.templates ?? {}) },
    googlePlaceId:
      typeof stored.googlePlaceId === 'string' && stored.googlePlaceId.trim()
        ? stored.googlePlaceId.trim()
        : null,
  };
}

export function fullWeekHours(open = '09:00', close = '21:00', closedDays: number[] = []): OpeningHours {
  const hours: OpeningHours = {};
  for (let d = 0; d < 7; d++) {
    hours[d] = { closed: closedDays.includes(d), open, close };
  }
  return hours;
}

export function fullWeekWorkingHours(start = '10:00', end = '20:00', offDays: number[] = []): WorkingHours {
  const wh: WorkingHours = {};
  for (let d = 0; d < 7; d++) {
    wh[d] = { off: offDays.includes(d), start, end };
  }
  return wh;
}

/** Interpolate {{placeholders}} in a template. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}
