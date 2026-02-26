// Shared date utility functions

// --- DateRange type ---
export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
}

// Create a single-day DateRange
export function singleDay(date: string): DateRange {
  return { startDate: date, endDate: date };
}

// Check if a DateRange spans multiple days
export function isMultiDay(range: DateRange): boolean {
  return range.startDate !== range.endDate;
}

// Build query string params for a DateRange
export function dateRangeParams(range: DateRange): string {
  return `start_date=${range.startDate}&end_date=${range.endDate}`;
}

// Calculate date string (YYYY-MM-DD) based on selection label
export function getDateForSelection(selection: string): string {
  const date = new Date();
  if (selection === '昨日') {
    date.setDate(date.getDate() - 1);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get China timezone (UTC+8) today as YYYY-MM-DD
export function getChinaToday(): string {
  const now = new Date();
  const chinaTime = new Date(now.getTime() + (8 - now.getTimezoneOffset() / -60) * 3600000);
  return chinaTime.toISOString().slice(0, 10);
}

// Get China timezone yesterday as YYYY-MM-DD
export function getChinaYesterday(): string {
  const today = getChinaToday();
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Shift a YYYY-MM-DD date by N days
export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Format YYYY-MM-DD to "M/D 周X"
export function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekDays = '日一二三四五六';
  return `${d.getMonth() + 1}/${d.getDate()} 周${weekDays[d.getDay()]}`;
}

// Get China timezone N days ago as YYYY-MM-DD
export function getChinaDaysAgo(n: number): string {
  const today = getChinaToday();
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Get Chinese weekday string: "周一"~"周日"
export function getChineseWeekday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const weekDays = '日一二三四五六';
  return `周${weekDays[d.getDay()]}`;
}

// Check if two YYYY-MM-DD strings are the same date
export function isSameDate(a: string, b: string): boolean {
  return a === b;
}

// Generate a 6x7 calendar grid for a given year/month (Mon-first)
// Returns array of weeks, each week is 7 slots (day number or null for empty)
export function getMonthGrid(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  // Convert JS getDay (0=Sun) to Mon-first index (0=Mon)
  let startIdx = firstDay.getDay() - 1;
  if (startIdx < 0) startIdx = 6;

  const grid: (number | null)[][] = [];
  let week: (number | null)[] = new Array(startIdx).fill(null);
  for (let day = 1; day <= daysInMonth; day++) {
    week.push(day);
    if (week.length === 7) {
      grid.push(week);
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    grid.push(week);
  }
  return grid;
}
