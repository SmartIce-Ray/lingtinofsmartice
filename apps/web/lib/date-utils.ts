// Shared date utility functions

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
