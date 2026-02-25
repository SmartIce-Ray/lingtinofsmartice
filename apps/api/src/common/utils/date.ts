// Date Utilities - China timezone helpers
// v1.0 - Centralized date functions using Asia/Shanghai timezone

const CHINA_TIMEZONE = 'Asia/Shanghai';

/**
 * Get current date string in China timezone (YYYY-MM-DD format)
 */
export function getChinaDateString(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: CHINA_TIMEZONE });
}

/**
 * Get yesterday's date string in China timezone (YYYY-MM-DD format)
 */
export function getYesterdayChinaDateString(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toLocaleDateString('sv-SE', { timeZone: CHINA_TIMEZONE });
}

/**
 * Convert a Date object to China timezone date string (YYYY-MM-DD format)
 */
export function toChinaDateString(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: CHINA_TIMEZONE });
}

/**
 * Get current hour in China timezone (0-23)
 */
export function getChinaHour(): number {
  const chinaTime = new Date().toLocaleString('en-US', {
    timeZone: CHINA_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(chinaTime, 10);
}
