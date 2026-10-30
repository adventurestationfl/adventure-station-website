// Never interpret a business wall-clock time in the browser's own timezone.
// Ambiguous or nonexistent DST times require another explicit time selection.
export function zonedDateTime(value: string, timezone: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Choose a date and time.');
  const target = new Date(`${value}:00Z`).getTime();
  const format = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const matches: number[] = [];
  for (let offset = -14 * 60; offset <= 14 * 60; offset += 15) {
    const candidate = target + offset * 60000;
    if (format.format(candidate).replace(' ', 'T') === value) matches.push(candidate / 1000);
  }
  if (matches.length !== 1)
    throw new Error(
      'This time is ambiguous or unavailable during a daylight-saving change. Please choose another time.',
    );
  return matches[0]!;
}
export function wallClock(timestamp: number, timezone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(timestamp * 1000)
    .replace(' ', 'T');
}
