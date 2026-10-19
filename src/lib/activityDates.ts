const DAY_MS = 86_400_000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export function bangkokInstant(local: string): Date {
  // HTML datetime-local carries no timezone. Explicitly interpret +07:00.
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)) throw new Error('วันและเวลาไม่ถูกต้อง');
  const date = new Date(local + ':00+07:00');
  if (!Number.isFinite(date.getTime())) throw new Error('วันและเวลาไม่ถูกต้อง');
  if (bangkokLocal(date) !== local) throw new Error('วันและเวลาไม่ถูกต้อง');
  return date;
}

export function bangkokLocal(date: Date): string {
  const bangkok = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return bangkok.toISOString().slice(0, 16);
}

export function bangkokDayKey(date: Date): string {
  return bangkokLocal(date).slice(0, 10);
}

export function nextBangkokDay(day: string): string {
  if (!/^\d{4}-\d\d-\d\d$/.test(day)) throw new Error('วันที่ไม่ถูกต้อง');
  const date = bangkokInstant(day + 'T00:00');
  return bangkokDayKey(new Date(date.getTime() + DAY_MS));
}

export function monthReadWindow(year: number, monthIndex: number, multi = false) {
  const start = new Date(Date.UTC(year, monthIndex, 1) - BANGKOK_OFFSET_MS);
  const end = new Date(Date.UTC(year, monthIndex + (multi ? 2 : 1), 1) - BANGKOK_OFFSET_MS);
  // Query starts at most 24h before the window to include overnight events.
  return { start, end, scanStart: new Date(start.getTime() - DAY_MS) };
}

export function overlapsDay(start: Date, end: Date, day: string): boolean {
  const dayStart = bangkokInstant(day + 'T00:00');
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  return start < dayEnd && end > dayStart;
}

export function validateActivity(value: { title: string; notes: string; start: Date; end: Date }) {
  const title = value.title.trim();
  const notes = value.notes.trim();
  if (!title || new TextEncoder().encode(title).length > 360) {
    throw new Error('ชื่อกิจกรรมต้องไม่ว่างและมีขนาดไม่เกิน 360 ไบต์');
  }
  if (new TextEncoder().encode(notes).length > 2000) {
    throw new Error('หมายเหตุต้องมีขนาดไม่เกิน 2,000 ไบต์');
  }
  const length = value.end.getTime() - value.start.getTime();
  if (!Number.isFinite(length) || length <= 0 || length > DAY_MS) {
    throw new Error('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม และระยะเวลาไม่เกิน 24 ชั่วโมง');
  }
  return { title, notes };
}
