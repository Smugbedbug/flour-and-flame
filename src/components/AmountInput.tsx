import { useState } from 'react';
import { toBase } from '../costing';
import { quarter } from '../units';

/** Units offered in the editor. */
export const EDIT_UNITS = ['g', 'kg', 'oz', 'lb', 'tsp', 'tbsp', 'cup', 'ml', 'each', 'pinch'] as const;
const SPOON = new Set(['tsp', 'tbsp', 'cup']);

export function quickAmounts(unit: string): number[] {
  const u = unit.toLowerCase();
  if (SPOON.has(u)) return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  if (u === 'each') return [1, 2, 3, 4, 5, 6, 8, 10, 12];
  if (u === 'pinch') return [1, 2];
  return [];
}

export function amountLabel(n: number): string { return Math.abs(n * 4 - Math.round(n * 4)) < 1e-9 ? quarter(n) : String(n); }

/** Validates one ingredient quantity before saving. Returns a message or null. */
export function quantityProblem(amount: number, unit: string, name = ''): string | null {
  const label = name.trim() || 'An ingredient';
  if (!(EDIT_UNITS as readonly string[]).includes(unit)) return `${label}: choose a unit from the list (currently “${unit}”).`;
  if (!Number.isFinite(amount)) return `${label}: enter an amount.`;
  if (amount <= 0) return `${label}: the amount must be more than 0.`;
  if (amount > 100000) return `${label}: that amount looks too large.`;
  return null;
}

/**
 * Converts an amount when the unit dropdown changes, only within the same kind of measure
 * (weight↔weight, volume↔volume; butter also tbsp/stick↔weight by the US standard). Otherwise returns null.
 */
export function convertForEdit(amount: number, from: string, to: string, butter: boolean): number | null {
  if (!Number.isFinite(amount)) return null;
  const a = toBase(amount, from, butter), b = toBase(1, to, butter);
  if (from !== to && (!a || !b || a.dim !== b.dim || from === 'pinch' || to === 'pinch')) return null;
  const v = from === to || !a || !b ? amount : a.value / b.value;
  if (to === 'g' || to === 'ml') return v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  if (SPOON.has(to)) return Math.round(v * 4) / 4 || Math.round(v * 1000) / 1000;
  return Math.round(v * 100) / 100;
}

type Props = { amount: number; unit: string; onChange: (amount: number) => void; label?: string };

/** Quantity control: quick picks for spoons/counts, plus a custom numeric entry. Touch-friendly. */
export function AmountInput({ amount, unit, onChange, label = 'Amount' }: Props) {
  const quick = quickAmounts(unit);
  const inList = quick.some(q => Math.abs(q - amount) < 1e-9);
  const [custom, setCustom] = useState(!inList && quick.length > 0 && Number.isFinite(amount));
  if (quick.length && !custom && (inList || !Number.isFinite(amount))) {
    return (
      <select aria-label={label} className="amount-pick" value={inList ? String(amount) : ''} onChange={e => { if (e.target.value === 'custom') setCustom(true); else onChange(Number(e.target.value)); }}>
        {!inList && <option value="">Choose…</option>}
        {quick.map(q => <option key={q} value={String(q)}>{amountLabel(q)}</option>)}
        <option value="custom">Custom…</option>
      </select>
    );
  }
  return (
    <span className="amount-custom">
      <input aria-label={label} type="number" inputMode="decimal" step="any" min="0" value={Number.isNaN(amount) ? '' : amount} onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
      {quick.length > 0 && <button type="button" className="mini-btn" aria-label="Pick from list" onClick={() => setCustom(false)}>▾</button>}
    </span>
  );
}
