export function normalizeRoomName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function validateRoomName(value: string): string {
  const name = normalizeRoomName(value);
  if ([...name].length < 2 || [...name].length > 60 || new TextEncoder().encode(name).length > 180) {
    throw new Error('ชื่อห้องต้องมี 2–60 ตัวอักษร และไม่ยาวเกิน 180 ไบต์');
  }
  return name;
}
