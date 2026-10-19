import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fire } = vi.hoisted(() => ({
  fire: vi.fn(),
}));
vi.mock('sweetalert2', () => ({ default: { fire } }));

import { confirmAction, showError, showSuccess } from './alerts';

describe('SweetAlert2 notification standard', () => {
  beforeEach(() => {
    fire.mockReset();
    fire.mockResolvedValue({ isConfirmed: false, isDismissed: true });
  });

  it('returns false and leaves the destructive operation alone on cancellation', async () => {
    expect(await confirmAction({ title: 'ยกเลิกกิจกรรมหรือไม่?', confirmText: 'ยกเลิกกิจกรรม' })).toBe(false);
    expect(fire).toHaveBeenCalledWith(expect.objectContaining({
      title: 'ยกเลิกกิจกรรมหรือไม่?',
      showCancelButton: true,
      focusCancel: true,
      confirmButtonText: 'ยกเลิกกิจกรรม',
    }));
  });

  it('returns true only for explicit confirmation', async () => {
    fire.mockResolvedValueOnce({ isConfirmed: true });
    expect(await confirmAction({ title: 'ออกจากห้องหรือไม่?' })).toBe(true);
  });

  it('passes untrusted text as text, never interpreted as HTML', () => {
    const unsafe = '<img src=x onerror=alert(1)>';
    showSuccess(unsafe);
    showError(unsafe);
    expect(fire).toHaveBeenNthCalledWith(1, expect.objectContaining({
      toast: true, text: unsafe, showConfirmButton: false,
    }));
    expect(fire).toHaveBeenNthCalledWith(2, expect.objectContaining({
      icon: 'error', text: unsafe,
    }));
    expect(fire.mock.calls[0][0]).not.toHaveProperty('html');
    expect(fire.mock.calls[1][0]).not.toHaveProperty('html');
  });
});
