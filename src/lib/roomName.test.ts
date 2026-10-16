import { describe, expect, it } from 'vitest';
import { normalizeRoomName, validateRoomName } from './roomName';

describe('room name input', () => {
  it('normalizes whitespace', () => {
    expect(normalizeRoomName('  ห้อง  ทดสอบ\n ')).toBe('ห้อง ทดสอบ');
    expect(validateRoomName('  Team  A ')).toBe('Team A');
  });
  it('rejects empty, overly long, and byte-heavy room names', () => {
    expect(() => validateRoomName(' ')).toThrow();
    expect(() => validateRoomName('x'.repeat(61))).toThrow();
    expect(() => validateRoomName('ก'.repeat(61))).toThrow();
  });
});
