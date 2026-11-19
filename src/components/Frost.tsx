// The Freezer's chilly look: frosted corners, a cold blue glow and gentle falling snow.
// Snow only moves when animations are on (Display → Animations) and the device doesn't ask for reduced motion.
import { Snowflake } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getLogoAnimationSetting, usePrefersReducedMotion } from './Logo';

export function useAnimationsOn() {
  const reduced = usePrefersReducedMotion();
  const [on, setOn] = useState(getLogoAnimationSetting);
  useEffect(() => { const f = () => setOn(getLogoAnimationSetting()); window.addEventListener('ff-logo-animation', f); return () => window.removeEventListener('ff-logo-animation', f); }, []);
  return on && !reduced;
}

export function FrostLayer() {
  const moving = useAnimationsOn();
  const flakes = useMemo(() => Array.from({ length: 26 }, (_, i) => {
    const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
    return { left: r(1) * 100, size: 2 + r(2) * 4, dur: 10 + r(3) * 12, delay: -r(4) * 20, drift: (r(5) - 0.5) * 60, op: 0.25 + r(6) * 0.35, big: r(7) > 0.86 };
  }), []);
  return (
    <div className={'frost-layer' + (moving ? ' moving' : '')} aria-hidden="true">
      <div className="frost-corner tl" /><div className="frost-corner tr" /><div className="frost-corner bl" /><div className="frost-corner br" />
      {flakes.map((f, i) => f.big
        ? <Snowflake key={i} className="flake big" size={10 + f.size * 2} style={{ left: `${f.left}%`, animationDuration: `${f.dur * 1.4}s`, animationDelay: `${f.delay}s`, opacity: f.op * 0.7, ['--drift' as any]: `${f.drift}px` }} />
        : <span key={i} className="flake" style={{ left: `${f.left}%`, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`, opacity: f.op, ['--drift' as any]: `${f.drift}px` }} />)}
    </div>
  );
}

/** The big snowflake in the Freezer heading: slowly turns and glints. */
export function FrostyFlake({ size = 30 }: { size?: number }) {
  return <span className="frosty-flake"><Snowflake size={size} /><i className="glint" /></span>;
}
