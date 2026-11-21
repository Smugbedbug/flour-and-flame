// "Keep screen awake" for the phone: holds a screen wake lock while the app is open.
// The browser drops the lock when the app is hidden; it is taken again when you come back.
// Turns itself off after 3 hours so a forgotten phone doesn't stay lit all night.
import { useEffect, useState } from 'react';

let wanted = false, lock: any = null, offTimer: ReturnType<typeof setTimeout> | null = null;
const emit = () => window.dispatchEvent(new Event('ff-awake'));
export const wakeSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

async function acquire() {
  if (!wanted || lock || document.visibilityState !== 'visible') return;
  try { lock = await (navigator as any).wakeLock.request('screen'); lock.addEventListener?.('release', () => { lock = null; emit(); }); } catch { lock = null; }
  emit();
}
document.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'visible') void acquire(); });

export async function setAwake(on: boolean): Promise<boolean> {
  wanted = on;
  if (offTimer) { clearTimeout(offTimer); offTimer = null; }
  if (on) { await acquire(); offTimer = setTimeout(() => void setAwake(false), 3 * 60 * 60 * 1000); }
  else { try { await lock?.release(); } catch { /* already gone */ } lock = null; emit(); }
  return !!lock;
}
export function useAwake(): { on: boolean; held: boolean } {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set(n => n + 1); window.addEventListener('ff-awake', f); return () => window.removeEventListener('ff-awake', f); }, []);
  return { on: wanted, held: !!lock };
}
