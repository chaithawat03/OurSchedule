import { describe, expect, it } from 'vitest';
import { bangkokYearMonth, monthGrid, shiftMonth } from './monthGrid';

describe('calendar date utilities', () => {
  it('starts each month grid on Monday', () => {
    const cells = monthGrid(2026, 9);
    expect(cells).toHaveLength(42);
    expect(cells[0].date).toBe('2026-09-28');
    expect(cells[3]).toEqual({ date: '2026-10-01', day: 1, isCurrentMonth: true });
  });
  it('handles year rollover', () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, monthIndex: 0 });
  });
  it('interprets current day in Bangkok, independent of host timezone', () => {
    expect(bangkokYearMonth(new Date('2026-10-15T18:00:00Z'))).toEqual({ year: 2026, monthIndex: 9, day: 16 });
  });
  it('rejects invalid month', () => {
    expect(() => monthGrid(2026, 12)).toThrow(RangeError);
  });
});
