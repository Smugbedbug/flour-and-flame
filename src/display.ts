// Display preferences for this device: text size and high contrast.
import { useEffect, useState } from 'react';

export type TextSize = 'normal' | 'large' | 'xl';
const K = 'ff-display';
type Prefs = { text: TextSize; contrast: boolean; /** undefined = automatic (on in December) */ holiday?: boolean };
export function getDisplay(): Prefs { try { return { text: 'normal', contrast: false, ...JSON.parse(localStorage.getItem(K) ?? '{}') }; } catch { return { text: 'normal', contrast: false }; } }
export function applyDisplay(p = getDisplay()) {
  const el = document.documentElement;
  el.dataset.text = p.text;
  el.dataset.contrast = p.contrast ? 'high' : 'normal';
  try { el.dataset.anim = localStorage.getItem('ff-logo-animation') === 'off' ? 'off' : 'on'; } catch { /* ignore */ }
}
export function setDisplay(patch: Partial<Prefs>) {
  const p = { ...getDisplay(), ...patch };
  try { localStorage.setItem(K, JSON.stringify(p)); } catch { /* ignore */ }
  applyDisplay(p);
  window.dispatchEvent(new Event('ff-display'));
}
export const holidayOn = (p: Prefs = getDisplay()) => p.holiday ?? new Date().getMonth() === 11;
export function useDisplay(): Prefs {
  const [p, setP] = useState(getDisplay);
  useEffect(() => { const f = () => setP(getDisplay()); window.addEventListener('ff-display', f); return () => window.removeEventListener('ff-display', f); }, []);
  return p;
}
