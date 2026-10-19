import type { AvailabilityResponse, AvailabilitySlot, DayHours, OpeningHours, WorkingHours } from '@salonpro/shared';
import { BLOCKING_STATUSES, minutesToTime, timeToMinutes, weekdayIndex } from '@salonpro/shared';
import { all, one, parseJson } from '../db';

export interface BusyInterval {
  start: number;
  end: number;
  appointmentId: string;
}

export async function branchDayHours(branchId: string, date: string): Promise<DayHours | null> {
  const branch = await one<{ openingHours: string }>('SELECT openingHours FROM branches WHERE id = ?', branchId);
  if (!branch) return null;
  const hours = parseJson<OpeningHours>(branch.openingHours, {});
  const day = hours[weekdayIndex(date)];
  return day ?? null;
}

export async function isHoliday(branchId: string, date: string): Promise<string | null> {
  const row = await one<{ reason: string | null }>('SELECT reason FROM holidays WHERE branchId = ? AND date = ?', branchId, date);
  return row ? row.reason ?? 'Closed' : null;
}

export async function staffWorkingWindow(staffId: string, date: string): Promise<{ start: number; end: number } | null> {
  const staff = await one<{ workingHours: string }>('SELECT workingHours FROM staff WHERE id = ?', staffId);
  if (!staff) return null;
  const hours = parseJson<WorkingHours>(staff.workingHours, {});
  const day = hours[weekdayIndex(date)];
  if (!day || day.off) return null;
  return { start: timeToMinutes(day.start), end: timeToMinutes(day.end) };
}

export async function staffBreaks(staffId: string, date: string): Promise<{ start: number; end: number }[]> {
  const rows = await all<{ startTime: string; endTime: string }>(
    'SELECT startTime, endTime FROM staff_breaks WHERE staffId = ? AND weekday = ?',
    staffId,
    weekdayIndex(date),
  );
  return rows.map((r) => ({ start: timeToMinutes(r.startTime), end: timeToMinutes(r.endTime) }));
}

export async function busyIntervals(staffId: string, date: string, excludeAppointmentId?: string): Promise<BusyInterval[]> {
  const placeholders = BLOCKING_STATUSES.map(() => '?').join(',');
  const rows = await all<{ id: string; startTime: string; endTime: string }>(
    `SELECT id, startTime, endTime FROM appointments
      WHERE staffId = ? AND date = ? AND status IN (${placeholders}) ${excludeAppointmentId ? 'AND id <> ?' : ''}`,
    staffId,
    date,
    ...BLOCKING_STATUSES,
    ...(excludeAppointmentId ? [excludeAppointmentId] : []),
  );
  return rows.map((r) => ({
    start: timeToMinutes(r.startTime),
    end: timeToMinutes(r.endTime),
    appointmentId: r.id,
  }));
}

export function staffForBranch(branchId: string, includeInactive = false) {
  return all<{ id: string; userId: string; name: string; designation: string; branchId: string; status: string }>(
    `SELECT s.id, s.userId, u.name, s.designation, s.branchId, s.status
       FROM staff s JOIN users u ON u.id = s.userId
      WHERE s.branchId = ? ${includeInactive ? '' : "AND s.status = 'active'"}
      ORDER BY u.name`,
    branchId,
  );
}

export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

/** True when the interval is free for that staff member on that date. */
export async function isFree(
  staffId: string,
  date: string,
  start: number,
  end: number,
  excludeAppointmentId?: string,
): Promise<boolean> {
  const window = await staffWorkingWindow(staffId, date);
  if (!window) return false;
  if (start < window.start || end > window.end) return false;
  const brk = await staffBreaks(staffId, date);
  if (brk.some((b) => overlaps({ start, end }, b))) return false;
  const busy = await busyIntervals(staffId, date, excludeAppointmentId);
  return !busy.some((b) => overlaps({ start, end }, { start: b.start, end: b.end }));
}

export interface SlotQuery {
  branchId: string;
  date: string;
  durationMinutes: number;
  staffId?: string | null;
  stepMinutes?: number;
  /** Ignore slots that start in the past (for today). */
  nowMinutes?: number;
  excludeAppointmentId?: string;
}

/**
 * Availability = branch opening hours − holidays − staff working hours
 * − staff breaks − existing blocking appointments.
 */
export async function findSlots(query: SlotQuery): Promise<AvailabilityResponse> {
  const { branchId, date, durationMinutes } = query;
  const step = query.stepMinutes ?? 15;

  const holiday = await isHoliday(branchId, date);
  if (holiday) {
    return { date, durationMinutes, slots: [], closed: true, reason: `Holiday: ${holiday}` };
  }
  const hours = await branchDayHours(branchId, date);
  if (!hours || hours.closed) {
    return { date, durationMinutes, slots: [], closed: true, reason: 'Branch closed on this day' };
  }

  const open = timeToMinutes(hours.open);
  const close = timeToMinutes(hours.close);
  const allStaff = await staffForBranch(branchId);
  const candidates = query.staffId ? allStaff.filter((s) => s.id === query.staffId) : allStaff;

  const slots: AvailabilitySlot[] = [];
  const seen = new Set<string>();

  for (const staff of candidates) {
    const window = await staffWorkingWindow(staff.id, date);
    if (!window) continue;
    const from = Math.max(open, window.start);
    const to = Math.min(close, window.end);

    for (let start = from; start + durationMinutes <= to; start += step) {
      if (query.nowMinutes !== undefined && start < query.nowMinutes) continue;
      if (!(await isFree(staff.id, date, start, start + durationMinutes, query.excludeAppointmentId))) continue;
      const end = start + durationMinutes;
      // When asking for "any stylist", collapse identical times to the first free one.
      const key = `${start}-${end}`;
      if (query.staffId) {
        slots.push({ startTime: minutesToTime(start), endTime: minutesToTime(end), staffId: staff.id, staffName: staff.name });
      } else if (!seen.has(key)) {
        seen.add(key);
        slots.push({ startTime: minutesToTime(start), endTime: minutesToTime(end), staffId: staff.id, staffName: staff.name });
      }
    }
  }

  slots.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  return { date, durationMinutes, slots, closed: false };
}

/** Pick the first staff member free for the whole window (used for "any stylist"). */
export async function pickAvailableStaff(
  branchId: string,
  date: string,
  start: number,
  end: number,
  preferredStaffId?: string | null,
): Promise<string | null> {
  if (preferredStaffId) {
    return (await isFree(preferredStaffId, date, start, end)) ? preferredStaffId : null;
  }
  for (const staff of await staffForBranch(branchId)) {
    if (await isFree(staff.id, date, start, end)) return staff.id;
  }
  return null;
}
