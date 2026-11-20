// Freezer page intro: a deep chest freezer, the lid swings open, cold light and fog spill out. Tap to skip.
import { useEffect, useState } from 'react';
import { cameFrom } from './Cookbook';
import { FrostyFlake } from './Frost';

const motionOk = () => document.documentElement.dataset.anim !== 'off' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function FreezerIntro() {
  const [on, setOn] = useState(() => motionOk() && !['sheet', 'freezer'].includes(cameFrom()));
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), 2300); return () => clearTimeout(t); }, [on]);
  if (!on) return null;
  return (
    <div className="chest-intro" onClick={() => setOn(false)} aria-hidden="true">
      <div className="chest-scene">
        <div className="chest">
          <div className="chest-inside">
            <span className="chest-glow" />
            {Array.from({ length: 9 }, (_, i) => <i key={i} className="ball" style={{ left: `${12 + (i % 5) * 18 + (i > 4 ? 9 : 0)}%`, top: `${i > 4 ? 58 : 28}%` }} />)}
          </div>
          <div className="chest-lid">
            <div className="lid-top"><span className="lid-badge"><FrostyFlake size={22} /> Flour &amp; Flame</span></div>
            <div className="lid-under" />
            <div className="lid-front" />
          </div>
          <div className="chest-front">
            <span className="chest-handle" />
            <span className="chest-vent" />
            <span className="chest-light" />
          </div>
          <span className="chest-beam" />
          <div className="fog">{Array.from({ length: 10 }, (_, i) => <b key={i} style={{ left: `${5 + i * 10}%`, animationDelay: `${0.8 + (i % 4) * 0.09}s`, ['--dx' as any]: `${(i - 4.5) * 8}px` }} />)}</div>
          <div className="fog front">{Array.from({ length: 8 }, (_, i) => <b key={i} style={{ left: `${8 + i * 12}%`, animationDelay: `${1.0 + (i % 3) * 0.1}s`, ['--dx' as any]: `${(i - 3.5) * 6}px` }} />)}</div>
        </div>
        <div className="chest-floor" />
      </div>
    </div>
  );
}
