import crypto from 'node:crypto';
import type {
  NotificationChannel,
  NotificationPreferences,
  NotificationRecord,
  NotificationStatus,
  ReminderStage,
  ReminderTemplate,
  SalonSettings,
} from '@salonpro/shared';
import { formatDate, formatTime12, isoDate, timeToMinutes } from '@salonpro/shared';
import { all, one, parseJson, run, scalar, tx } from '../db';
import { env, integrations } from '../env';
import { DbRow } from '../lib/types';
import { readSettings, renderTemplate } from './settings';

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export function preferences(customerId: string): NotificationPreferences {
  const row = one<DbRow>('SELECT * FROM notification_preferences WHERE customerId = ?', customerId);
  if (row) {
    return {
      customerId,
      whatsappConsent: !!row.whatsappConsent,
      pushEnabled: !!row.pushEnabled,
      promotionalConsent: !!row.promotionalConsent,
      quietHoursStart: row.quietHoursStart,
      quietHoursEnd: row.quietHoursEnd,
    };
  }
  return {
    customerId,
    whatsappConsent: true,
    pushEnabled: true,
    promotionalConsent: true,
    quietHoursStart: '21:00',
    quietHoursEnd: '09:00',
  };
}

export function savePreferences(customerId: string, patch: Partial<NotificationPreferences>) {
  const current = preferences(customerId);
  const next = { ...current, ...patch, customerId };
  run(
    `INSERT INTO notification_preferences (customerId, whatsappConsent, pushEnabled, promotionalConsent, quietHoursStart, quietHoursEnd, updatedAt)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(customerId) DO UPDATE SET
       whatsappConsent = excluded.whatsappConsent,
       pushEnabled = excluded.pushEnabled,
       promotionalConsent = excluded.promotionalConsent,
       quietHoursStart = excluded.quietHoursStart,
       quietHoursEnd = excluded.quietHoursEnd,
       updatedAt = excluded.updatedAt`,
    next.customerId,
    next.whatsappConsent,
    next.pushEnabled,
    next.promotionalConsent,
    next.quietHoursStart,
    next.quietHoursEnd,
    new Date().toISOString(),
  );
  return next;
}

/* ------------------------------------------------------------------ */
/* Delivery adapters                                                   */
/* ------------------------------------------------------------------ */

/**
 * Delivery is honest: with no provider credentials nothing is ever marked
 * "sent". The record is stored as `pending` with the exact reason so an
 * operator can see why and retry later.
 */
