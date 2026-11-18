import { Check, Info } from 'lucide-react';
import { useState } from 'react';
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

export function IngredientTiles({ ingredients, factor, checked, onToggle, large }: Props) {
  const interactive = !!onToggle;
  const [openNote, setOpenNote] = useState<string | null>(null);
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
                <div key={i.id} className={'tile' + (isChecked ? ' checked' : '') + (interactive ? ' interactive' : '')}>
                  {interactive ? (
                    <button type="button" className="tile-main" aria-pressed={isChecked} onClick={() => onToggle!(i.id)}
                      aria-label={`${i.name}, ${d.primary}${isChecked ? ', measured' : ''}`}>{body}</button>
                  ) : <div className="tile-main">{body}</div>}
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
