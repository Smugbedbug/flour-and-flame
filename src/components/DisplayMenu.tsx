// "Aa" button next to the logo: text size, contrast, motion and alert sound in one place.
import { Contrast, Type, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { holidayOn, setDisplay, useDisplay, type TextSize } from '../display';
import { getLogoAnimationSetting, setLogoAnimationSetting } from './Logo';
import { getAlertSound, setAlertSound, SoundChoice } from './OrderAlerts';
import { INTROS, introsOff, setAllIntros, setIntroOn, type IntroKey } from '../intros';

export function DisplayMenu() {
  const [open, setOpen] = useState(false);
  const d = useDisplay();
  const [anim, setAnim] = useState(getLogoAnimationSetting);
  const [sound, setSound] = useState(getAlertSound);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const sizes: [TextSize, string][] = [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']];
  return (
    <div className="display-menu" ref={ref}>
      <button className="aa-btn" aria-expanded={open} aria-label="Display settings: text size and contrast" onClick={() => setOpen(!open)}><Type size={18} /><span>Aa</span></button>
      {open && (
        <div className="display-panel" role="dialog" aria-label="Display settings">
          <div className="dp-top"><button className="small-btn" aria-label="Close" onClick={() => setOpen(false)}><X size={14} /> Close</button><strong>Display</strong></div>
          <p className="small muted">Text size</p>
          <div className="seg" role="radiogroup" aria-label="Text size">
            {sizes.map(([k, l]) => <button key={k} role="radio" aria-checked={d.text === k} className={d.text === k ? 'on' : ''} onClick={() => setDisplay({ text: k })} style={{ fontSize: k === 'normal' ? 14 : k === 'large' ? 16 : 18 }}>{l}</button>)}
          </div>
          <label className="agree"><input type="checkbox" checked={d.contrast} onChange={e => setDisplay({ contrast: e.target.checked })} /> <Contrast size={16} /> High contrast (brighter text, bolder outlines)</label>
          <label className="agree"><input type="checkbox" checked={anim} onChange={e => { setAnim(e.target.checked); setLogoAnimationSetting(e.target.checked); }} /> Animations (phoenix wings, Freezer snow)</label>
          <IntroSettings animOn={anim} />
          <label className="agree"><input type="checkbox" checked={holidayOn(d)} onChange={e => setDisplay({ holiday: e.target.checked })} /> ✨ Holiday lights (on automatically in December)</label>
          <label className="agree"><input type="checkbox" checked={sound} onChange={e => { setSound(e.target.checked); setAlertSound(e.target.checked); }} /> Sound for new orders</label>
          {sound && <SoundChoice />}
          <p className="small muted">Saved on this device.</p>
        </div>
      )}
    </div>
  );
}

/** Page intros: one switch for all, and one per page. Tapping any intro also skips it. */
function IntroSettings({ animOn }: { animOn: boolean }) {
  const [off, setOff] = useState<IntroKey[]>(introsOff);
  const keys = Object.keys(INTROS) as IntroKey[];
  const allOn = off.length === 0, allOff = off.length === keys.length;
  return (
    <fieldset className="intro-settings">
      <legend className="small muted">Page intros</legend>
      <label className="agree"><input type="checkbox" checked={!allOff} ref={el => { if (el) el.indeterminate = !allOn && !allOff; }} onChange={e => { setAllIntros(e.target.checked); setOff(introsOff()); }} /> Play page intros <span className="muted small">(tap any intro to skip it)</span></label>
      <div className="intro-list">
        {keys.map(k => <label key={k} className="agree small"><input type="checkbox" checked={!off.includes(k)} onChange={e => { setIntroOn(k, e.target.checked); setOff(introsOff()); }} /> {INTROS[k]}</label>)}
      </div>
      {!animOn && <p className="small muted">Animations are off, so no intros play right now.</p>}
    </fieldset>
  );
}
