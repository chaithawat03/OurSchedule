import { describe, expect, it } from 'vitest';
import { bangkokInstant } from './activityDates';
import { personalDayAgenda } from './dayAgenda';
import type { PersonalActivity } from '../services/personalActivities';

const event = (id: string, start: string, end: string, allDay = false): PersonalActivity => ({
  id, title: id, notes: '', allDay,
  start: bangkokInstant(start), end: bangkokInstant(end),
});

describe('M4 signed-in personal day agenda (Asia/Bangkok)', () => {
  it('sorts chronological items after all-day events', () => {
    const values = [
      event('late', '2026-10-20T18:00', '2026-10-20T18:30'),
      event('morning', '2026-10-20T08:00', '2026-10-20T09:00'),
      event('all-day', '2026-10-20T00:00', '2026-10-21T00:00', true),
    ];
    const result = personalDayAgenda(values, '2026-10-20');
    expect(result.map((item) => item.activity.id)).toEqual(['all-day', 'morning', 'late']);
    expect(result.map((item) => item.timeLabel)).toEqual(['ตลอดวัน', '08:00–09:00', '18:00–18:30']);
  });

  it('clips overnight events correctly on both days and excludes midnight-exclusive ends', () => {
    const crossing = event('overnight', '2026-10-19T23:30', '2026-10-20T00:30');
    const midnight = event('midnight-end', '2026-10-19T22:00', '2026-10-20T00:00');
    const previous = personalDayAgenda([crossing, midnight], '2026-10-19');
    expect(previous.map((item) => item.timeLabel)).toEqual(['22:00–24:00', '23:30–24:00']);
    expect(previous.every((item) => !item.startedEarlier)).toBe(true);
    const next = personalDayAgenda([crossing, midnight], '2026-10-20');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ timeLabel:'00:00–00:30', startedEarlier:true, endsLater:false });
  });

  it('keeps events within the correct Bangkok civil day across UTC date boundaries', () => {
    const late = event('late', '2026-12-31T23:50', '2027-01-01T00:10');
    const newYear = personalDayAgenda([late], '2027-01-01');
    expect(newYear.map((item) => item.activity.id)).toEqual(['late']);
    expect(newYear[0].timeLabel).toBe('00:00–00:10');
  });

  it('excludes invalid ranges, out-of-day items and rejects non-calendar dates', () => {
    const invalid = { ...event('invalid', '2026-10-20T08:00', '2026-10-20T09:00'),
      end: bangkokInstant('2026-10-20T07:00') };
    expect(personalDayAgenda([
      invalid, event('yesterday','2026-10-19T08:00','2026-10-19T09:00'),
      event('tomorrow','2026-10-21T08:00','2026-10-21T09:00'),
    ],'2026-10-20')).toEqual([]);
    expect(() => personalDayAgenda([], '2026-02-30')).toThrow();
  });
});
