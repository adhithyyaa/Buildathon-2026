import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

/** All customer-facing timing decisions are made in India Standard Time. */
export const IST = 'Asia/Kolkata';

export function nowIST() {
  return dayjs().tz(IST);
}

/**
 * Is `at` within quiet hours [startHour, endHour) in IST?
 * Handles the common overnight wrap (e.g. 21:00–08:00).
 */
export function isQuietHours(at: Date, startHour: number, endHour: number): boolean {
  const h = dayjs(at).tz(IST).hour();
  if (startHour <= endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour; // wraps midnight
}

/**
 * The next instant at or after `at` that is NOT within quiet hours (IST).
 * Returns `at` unchanged if it's already allowed.
 */
export function nextAllowedTime(at: Date, startHour: number, endHour: number): Date {
  let d = dayjs(at).tz(IST);
  for (let i = 0; i < 48; i++) {
    if (!isQuietHours(d.toDate(), startHour, endHour)) return d.toDate();
    d = d.add(1, 'hour').minute(0).second(0).millisecond(0);
  }
  return d.toDate();
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(dayjs(b).diff(dayjs(a), 'minute', true)));
}
