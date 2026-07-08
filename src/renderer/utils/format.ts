export function formatRelativeDate(value?: string): string {
  if (!value) {
    return "Never";
  }
  const target = new Date(value).getTime();
  const now = Date.now();
  const diff = target - now;
  const absoluteSeconds = Math.round(Math.abs(diff) / 1000);
  const steps = [
    { limit: 60, divisor: 1, unit: "second" },
    { limit: 60 * 60, divisor: 60, unit: "minute" },
    { limit: 60 * 60 * 24, divisor: 60 * 60, unit: "hour" },
    { limit: 60 * 60 * 24 * 30, divisor: 60 * 60 * 24, unit: "day" },
    { limit: 60 * 60 * 24 * 365, divisor: 60 * 60 * 24 * 30, unit: "month" },
  ] as const;
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const step of steps) {
    if (absoluteSeconds < step.limit) {
      return formatter.format(
        Math.round(diff / 1000 / step.divisor),
        step.unit,
      );
    }
  }
  return formatter.format(
    Math.round(diff / 1000 / (60 * 60 * 24 * 365)),
    "year",
  );
}
export function formatAbsoluteDate(value?: string): string {
  if (!value) {
    return "Never";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
export function truncateMiddle(value: string, maxLength = 44): string {
  if (value.length <= maxLength) {
    return value;
  }
  const half = Math.floor((maxLength - 1) / 2);
  return `${value.slice(0, half)}...${value.slice(value.length - half)}`;
}
