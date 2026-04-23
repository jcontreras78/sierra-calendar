import { eachDayBetween, toDayKey } from './date';

function unfoldIcs(content) {
  return content.replace(/\r\n[ \t]/g, '');
}

function parseIcsDate(value) {
  if (/^\d{8}$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return new Date(year, month, day);
  }

  if (/^\d{8}T\d{6}Z$/.test(value)) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    const hour = Number(value.slice(9, 11));
    const minute = Number(value.slice(11, 13));
    const second = Number(value.slice(13, 15));
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  return new Date(value);
}

export function parseIcsEvents(icsText) {
  const normalized = unfoldIcs(icsText);
  if (!normalized.includes('BEGIN:VCALENDAR')) {
    throw new Error('Feed did not return calendar data');
  }
  const lines = normalized.split(/\r?\n/);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (current?.dtstart && current?.dtend) {
        events.push({
          summary: current.summary || 'Booked',
          dtstart: parseIcsDate(current.dtstart),
          dtend: parseIcsDate(current.dtend)
        });
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const [left, ...rest] = line.split(':');
    const value = rest.join(':');
    if (!left || !value) continue;

    const prop = left.split(';')[0];
    if (prop === 'SUMMARY') current.summary = value;
    if (prop === 'DTSTART') current.dtstart = value;
    if (prop === 'DTEND') current.dtend = value;
  }

  return events;
}

function isBlockedSummary(summary) {
  const text = String(summary || '').toLowerCase();
  const blockedTerms = [
    'not available',
    'unavailable',
    'blocked',
    'cleaning',
    'clean',
    'hold'
  ];
  return blockedTerms.some((term) => text.includes(term));
}

export function availabilityDaysFromEvents(events) {
  const booked = new Set();
  const blocked = new Set();
  const checkout = new Set();

  for (const event of events) {
    const isBlocked = isBlockedSummary(event.summary);
    const days = eachDayBetween(event.dtstart, event.dtend);
    const target = isBlocked ? blocked : booked;
    for (const day of days) target.add(toDayKey(day));

    if (!isBlocked && event.dtend instanceof Date && !Number.isNaN(event.dtend.valueOf())) {
      checkout.add(toDayKey(event.dtend));
    }
  }

  return { bookedDays: booked, blockedDays: blocked, checkoutDays: checkout };
}
