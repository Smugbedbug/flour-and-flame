// "Empty the freezer": everything out at once (recorded as discarded), with the freezer icing over
// and the count running down to zero.
import { Snowflake } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { addEvents } from '../ledger';
import { useLedger } from '../ledgerState';

const reduced = () => document.documentElement.dataset.anim === 'off' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function EmptyFreezer() {
  const { freezer, bakery } = useLedger();
  const { run, notify } = useApp();
  const [ice, setIce] = useState<{ from: number; n: number } | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  if (freezer.total <= 0) return null;

  const empty = () => {
    const reserved = bakery.plan.reduce((t, r) => t + Math.min(r.reserved, r.inFreezer), 0);
    if (!window.confirm(`Empty the freezer? All ${freezer.total} dough balls will be marked as thrown out.${reserved ? `\n\n⚠ ${reserved} of them are set aside for confirmed orders, so you'd need to make that dough again.` : ''}\n\nThis can't be undone (you can add dough again any time).`)) return;
    const items = freezer.items.filter(i => i.total > 0);
    const total = freezer.total;
    const save = () => run(async () => {
      await addEvents(items.map(i => ({ type: 'freezer.remove', recipeId: i.recipeId, recipeTitle: i.recipeTitle, count: i.total, reason: 'discarded', note: 'Emptied the freezer' } as any)));
      notify(`❄️ Freezer emptied: ${total} dough balls out (${items.map(i => `${i.recipeTitle} ${i.total}`).join(', ')}).`);
    });
    if (reduced()) { void save(); return; }
    setIce({ from: total, n: total });
    const start = performance.now(), dur = 1700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setIce({ from: total, n: Math.round(total * (1 - (1 - Math.pow(1 - p, 3)))) });
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else { void save(); setTimeout(() => setIce(null), 1300); }
    };
    raf.current = requestAnimationFrame(tick);
  };

  return <>
    <button className="small-btn empty-freezer-btn" onClick={empty}><Snowflake size={14} /> Empty the freezer</button>
    {ice && (
      <div className={'ice-over' + (ice.n === 0 ? ' frozen' : '')} aria-live="assertive" role="status">
        <svg className="ice-cracks" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => { const x = (i * 97) % 400, y = (i * 61) % 300; return <path key={i} d={`M${x} ${y} l${20 + (i * 13) % 40} ${-15 + (i * 7) % 30} l${10 + (i * 11) % 30} ${10 + (i * 17) % 25} m-20 -10 l${-10 - (i * 5) % 20} ${15 + (i * 3) % 20}`} />; })}
        </svg>
        <div className="ice-count"><Snowflake size={44} /><span className="ice-num">{ice.n}</span><span className="ice-label">{ice.n === 0 ? 'Freezer empty' : 'dough balls'}</span></div>
      </div>
    )}
  </>;
}
