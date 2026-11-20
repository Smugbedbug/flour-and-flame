// "Empty the freezer" (everything out, recorded as thrown out) and "Test stock" (empty, then random amounts
// of every cookie flavour on the menu, for trying out orders), with the freezer icing over and the count
// running down to zero (and, for test stock, back up).
import { Dice5, Snowflake } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { addEvents } from '../ledger';
import { useLedger } from '../ledgerState';

const reduced = () => document.documentElement.dataset.anim === 'off' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const DOWN_MS = 3400, HOLD_MS = 900, UP_MS = 1800;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Cookie flavours to stock: everything on the menu that uses freezer dough (else approved cookie recipes). */
export function testStockFlavours(products: { active: boolean; kind?: string; recipeId: string; recipeTitle: string; dough?: boolean; options?: { recipeId: string; recipeTitle: string; dough?: boolean }[] }[], recipes: { id: string; title: string; category: string; status: string }[]) {
  const m = new Map<string, string>();
  for (const p of products) if (p.active) {
    if (p.kind === 'mixed') { for (const o of p.options ?? []) if (o.dough !== false) m.set(o.recipeId, o.recipeTitle); }
    else if (p.dough !== false) m.set(p.recipeId, p.recipeTitle);
  }
  if (!m.size) for (const r of recipes) if (r.category === 'Cookies' && r.status === 'Approved') m.set(r.id, r.title);
  return [...m].map(([recipeId, recipeTitle]) => ({ recipeId, recipeTitle }));
}
/** 6–60 in half dozens. */
export const randomCount = (r = Math.random) => 6 * (1 + Math.floor(r() * 10));

export function EmptyFreezer() {
  const { freezer, bakery } = useLedger();
  const { run, notify, recipes } = useApp();
  const [ice, setIce] = useState<{ n: number; label: string; done?: boolean } | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const animate = (from: number, to: number, onDone: () => void) => {
    const total = from;
    const start = performance.now();
    const down = (t: number) => {
      const p = Math.min(1, (t - start) / DOWN_MS);
      const eased = 1 - Math.pow(1 - p, 2.2); // starts quick, slows as it nears zero
      setIce({ n: Math.round(total * (1 - eased)), label: 'dough balls' });
      if (p < 1) { raf.current = requestAnimationFrame(down); return; }
      setIce({ n: 0, label: 'Freezer empty', done: to === 0 });
      if (to === 0) { onDone(); setTimeout(() => setIce(null), 2200); return; }
      setTimeout(() => {
        const s2 = performance.now();
        const up = (t2: number) => {
          const q = Math.min(1, (t2 - s2) / UP_MS);
          setIce({ n: Math.round(to * (1 - Math.pow(1 - q, 3))), label: 'test stock added' });
          if (q < 1) raf.current = requestAnimationFrame(up);
          else { setIce({ n: to, label: 'test stock added', done: true }); onDone(); setTimeout(() => setIce(null), 2200); }
        };
        raf.current = requestAnimationFrame(up);
      }, HOLD_MS);
    };
    raf.current = requestAnimationFrame(down);
  };

  const removals = () => freezer.items.filter(i => i.total > 0).map(i => ({ type: 'freezer.remove', recipeId: i.recipeId, recipeTitle: i.recipeTitle, count: i.total, reason: 'discarded', note: 'Emptied the freezer' } as any));
  const reservedWarning = () => { const n = bakery.plan.reduce((t, r) => t + Math.min(r.reserved, r.inFreezer), 0); return n ? `\n\n⚠ ${n} of them are set aside for confirmed orders, so you'd need to make that dough again.` : ''; };

  const empty = () => {
    if (!window.confirm(`Empty the freezer? All ${freezer.total} dough balls will be marked as thrown out.${reservedWarning()}\n\nThis can't be undone (you can add dough again any time).`)) return;
    const ev = removals(), total = freezer.total;
    const save = () => void run(async () => { await addEvents(ev); notify(`❄️ Freezer emptied: ${total} dough balls out.`); });
    if (reduced()) save(); else animate(total, 0, save);
  };

  const testStock = () => {
    const flavours = testStockFlavours(bakery.products, recipes);
    if (!flavours.length) { notify('No cookie flavours to stock yet: add a cookie to the menu first.', true); return; }
    const amounts = flavours.map(f => ({ ...f, count: randomCount() }));
    const sum = amounts.reduce((t, a) => t + a.count, 0);
    if (!window.confirm(`Reset the freezer with random test amounts?\n\nEverything now in it (${freezer.total}) is emptied, then ${flavours.length} flavour${flavours.length > 1 ? 's' : ''} get 6–60 dough balls each (${sum} in all), marked “Test stock”.${reservedWarning()}`)) return;
    const ev = [...removals(), ...amounts.map(a => ({ type: 'freezer.add', batchId: `test-${a.recipeId}-${Date.now()}`, recipeId: a.recipeId, recipeTitle: a.recipeTitle, count: a.count, frozenOn: today(), note: 'Test stock (random)' } as any))];
    const save = () => void run(async () => { await addEvents(ev); notify(`🎲 Test stock: ${amounts.map(a => `${a.recipeTitle} ${a.count}`).join(' · ')} (${sum} dough balls).`); });
    if (reduced()) save(); else animate(freezer.total, sum, save);
  };

  return <>
    {freezer.total > 0 && <button className="small-btn empty-freezer-btn" onClick={empty}><Snowflake size={14} /> Empty the freezer</button>}
    <button className="small-btn test-stock-btn" onClick={testStock} title="For testing: empty the freezer, then add random amounts"><Dice5 size={14} /> Test stock</button>
    {ice && (
      <div className={'ice-over' + (ice.done ? ' frozen' : '')} aria-live="assertive" role="status">
        <svg className="ice-cracks" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => { const x = (i * 97) % 400, y = (i * 61) % 300; return <path key={i} d={`M${x} ${y} l${20 + (i * 13) % 40} ${-15 + (i * 7) % 30} l${10 + (i * 11) % 30} ${10 + (i * 17) % 25} m-20 -10 l${-10 - (i * 5) % 20} ${15 + (i * 3) % 20}`} />; })}
        </svg>
        <div className="ice-count"><Snowflake size={44} /><span className="ice-num">{ice.n}</span><span className="ice-label">{ice.label}</span></div>
      </div>
    )}
  </>;
}
