import { describe, expect, it } from 'vitest';
import { bangkokInstant, bangkokLocal, bangkokDayKey, nextBangkokDay, monthReadWindow, overlapsDay, validateActivity } from './activityDates';

describe('M3 private activity Bangkok date boundaries', () => {
  it('handles local time independent from browser timezone', () => {
    const actual = bangkokInstant('2026-10-19T09:30');
    expect(actual.toISOString()).toBe('2026-10-19T02:30:00.000Z');
    expect(bangkokLocal(actual)).toBe('2026-10-19T09:30');
    expect(bangkokDayKey(actual)).toBe('2026-10-19');
  });
  it('rejects invalid or normalized civil dates', () => {
    expect(() => bangkokInstant('2026-02-30T09:00')).toThrow();
    expect(() => bangkokInstant('2026-10-19T25:00')).toThrow();
  });
  it('computes inclusive-start/exclusive-end windows for month and multi-month', () => {
    const single = monthReadWindow(2026, 9);
    expect(single.start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(single.end.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    const multi = monthReadWindow(2026, 9, true);
    expect(multi.end.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(multi.scanStart.toISOString()).toBe('2026-09-29T17:00:00.000Z');
  });
  it('handles overnight overlap, midnight and exclusive all-day end', () => {
    const start = bangkokInstant('2026-10-19T23:30');
    const end = bangkokInstant('2026-10-20T00:30');
    expect(overlapsDay(start, end, '2026-10-19')).toBe(true);
    expect(overlapsDay(start, end, '2026-10-20')).toBe(true);
    expect(overlapsDay(start, end, '2026-10-21')).toBe(false);
    expect(nextBangkokDay('2026-12-31')).toBe('2027-01-01');
    expect(overlapsDay(bangkokInstant('2026-10-19T00:00'), bangkokInstant('2026-10-20T00:00'), '2026-10-20')).toBe(false);
  });
  it('validates event names, bytes, and maximum duration', () => {
    const start = bangkokInstant('2026-10-19T10:00');
    const end = bangkokInstant('2026-10-19T11:00');
    expect(validateActivity({ title: ' กิจกรรม ', notes: '', start, end }).title).toBe('กิจกรรม');
    expect(() => validateActivity({ title: ' ', notes: '', start, end })).toThrow();
    expect(() => validateActivity({ title: 'A'.repeat(361), notes: '', start, end })).toThrow();
    expect(() => validateActivity({ title: 'A', notes: 'ข'.repeat(700), start, end })).toThrow();
    expect(() => validateActivity({ title: 'A', notes: '', start: end, end: start })).toThrow();
  });
});
