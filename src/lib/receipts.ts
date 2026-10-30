import { HttpError, now, sha256 } from './http';
import { localeOf, t } from './i18n';
import { dateLabel } from './data';

export const RECEIPT_LIFETIME = 7 * 86400;
export type ReceiptRecord = {
  status: string;
  hold_until: number;
  workshop_name: string;
  seats: number;
  cancelled_seats: number;
  starts_at: number;
  ends_at: number;
  timezone: string;
  total: number;
  needs_attention: number;
  locale: string;
  venue_name: string;
  venue_address: string;
  created_at: number;
  pricing_snapshot?: string | null;
};
export async function receiptRecord(db: D1Database, request: Request, id: string) {
  const token = (request.headers.get('cookie') ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`receipt_${id}=`))
    ?.slice(`receipt_${id}=`.length);
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(
      404,
      'This confirmation is only available in the browser used to register. Contact Adventure Station with your payment reference.',
    );
  const row = await db
    .prepare(
      `SELECT status,hold_until,workshop_name,seats,cancelled_seats,starts_at,ends_at,timezone,total,needs_attention,locale,venue_name,venue_address,created_at,pricing_snapshot FROM registrations WHERE id=? AND receipt_hash=? AND anonymized_at IS NULL AND created_at>?`,
    )
    .bind(id, await sha256(token), now() - RECEIPT_LIFETIME)
    .first<ReceiptRecord>();
  if (!row) throw new HttpError(404, 'Confirmation not found.');
  return row;
}
export function receiptFacts(r: ReceiptRecord) {
  const price = r.pricing_snapshot ? JSON.parse(r.pricing_snapshot) : null;
  return {
    status: r.status,
    hold_until: r.hold_until,
    workshop_name: r.workshop_name,
    seats: r.seats,
    cancelled_seats: r.cancelled_seats,
    starts_at: r.starts_at,
    timezone: r.timezone,
    total: r.total,
    needs_attention: r.needs_attention,
    pricing: price
      ? {
          unit_price: price.unit_price,
          subtotal: price.subtotal,
          discount: price.discount,
          tax: price.tax,
          fees: price.fees,
          total: price.total,
          currency: price.currency,
          offer: price.coupon
            ? {
                code: price.coupon.code,
                terms: price.coupon.terms,
                terms_es: price.coupon.terms_es,
              }
            : null,
        }
      : null,
  };
}
const calendarText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
// RFC 5545: fold at 75 UTF-8 octets without splitting a Unicode character.
export function foldCalendarLine(value: string) {
  const encoder = new TextEncoder();
  let line = '',
    bytes = 0,
    result = '';
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) {
      result += line + '\r\n';
      line = ' ';
      bytes = 1;
    }
    line += char;
    bytes += size;
  }
  return result + line;
}
const calendarTime = (seconds: number) =>
  new Date(seconds * 1000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
export async function receiptCalendar(id: string, r: ReceiptRecord) {
  if (r.status !== 'confirmed' || r.seats - r.cancelled_seats < 1 || r.needs_attention)
    throw new HttpError(409, 'A calendar event is available only for confirmed active places.');
  if (
    !Number.isSafeInteger(r.starts_at) ||
    !Number.isSafeInteger(r.ends_at) ||
    r.ends_at <= r.starts_at
  )
    throw new HttpError(409, 'The class time needs review before adding it to a calendar.');
  const locale = localeOf(r.locale),
    uid = await sha256('calendar:' + id);
  const description =
    t(
      'Check your booking for the latest instructions. Calendar downloads do not receive automatic updates.',
      locale,
    ) +
    '\n' +
    dateLabel(r.starts_at, r.timezone, locale) +
    ' (' +
    r.timezone +
    ')';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Adventure Station//Workshop Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@adventurestationfl.com`,
    `DTSTAMP:${calendarTime(now())}`,
    `DTSTART:${calendarTime(r.starts_at)}`,
    `DTEND:${calendarTime(r.ends_at)}`,
    'SEQUENCE:0',
    'STATUS:CONFIRMED',
    'CLASS:PRIVATE',
    'TRANSP:OPAQUE',
    'SUMMARY:' + calendarText(r.workshop_name),
    'LOCATION:' + calendarText([r.venue_name, r.venue_address].filter(Boolean).join(' — ')),
    'DESCRIPTION:' + calendarText(description),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Response(lines.map(foldCalendarLine).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="adventure-station.ics"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
