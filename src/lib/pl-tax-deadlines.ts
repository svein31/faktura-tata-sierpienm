/** Move a standard Polish tax/ZUS due date to the next working day. */
export function nextPolishBusinessDay(year: number, month: number, day: number): Date {
  const date = new Date(year, month, day);
  while (isPolishHoliday(date)) date.setDate(date.getDate() + 1);
  return date;
}

function isPolishHoliday(date: Date): boolean {
  const weekday = date.getDay();
  if (weekday === 0 || weekday === 6) return true;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const fixed = new Set(["1-1", "1-6", "5-1", "5-3", "8-15", "11-1", "11-11", "12-25", "12-26"]);
  if (year >= 2025) fixed.add("12-24");
  if (fixed.has(`${month}-${day}`)) return true;

  // Gregorian computus: Easter Sunday; Easter Monday and Corpus Christi are statutory holidays.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k + 7) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, easterMonth - 1, easterDay);
  const daysSinceEaster = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, easterMonth - 1, easterDay)) / 86400000);
  return daysSinceEaster === 1 || daysSinceEaster === 60;
}
