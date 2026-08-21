export const BAHIA_TIMEZONE = 'America/Bahia';

export function formatBahiaDate(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: BAHIA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  const offset =
    new Intl.DateTimeFormat('en-US', {
      timeZone: BAHIA_TIMEZONE,
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')
      ?.value.replace('GMT', '') ?? '-03:00';

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond ?? '000'}${offset}`;
}

export function serializeBahiaDates<T>(value: T): T {
  if (value instanceof Date) {
    return formatBahiaDate(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeBahiaDates(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        serializeBahiaDates(item),
      ]),
    ) as T;
  }

  return value;
}
