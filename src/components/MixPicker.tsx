// Choose the flavours in a mixed box: steppers in groups of `step`, adding up to `pieces`.
import { Minus, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MixOption, MixPart } from '../freezer';

export type MixValue = Record<string, number>;
export const mixTotal = (v: MixValue) => Object.values(v).reduce((a, b) => a + (b || 0), 0);
export const mixParts = (options: MixOption[], v: MixValue): MixPart[] =>
  options.filter(o => (v[o.recipeId] ?? 0) > 0).map(o => ({ recipeId: o.recipeId, recipeTitle: o.recipeTitle, count: v[o.recipeId], ...(o.dough === false ? { dough: false } : {}) }));

export function MixPicker({ options, pieces, step = 1, value, onChange, label, pictureOf }: { options: MixOption[]; pieces: number; step?: number; value: MixValue; onChange: (v: MixValue) => void; label: string; pictureOf?: (o: MixOption) => ReactNode }) {
  const total = mixTotal(value);
  const left = pieces - total;
  return (
    <div className="mix-picker" role="group" aria-label={label}>
      <p className={'mix-status small ' + (left === 0 ? 'ok-text' : '')}>{left === 0 ? `✓ ${pieces} chosen` : `Choose ${left} more (${total} of ${pieces})`}{step > 1 ? ` · in groups of ${step}` : ''}</p>
      {options.map(o => {
        const n = value[o.recipeId] ?? 0;
        return (
          <div key={o.recipeId} className="pick-row">
            <span className="mix-name">{pictureOf?.(o)}{o.recipeTitle}</span>
            <span className="stepper small">
              <button type="button" aria-label={`Fewer ${o.recipeTitle} in ${label}`} disabled={n <= 0} onClick={() => onChange({ ...value, [o.recipeId]: Math.max(0, n - step) })}><Minus size={16} /></button>
              <output aria-label={`${o.recipeTitle} in ${label}`}>{n}</output>
              <button type="button" aria-label={`More ${o.recipeTitle} in ${label}`} disabled={left < step} onClick={() => onChange({ ...value, [o.recipeId]: n + step })}><Plus size={16} /></button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
