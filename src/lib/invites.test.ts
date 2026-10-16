import { describe, expect, it } from 'vitest';
import { generateInviteToken, parseInviteToken, inviteLink, inviteFromHash } from './invites';

describe('single-use invite capability', () => {
  it('generates a high entropy 43-character URL-safe token', () => {
    const tokens = new Set(Array.from({ length: 30 }, () => generateInviteToken()));
    expect(tokens.size).toBe(30);
    for (const token of tokens) expect(parseInviteToken(token)).toBe(token);
  });
  it('rejects malformed token strings', () => {
    for (const token of ['short', '', '../abc', 'A'.repeat(44), 'a'.repeat(42) + '!', ' ']) {
      expect(() => parseInviteToken(token)).toThrow();
    }
  });
  it('uses URL fragments and not query parameters', () => {
    const token = generateInviteToken();
    const link = inviteLink(token, 'https://ourschedule.web.app');
    expect(new URL(link).search).toBe('');
    expect(inviteFromHash(new URL(link).hash)).toBe(token);
    expect(inviteFromHash('#invite=bad')).toBeNull();
  });
});
