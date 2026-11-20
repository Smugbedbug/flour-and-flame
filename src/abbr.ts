import { useMemo } from 'react';
import { useLedger } from './ledgerState';
// Short names for busy screens: "Brown Butter Chocolate Chip Cookies" → "BBCC",
// "Lemon Crinkle Sugar Cookies" → "LCS", "Snickerdoodles" → "Snickerdoodles".
// Words like "Cookies" / "Cupcakes" are dropped; if two flavours would get the same letters,
// more letters are added until they differ.

const DROP = /^(cookies?|the|and|&|with|of|a)$/i;

function words(title: string): string[] {
  const w = title.replace(/[()]/g, ' ').split(/[\s-]+/).filter(Boolean);
  const kept = w.filter(x => !DROP.test(x));
  return kept.length ? kept : w;
}

function build(w: string[], len: number[]): string {
  if (w.length === 1) return w[0].slice(0, 14);
  return w.map((x, i) => x.charAt(0).toUpperCase() + x.slice(1, len[i]).toLowerCase()).join('');
}

/** Short names for a set of flavour titles, unique within the set. */
export function abbreviations(titles: string[]): Map<string, string> {
  const uniq = [...new Set(titles)];
  const ws = new Map(uniq.map(t => [t, words(t)]));
  const lens = new Map(uniq.map(t => [t, ws.get(t)!.map(() => 1)]));
  const name = (t: string) => build(ws.get(t)!, lens.get(t)!);
  for (let round = 0; round < 8; round++) {
    let changed = false;
    for (const t of uniq) for (const o of uniq) {
      if (o === t || name(o) !== name(t)) continue;
      // add a letter to the first word where the two titles differ
      const a = ws.get(t)!, b = ws.get(o)!;
      let i = a.findIndex((x, k) => x.toLowerCase() !== (b[k] ?? '').toLowerCase());
      if (i < 0) i = a.length - 1;
      lens.get(t)![i]++; changed = true;
    }
    if (!changed) break;
  }
  return new Map(uniq.map(t => [t, name(t)]));
}

/** First name only ("Omar K." → "Omar"). */
export const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || 'them';


/** Short-name lookup for every flavour the bakery knows about (menu, plan, orders). */
export function useShortNames(): (title: string) => string {
  const { bakery } = useLedger();
  const map = useMemo(() => {
    const titles = new Set<string>();
    for (const p of bakery.products) { titles.add(p.recipeTitle); for (const o of p.options ?? []) titles.add(o.recipeTitle); }
    for (const r of bakery.plan) titles.add(r.recipeTitle);
    for (const o of bakery.orders) for (const i of o.items) { titles.add(i.recipeTitle); for (const m of i.mix ?? []) titles.add(m.recipeTitle); }
    return abbreviations([...titles].filter(Boolean));
  }, [bakery.products, bakery.plan, bakery.orders]);
  return (t: string) => map.get(t) ?? abbreviations([t]).get(t)!;
}
