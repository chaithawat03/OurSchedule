export type CalendarCell = { date: string; day: number; isCurrentMonth: boolean };
export function monthGrid(year: number, monthIndex: number): CalendarCell[] {
  if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    throw new RangeError('Invalid calendar month');
  }
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, monthIndex, 1 - offset));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return { date: date.toISOString().slice(0, 10), day: date.getUTCDate(), isCurrentMonth: date.getUTCMonth() === monthIndex };
  });
}
export function shiftMonth(year: number, monthIndex: number, delta: number) {
  const date = new Date(Date.UTC(year, monthIndex + delta, 1));
  return { year: date.getUTCFullYear(), monthIndex: date.getUTCMonth() };
}
export function bangkokYearMonth(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (name: string) => Number(parts.find((part) => part.type === name)?.value);
  return { year: value('year'), monthIndex: value('month') - 1, day: value('day') };
}
