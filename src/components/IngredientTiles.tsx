import { ArrowLeftRight, Check, Info } from 'lucide-react';
import { useRef, useState } from 'react';
import { eggGuidance } from '../logic';
import { ingredientDisplay } from '../units';
import type { Ingredient } from '../types';

type Props = {
  ingredients: Ingredient[];
  factor: number;
  /** ids of measured ingredients; omit for a read-only preview */
  checked?: string[];
  onToggle?: (id: string) => void;
  large?: boolean;
  /** ingredient id → interchangeable product names (session-only swaps) */
  swaps?: Record<string, string[]>;
  onSwap?: (id: string, name: string) => void;
};

/** Groups ingredients by their section heading while keeping the original order. */
export function groupBySection(ingredients: Ingredient[]): { section: string; items: Ingredient[] }[] {
  const groups: { section: string; items: Ingredient[] }[] = [];
  for (const i of ingredients) {
    const section = i.section?.trim() || '';
    let g = groups.find(x => x.section === section);
    if (!g) { g = { section, items: [] }; groups.push(g); }
    g.items.push(i);
  }
  return groups;
}

/** "Vanilla extract" / "Vanilla bean paste" → "Extract" / "Bean paste" (drop the words they share at the start). */
export function shortNames(names: string[]): string[] {
  const words = names.map(n => n.split(/\s+/));
  let k = 0;
  while (words.every(w => w.length > k + 1 && w[k].toLowerCase() === words[0][k].toLowerCase())) k++;
  return words.map(w => { const t = w.slice(k).join(' '); return t.charAt(0).toUpperCase() + t.slice(1); });
}

export function IngredientTiles({ ingredients, factor, checked, onToggle, large, swaps, onSwap }: Props) {
  const interactive = !!onToggle;
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [flipping, setFlipping] = useState<Record<string, number>>({});
  const timers = useRef<Record<string, number>>({});
  const swapTo = (id: string, name: string) => {
    onSwap?.(id, name);
    setFlipping(f => ({ ...f, [id]: (f[id] ?? 0) + 1 }));
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(() => setFlipping(f => { const n = { ...f }; delete n[id]; return n; }), 900);
  };
  return (
    <div className={'tiles-wrap' + (large ? ' large' : '')}>
      {groupBySection(ingredients).map(group => (
        <section key={group.section || '_'} className="tile-group">
          {group.section && <h4 className="tile-heading">{group.section}</h4>}
          <div className="tiles">
            {group.items.map(i => {
              const d = ingredientDisplay(i, factor, eggGuidance(i, factor));
              const isChecked = !!checked?.includes(i.id);
              const body = (
                <>
                  <span className="tile-check" aria-hidden>{isChecked && <Check size={16} strokeWidth={3} />}</span>
                  <span className="tile-name">{i.name}{i.optional && <em> (optional)</em>}</span>
                  <span className="tile-amount">{d.primary}</span>
                  {d.secondary.length > 0 && <span className="tile-secondary">≈ {d.secondary.map(x => x.replace(/^≈ /, '')).join(' ≈ ')}</span>}
                </>
              );
              return (
                <div key={i.id + ':' + (flipping[i.id] ?? 0)} className={'tile' + (isChecked ? ' checked' : '') + (interactive ? ' interactive' : '') + (flipping[i.id] ? ' tile-flip' : '') + ((d.note || i.note) ? ' has-info' : '')}>
                  {interactive ? (
                    <button type="button" className="tile-main" aria-pressed={isChecked} onClick={() => onToggle!(i.id)}
                      aria-label={`${i.name}, ${d.primary}${isChecked ? ', measured' : ''}`}>{body}</button>
                  ) : <div className="tile-main">{body}</div>}
                  {swaps?.[i.id] && onSwap && (
                    <span className="tile-swap" role="radiogroup" aria-label={`Use instead of ${i.name} (this bake only)`}>
                      <ArrowLeftRight size={13} aria-hidden className="tile-swap-icon" />
                      {(() => { const names = swaps[i.id], short = shortNames(names); return names.map((n, k) => {
                        const on = n.toLowerCase() === i.name.toLowerCase();
                        return <button key={n} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => { if (!on) swapTo(i.id, n); }} aria-label={on ? `${n} (in use)` : `Use ${n} instead (this bake only)`}>{short[k]}</button>;
                      }); })()}
                    </span>
                  )}
                  {(d.note || i.note) && (
                    <>
                      <button type="button" className="tile-info" aria-expanded={openNote === i.id} onClick={() => setOpenNote(openNote === i.id ? null : i.id)} aria-label={`More about ${i.name}`}><Info size={16} /></button>
                      {openNote === i.id && <p className="tile-note">{[i.note, d.note].filter(Boolean).join(' ')}</p>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
