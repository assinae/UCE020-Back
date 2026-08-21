const EVENT_TIME_ZONE = 'America/Bahia';

function getTimeZoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, Number(part.value)]),
  ) as Record<string, number>;
  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );

  return asUtc - date.getTime();
}

function parseLocalDateTime(value: string): Date {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/,
  );

  if (!match) {
    throw new RangeError(`Data inválida: ${value}`);
  }

  const [, year, month, day, hour, minute, second = '0', milliseconds = '0'] =
    match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(milliseconds.padEnd(3, '0')),
  );
  const guessedDate = new Date(localAsUtc);
  const instant = new Date(localAsUtc - getTimeZoneOffsetMs(guessedDate));

  if (Number.isNaN(instant.getTime())) {
    throw new RangeError(`Data inválida: ${value}`);
  }

  return instant;
}

export function parseEventDate(value: string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new RangeError('Data inválida');
    }

    return value;
  }

  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = hasTimeZone ? new Date(value) : parseLocalDateTime(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new RangeError(`Data inválida: ${value}`);
  }

  return parsed;
}

export const EVENT_TIMEZONE = EVENT_TIME_ZONE;
