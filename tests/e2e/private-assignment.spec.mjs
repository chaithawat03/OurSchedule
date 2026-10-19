import { test, expect } from '@playwright/test';

/**
 * Two real, different Firebase Auth Emulator UIDs, driven via browser UI.
 * Firestore SDK operations use those same users (never Admin credentials).
 */
test('M3.2a PRIVATE assignment, SweetAlert2, recipient isolation and owner revocation', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  const tag = 'e2e-room-' + Date.now().toString(36);
  const activity = (name) => 'E2E-' + name;
  const roomPanel = (page) => page.getByRole('region', { name: 'กิจกรรมที่มอบหมายในห้อง' });
  const inbox = (page) => roomPanel(page).locator('.room-activity-list').last();
  const status = (page, roomId, eventId) =>
    page.evaluate(([r, e]) => window.__ourscheduleE2e.readEvent(r, e), [roomId, eventId]);
  const eventId = (roomId, title) =>
    owner.evaluate(([r, t]) => window.__ourscheduleE2e.roomEventId(r, t), [roomId, title]);

  async function createAssignment(title, roomId, uid) {
    const panel = roomPanel(owner);
    await panel.getByRole('button', { name: 'โหลดใหม่', exact: true }).click();
    await panel.getByLabel('ห้องที่ต้องการมอบหมาย').selectOption(roomId);
    const receiver = panel.getByLabel('สมาชิกผู้รับกิจกรรม');
    await expect(receiver.locator('option[value="' + uid + '"]')).toHaveCount(1);
    await receiver.selectOption(uid);
    await panel.getByLabel('ชื่อกิจกรรม').fill(title);
    await panel.getByLabel('รายละเอียด').fill('PRIVATE test data');
    await panel.getByLabel('เริ่ม').fill('2026-10-20T09:00');
    await panel.getByLabel('สิ้นสุด').fill('2026-10-20T10:00');
    await panel.getByRole('button', { name: 'ส่งกิจกรรม' }).click();
    await expect(owner.getByText('ส่งกิจกรรมไปยังสมาชิกแล้ว')).toBeVisible();
    await expect.poll(() => eventId(roomId, title)).not.toBeNull();
    return eventId(roomId, title);
  }

  async function responseFor(title, button) {
    const panel = inbox(member);
    await roomPanel(member).getByRole('button', { name: 'โหลดคำเชิญใหม่' }).click();
    const row = panel.locator('li').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('PENDING');
    await row.getByRole('button', { name: button }).click();
    await expect(member.getByText(button === 'ยอมรับ' ? 'ยอมรับกิจกรรมแล้ว' : 'ปฏิเสธกิจกรรมแล้ว')).toBeVisible();
  }

  async function cancelAssignment(title) {
    const panel = roomPanel(owner).locator('.room-activity-list').first();
    const row = panel.locator('li').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await expect(owner.getByRole('dialog')).toBeVisible();
    await owner.getByRole('button', { name: 'ยกเลิกกิจกรรม' }).click();
    await expect(owner.getByText('ยกเลิกกิจกรรมแล้ว')).toBeVisible();
  }

  try {
    for (const page of [owner, member]) {
      await page.goto('/');
      await page.waitForFunction(() => Boolean(window.__ourscheduleE2e));
      await page.evaluate(() => window.__ourscheduleE2e.signIn());
      await expect(page.getByText(/เชื่อมต่อบัญชีแล้ว:/)).toBeVisible();
    }
    const ownerUid = await owner.evaluate(() => window.__ourscheduleE2e.uid());
    const memberUid = await member.evaluate(() => window.__ourscheduleE2e.uid());
    expect(memberUid).not.toEqual(ownerUid);

    // Owner creates the room and a single-use M2 invite from real UI.
    await owner.getByRole('textbox', { name: 'ชื่อห้องใหม่' }).fill(tag);
    await owner.getByRole('button', { name: 'สร้างห้อง', exact: true }).click();
    await expect(owner.getByText('สร้างห้องเรียบร้อยแล้ว')).toBeVisible();
    await expect.poll(() => owner.evaluate(
      (name) => window.__ourscheduleE2e.ownedRoomId(name), tag,
    )).not.toBeNull();
    const roomId = await owner.evaluate(
      (name) => window.__ourscheduleE2e.ownedRoomId(name), tag,
    );
    expect(roomId).toBeTruthy();

    await owner.getByRole('combobox', { name: 'เลือกห้องเพื่อเชิญ' }).selectOption(roomId);
    await owner.getByRole('button', { name: 'สร้างลิงก์เชิญ' }).click();
    await expect(owner.getByText('สร้างคำเชิญแล้ว · ใช้ได้ครั้งเดียวภายใน 48 ชั่วโมง')).toBeVisible();
    const inviteLink = (await owner.locator('.invite-link').textContent()).trim();
    // The UI intentionally parses full links only from HTTPS staging origins.
    // In localhost emulator tests, pass just the bearer token (not an HTTP URL).
    const inviteToken = new URLSearchParams(new URL(inviteLink).hash.slice(1)).get('invite');
    expect(inviteToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Never print the token; it belongs exclusively to the demo emulator.
    await member.getByRole('textbox', { name: 'ลิงก์หรือรหัสคำเชิญ' }).fill(inviteToken);
    await member.getByRole('button', { name: 'เข้าร่วมห้อง' }).click();
    await expect(member.getByText('เข้าร่วมห้องสำเร็จ')).toBeVisible();
    await expect(member.getByText('คุณเข้าร่วม: ' + tag)).toBeVisible();

    const accepted = await createAssignment(activity('ACCEPT'), roomId, memberUid);
    expect(await status(member, roomId, accepted)).toBe('denied');
    expect(await member.evaluate((id) => window.__ourscheduleE2e.listEvents(id), roomId)).toBe('denied');
    await responseFor(activity('ACCEPT'), 'ยอมรับ');
    expect(await status(member, roomId, accepted)).toBe('ok');

    // SweetAlert2 cancel is non-destructive.
    const acceptedRow = roomPanel(owner).locator('.room-activity-list').first()
      .locator('li').filter({ hasText: activity('ACCEPT') });
    await acceptedRow.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await owner.getByRole('button', { name: 'กลับ', exact: true }).click();
    expect(await status(member, roomId, accepted)).toBe('ok');
    await cancelAssignment(activity('ACCEPT'));
    await expect.poll(() => status(member, roomId, accepted)).toBe('denied');

    const declined = await createAssignment(activity('DECLINE'), roomId, memberUid);
    expect(await status(member, roomId, declined)).toBe('denied');
    await responseFor(activity('DECLINE'), 'ปฏิเสธ');
    expect(await status(member, roomId, declined)).toBe('denied');
    expect(await member.evaluate(
      (id) => window.__ourscheduleE2e.reaccept(id), declined,
    )).toBe('denied');

    const revoked = await createAssignment(activity('REVOKE'), roomId, memberUid);
    expect(await status(member, roomId, revoked)).toBe('denied');
    await responseFor(activity('REVOKE'), 'ยอมรับ');
    expect(await status(member, roomId, revoked)).toBe('ok');

    await owner.getByRole('combobox', { name: 'เลือกห้องเพื่อจัดการสมาชิก' }).selectOption(roomId);
    const row = owner.locator('.room-members li').filter({ hasText: memberUid.slice(0, 8) });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'ลบสมาชิก' }).click();
    await owner.getByRole('button', { name: 'ลบสมาชิก', exact: true }).last().click();
    await expect(owner.getByText('เพิกถอนสิทธิ์สมาชิกแล้ว')).toBeVisible();
    await expect.poll(() => status(member, roomId, revoked)).toBe('denied');
    expect(await member.evaluate((id) => window.__ourscheduleE2e.readRoom(id), roomId)).toBe('denied');
    expect(await member.evaluate(() => window.__ourscheduleE2e.joinedMemberCount())).toBe(0);
  } finally {
    await memberContext.close();
    await ownerContext.close();
  }
});