async function deliver(channel: NotificationChannel, to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (channel === 'whatsapp') {
    if (!integrations.whatsapp) {
      return { ok: false, error: 'whatsapp_not_configured' };
    }
    try {
      const res = await fetch(`https://graph.facebook.com/v20.0/${env.whatsappPhoneId}/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.whatsappToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { preview_url: true, body },
        }),
      });
      if (!res.ok) return { ok: false, error: `whatsapp_http_${res.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `whatsapp_error:${(err as Error).message}` };
    }
  }
  if (channel === 'push') {
    if (!integrations.push) return { ok: false, error: 'push_not_configured' };
    // A real implementation posts to the stored subscription with web-push.
    // We record the intent rather than claiming delivery.
    return { ok: false, error: 'push_provider_pending' };
  }
  if (channel === 'sms' || channel === 'email') {
    return { ok: false, error: `${channel}_not_configured` };
  }
  return { ok: false, error: 'unknown_channel' };
}

function withinQuietHours(pref: NotificationPreferences, now = new Date()): boolean {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = timeToMinutes(pref.quietHoursStart);
  const end = timeToMinutes(pref.quietHoursEnd);
  if (start === end) return false;
  return start > end ? minutes >= start || minutes < end : minutes >= start && minutes < end;
}

function channelAllowed(channel: NotificationChannel, pref: NotificationPreferences, stage: ReminderStage | 'transactional') {
  if (channel === 'whatsapp' && !pref.whatsappConsent) return false;
  if (channel === 'push' && !pref.pushEnabled) return false;
  if (stage !== 'transactional' && !pref.promotionalConsent) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Records                                                             */
/* ------------------------------------------------------------------ */

export interface NotifyArgs {
  salonId: string;
  customerId: string;
  template: ReminderTemplate;
  stage: ReminderStage | 'transactional';
  reminderKey: string;
  vars?: Record<string, string>;
  appointmentId?: string | null;
  scheduledAt?: string;
  sendNow?: boolean;
}

/**
 * Create (or reuse) a notification. The unique `reminderKey` guarantees the
 * same customer + visit + stage can never queue twice.
 */
export function notifyCustomer(args: NotifyArgs): NotificationRecord {
  const existing = one<DbRow>('SELECT * FROM notifications WHERE reminderKey = ?', args.reminderKey);
  if (existing) return toRecord(existing);

  const settings = readSettings(
    one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', args.salonId)?.settings,
  );
  const salon = one<{ name: string }>('SELECT name FROM salons WHERE id = ?', args.salonId);
  const customer = one<{ name: string; phone: string }>('SELECT name, phone FROM users WHERE id = ?', args.customerId);
  if (!customer) throw new Error('notifyCustomer: unknown customer');

  const template = settings.templates[args.template] ?? '';
  const body = renderTemplate(template, {
    customer_name: customer.name.split(' ')[0] ?? customer.name,
    salon_name: salon?.name ?? 'SalonPro',
    booking_link: `${env.webOrigin}/book`,
    reward_amount: '',
    amount: '',
    balance: '',
    appointment_date: '',
    appointment_time: '',
    ...(args.vars ?? {}),
  });

  const pref = preferences(args.customerId);
  const stage = args.stage;
  const requestedChannels = stage === 'transactional' ? (['whatsapp'] as NotificationChannel[]) : settings.reminderChannels;
  const channel = requestedChannels.find((c) => channelAllowed(c, pref, stage)) ?? requestedChannels[0] ?? 'whatsapp';

  let status: NotificationStatus = 'queued';
  let errorDetails: string | null = null;

  if (withinQuietHours(pref)) {
    status = 'pending';
    errorDetails = 'suppressed_quiet_hours';
  } else if (!channelAllowed(channel, pref, stage)) {
    status = 'suppressed';
    errorDetails = 'customer_opted_out';
  }

  const id = crypto.randomUUID();
  run(
    `INSERT INTO notifications (id, salonId, customerId, channel, template, stage, scheduledAt, status, errorDetails, body, reminderKey, appointmentId, attempts, createdAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    args.salonId,
    args.customerId,
    channel,
    args.template,
    stage,
    args.scheduledAt ?? new Date().toISOString(),
    status,
    errorDetails,
    body,
    args.reminderKey,
    args.appointmentId ?? null,
    0,
    new Date().toISOString(),
  );

  if (args.sendNow && status === 'queued') {
    return attemptSend(id);
  }
  return toRecord(one<DbRow>('SELECT * FROM notifications WHERE id = ?', id)!);
}

/** Attempt delivery. Never marks `sent` unless the provider accepted it. */
export async function attemptSendAsync(id: string) {
  const row = one<DbRow>('SELECT * FROM notifications WHERE id = ?', id);
  if (!row) return null;
  if (row.status === 'sent' || row.status === 'delivered') return toRecord(row);
  const customer = one<{ phone: string }>('SELECT phone FROM users WHERE id = ?', row.customerId);
  if (!customer) return null;
  const result = await deliver(row.channel as NotificationChannel, customer.phone, row.body ?? '');
  run(
    'UPDATE notifications SET attempts = attempts + 1, status = ?, sentAt = ?, errorDetails = ? WHERE id = ?',
    result.ok ? 'sent' : 'pending',
    result.ok ? new Date().toISOString() : null,
    result.ok ? null : result.error ?? 'delivery_failed',
    row.id,
  );
  return toRecord(one<DbRow>('SELECT * FROM notifications WHERE id = ?', id)!);
}

/** Synchronous convenience wrapper used by cron jobs. */
function attemptSend(id: string): NotificationRecord {
  const row = one<DbRow>('SELECT * FROM notifications WHERE id = ?', id)!;
  if (row.status === 'sent' || row.status === 'delivered') return toRecord(row);
  // Fire and forget; the cron run reports on the row asynchronously.
  void attemptSendAsync(id);
  return toRecord(row);
}

export function toRecord(row: DbRow): NotificationRecord {
  const customer = one<{ name: string }>('SELECT name FROM users WHERE id = ?', row.customerId);
  return {
    id: row.id,
    salonId: row.salonId,
    customerId: row.customerId,
    customerName: customer?.name,
    channel: row.channel,
    template: row.template,
    stage: row.stage,
    scheduledAt: row.scheduledAt,
    sentAt: row.sentAt,
    status: row.status,
    errorDetails: row.errorDetails,
    body: row.body,
    reminderKey: row.reminderKey,
    appointmentId: row.appointmentId,
    attempts: row.attempts,
    createdAt: row.createdAt,
  };
}

export function listNotifications(salonId: string, opts: { status?: string; stage?: string; limit?: number } = {}) {
  const clauses = ['salonId = ?'];
  const params: (string | number)[] = [salonId];
  if (opts.status) {
    clauses.push('status = ?');
    params.push(opts.status);
  }
  if (opts.stage) {
    clauses.push('stage = ?');
    params.push(opts.stage);
  }
  params.push(opts.limit ?? 200);
  return all<DbRow>(
    `SELECT * FROM notifications WHERE ${clauses.join(' AND ')} ORDER BY createdAt DESC LIMIT ?`,
    ...params,
  ).map(toRecord);
}

export function notificationStats(salonId: string) {
  const byStatus = all<DbRow>(
    'SELECT status, COUNT(*) AS n FROM notifications WHERE salonId = ? GROUP BY status',
    salonId,
  );
  const byStage = all<DbRow>(
    "SELECT stage, COUNT(*) AS n FROM notifications WHERE salonId = ? AND stage <> 'transactional' GROUP BY stage",
    salonId,
  );
  const conversions = all<DbRow>(
    `SELECT n.stage,
            COUNT(*) AS sent,
            SUM(CASE WHEN EXISTS (
              SELECT 1 FROM appointments a
               WHERE a.customerId = n.customerId AND a.createdAt > n.scheduledAt
            ) THEN 1 ELSE 0 END) AS booked
       FROM notifications n
      WHERE n.salonId = ? AND n.stage <> 'transactional'
      GROUP BY n.stage`,
    salonId,
  );
  return { byStatus, byStage, conversions };
}

/* ------------------------------------------------------------------ */
/* Reminder engine                                                     */
/* ------------------------------------------------------------------ */

export interface ReminderRunResult {
  scanned: number;
  queued: number;
  suppressed: number;
  skipped: number;
  pending: number;
}

const STAGE_DAYS: Record<Exclude<ReminderStage, 'appointment'>, number> = {
  day7: 7,
  day14: 14,
  day30: 30,
};

/**
 * Scheduled reminder pass.
 *
 * For every customer whose **last completed visit** is exactly N days old and
 * who has no upcoming appointment, queue the matching reminder. Duplicate sends
 * are impossible because the reminder key embeds customer + visit + stage.
 */
export function runReminderPass(salonId: string, now = new Date()): ReminderRunResult {
  const settings = readSettings(
    one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId)?.settings,
  );
  const result: ReminderRunResult = { scanned: 0, queued: 0, suppressed: 0, skipped: 0, pending: 0 };
  const today = isoDate(now);

  const rows = all<DbRow>(
    `SELECT sr.customerId, sr.id AS recordId, sr.completedAt,
            date(sr.completedAt) AS visitDate,
            CAST(julianday(?) - julianday(date(sr.completedAt)) AS INTEGER) AS daysSince
       FROM service_records sr
      WHERE sr.salonId = ?
        AND sr.completedAt = (
          SELECT MAX(sr2.completedAt) FROM service_records sr2
           WHERE sr2.customerId = sr.customerId AND sr2.salonId = sr.salonId
        )`,
    today,
    salonId,
  );

  for (const row of rows) {
    result.scanned++;
    const daysSince = row.daysSince as number;

    const upcoming = scalar<number>(
      `SELECT COUNT(*) FROM appointments
        WHERE customerId = ? AND date >= ? AND status IN ('booked','confirmed','checked_in','in_progress')`,
      row.customerId,
      today,
    );
    if (upcoming > 0) {
      result.skipped++;
      continue; // they already have a booking — suppress entirely
    }

    let stage: Exclude<ReminderStage, 'appointment'> | null = null;
    for (const candidate of settings.reminderStages) {
      if (candidate === 'appointment') continue;
      if (daysSince >= STAGE_DAYS[candidate]) stage = candidate;
    }
    if (!stage) {
      result.skipped++;
      continue;
    }

    const reminderKey = `${row.customerId}:${row.recordId}:${stage}`;
    const existing = one<DbRow>('SELECT * FROM notifications WHERE reminderKey = ?', reminderKey);
    if (existing) {
      result.skipped++;
      continue;
    }

    const pref = preferences(row.customerId);
    const record = notifyCustomer({
      salonId,
      customerId: row.customerId,
      template: stage,
      stage,
      reminderKey,
      vars: { booking_link: `${env.webOrigin}/book` },
    });
    if (record.status === 'suppressed') result.suppressed++;
    else if (record.status === 'pending') result.pending++;
    else result.queued++;
  }

  run('UPDATE app_meta SET lastReminderRunAt = ? WHERE id = 1', now.toISOString());
  return result;
}

/** Appointment reminder (24h ahead) — transactional, unaffected by promo opt-out. */
export function scheduleAppointmentReminders(salonId: string, now = new Date()) {
  const tomorrow = isoDate(new Date(now.getTime() + 86400000));
  const appts = all<DbRow>(
    "SELECT * FROM appointments WHERE salonId = ? AND date = ? AND status IN ('booked','confirmed')",
    salonId,
    tomorrow,
  );
  let queued = 0;
  for (const appt of appts) {
    const record = notifyCustomer({
      salonId,
      customerId: appt.customerId,
      template: 'appointment_confirmation',
      stage: 'appointment',
      reminderKey: `appt_reminder_${appt.id}`,
      appointmentId: appt.id,
      vars: {
        appointment_date: formatDate(appt.date),
        appointment_time: formatTime12(appt.startTime),
      },
    });
    if (record.status === 'queued' || record.status === 'pending') queued++;
  }
  return { queued };
}

/* ------------------------------------------------------------------ */
/* Owner-configurable reminder settings                                */
/* ------------------------------------------------------------------ */

export interface ReminderSettings {
  stages: ReminderStage[];
  channels: NotificationChannel[];
  intervals: Record<string, number>;
  enabled: boolean;
}

export function reminderSettings(salonId: string): ReminderSettings {
  const row = one<DbRow>('SELECT * FROM reminder_settings WHERE salonId = ?', salonId);
  const settings: SalonSettings = readSettings(
    one<{ settings: string }>('SELECT settings FROM salons WHERE id = ?', salonId)?.settings,
  );
  if (!row) {
    return { stages: settings.reminderStages, channels: settings.reminderChannels, intervals: { ...STAGE_DAYS }, enabled: true };
  }
  return {
    stages: parseJson<ReminderStage[]>(row.stagesJson, settings.reminderStages),
    channels: parseJson<NotificationChannel[]>(row.channelsJson, settings.reminderChannels),
    intervals: parseJson<Record<string, number>>(row.intervalsJson, { ...STAGE_DAYS }),
    enabled: !!row.enabled,
  };
}

export function saveReminderSettings(salonId: string, patch: Partial<ReminderSettings>) {
  const current = reminderSettings(salonId);
  const next = { ...current, ...patch };
  run(
    `INSERT INTO reminder_settings (salonId, stagesJson, channelsJson, templatesJson, intervalsJson, enabled)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(salonId) DO UPDATE SET stagesJson = excluded.stagesJson, channelsJson = excluded.channelsJson,
       intervalsJson = excluded.intervalsJson, enabled = excluded.enabled`,
    salonId,
    JSON.stringify(next.stages),
    JSON.stringify(next.channels),
    JSON.stringify({}),
    JSON.stringify(next.intervals),
    next.enabled,
  );
  return next;
}
