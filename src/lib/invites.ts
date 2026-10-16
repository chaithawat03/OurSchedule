// 32 cryptographically random bytes -> 43-char Base64URL capability.
// Never put invite tokens in query strings or analytics payloads.
export const INVITE_TOKEN_RE = /^[a-zA-Z0-9_-]{43}$/;

export function generateInviteToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function parseInviteToken(value: string): string {
  const token = value.trim();
  if (!INVITE_TOKEN_RE.test(token)) throw new Error('ลิงก์คำเชิญไม่ถูกต้อง');
  return token;
}

export function inviteLink(token: string, origin: string): string {
  return origin.replace(/\/$/u, '') + '/#invite=' + encodeURIComponent(parseInviteToken(token));
}

export function inviteFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('invite');
  return token && INVITE_TOKEN_RE.test(token) ? token : null;
}
