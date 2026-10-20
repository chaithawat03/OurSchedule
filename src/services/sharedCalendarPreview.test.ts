import {afterEach,describe,expect,it,vi} from 'vitest';
import type { User } from 'firebase/auth';

// The entire API is intentionally unavailable in normal Live Staging builds.
// Test the guard without any Firebase credentials or emulator processes.
vi.mock('./firebaseClient',()=>({firebaseClient:{db:{}}}));
import {
  listPublishedRoomCalendar,publishRoomCalendarEntry,withdrawPublishedRoomEntry,
} from './sharedCalendarPreview';

afterEach(()=>vi.unstubAllEnvs());
const user={uid:'owner'} as User;

describe('M4b preview service cannot access live Staging by default',()=>{
  it('blocks publishing while M4b preview is disabled',async()=>{
    vi.stubEnv('VITE_PHASE2B_PREVIEW','0');
    vi.stubEnv('VITE_M4B_SHARED_PREVIEW','0');
    await expect(publishRoomCalendarEntry(user,'room-a',{
      visibility:'BUSY_ONLY',
      start:new Date('2026-10-20T02:00:00Z'),
      end:new Date('2026-10-20T03:00:00Z'),
      allDay:false,
    })).rejects.toThrow(/E2E Preview/);
  });
  it('blocks listing or deleting shared appointments on Live',async()=>{
    vi.stubEnv('VITE_PHASE2B_PREVIEW','0');
    vi.stubEnv('VITE_M4B_SHARED_PREVIEW','0');
    await expect(listPublishedRoomCalendar(user,'room-a')).rejects.toThrow(/E2E Preview/);
    await expect(withdrawPublishedRoomEntry(user,'room-a','event')).rejects.toThrow(/E2E Preview/);
  });
  it('refuses incomplete preview opt-in without the named database runtime marker',async()=>{
    vi.stubEnv('VITE_PHASE2B_PREVIEW','1');
    vi.stubEnv('VITE_M4B_SHARED_PREVIEW','1');
    await expect(listPublishedRoomCalendar(user,'room-a')).rejects.toThrow(/E2E Preview/);
  });
});
