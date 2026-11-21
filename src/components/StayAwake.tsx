import { Sun, SunDim } from 'lucide-react';
import { useApp } from '../app-context';
import { setAwake, useAwake, wakeSupported } from '../wakeLock';

/** Top-bar button (touch devices): keep the screen from dimming while you work. */
export function StayAwakeButton() {
  const { notify } = useApp();
  const { on } = useAwake();
  const toggle = async () => {
    if (!wakeSupported()) { notify('This browser can’t keep the screen awake. In Chrome on your phone it works.', true); return; }
    const held = await setAwake(!on);
    if (!on) notify(held ? '☀️ Screen stays awake while the app is open (turns off by itself after 3 hours).' : 'Couldn’t keep the screen awake (battery saver may be blocking it).', !held);
    else notify('Screen can dim again.');
  };
  return (
    <button className={'awake-btn' + (on ? ' on' : '')} aria-pressed={on} aria-label={on ? 'Screen staying awake: tap to allow dimming' : 'Keep screen awake'} title={on ? 'Screen staying awake' : 'Keep screen awake'} onClick={() => void toggle()}>
      {on ? <Sun size={20} /> : <SunDim size={20} />}<span className="awake-word">{on ? 'Awake' : 'Stay awake'}</span>
    </button>
  );
}
