// "Sample sales": made-up orders for trying out Reports and Customers.
// Generated in memory only: never saved, never sent to the bakery sheet, never emails anyone.
// Uses your real menu, prices and ingredient costs so the numbers look like your bakery.
import { useEffect, useState } from 'react';
import type { Order } from './bakery';
import type { OrderItem, Product } from './freezer';
import { costPerItem, expectedItems, recipeCost } from './costing';
import type { CatalogIngredient, Recipe } from './types';

const KEY = 'ff-demo-sales';
export function useDemo(): [boolean, (on: boolean) => void] {
  const read = () => { try { return sessionStorage.getItem(KEY) === 'on'; } catch { return false; } };
  const [on, setOn] = useState(read);
  useEffect(() => { const f = () => setOn(read()); window.addEventListener('ff-demo', f); return () => window.removeEventListener('ff-demo', f); }, []);
  return [on, (v: boolean) => { try { v ? sessionStorage.setItem(KEY, 'on') : sessionStorage.removeItem(KEY); } catch { /* ignore */ } window.dispatchEvent(new Event('ff-demo')); }];
}

const FIRST = ['Sue', 'Grandpa Joe', 'Amy', 'Marcus', 'Dana', 'Priya', 'Tom', 'Kelsey', 'Luis', 'Hannah', 'Rob', 'Jen', 'Carlos', 'Megan', 'Aunt Linda', 'Brian', 'Tasha', 'Owen'];
const LAST = ['Smith', 'Miller', 'Garcia', 'Lee', 'Nguyen', 'Brown', 'Davis', 'Patel', 'Lopez', 'Wilson', 'Clark', 'Young', 'King', 'Hall', 'Allen', 'Scott', 'Green', 'Adams'];
const METHODS = ['cash', 'cash', 'Venmo', 'Venmo', 'Zelle'];

/** Small seeded random generator so the sample looks the same each time you open it. */
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

export function demoOrders(products: Product[], recipes: Recipe[], catalog: CatalogIngredient[], pickups: string[], today = new Date()): Order[] {
  const rand = rng(20261119);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  let menu = products.filter(p => p.active && (p.kind !== 'mixed' || (p.options?.length ?? 0) >= 2));
  if (!menu.length) {
    // nothing on the menu yet: use approved (or any) cookie recipes at typical prices
    const rs = recipes.filter(r => r.status === 'Approved').concat(recipes.filter(r => r.status !== 'Approved')).slice(0, 4);
    menu = rs.flatMap(r => [{ productId: `${r.id}-6`, name: `Half dozen: ${r.title}`, recipeId: r.id, recipeTitle: r.title, pieces: 6, price: 15, active: true, dough: r.category === 'Cookies' }, { productId: `${r.id}-12`, name: `Dozen: ${r.title}`, recipeId: r.id, recipeTitle: r.title, pieces: 12, price: 28, active: true, dough: r.category === 'Cookies' }]);
    if (!menu.length) menu = [{ productId: 'sample-12', name: 'Dozen: Sample cookie', recipeId: 'sample', recipeTitle: 'Sample cookie', pieces: 12, price: 28, active: true }];
  }
  const perPiece = new Map<string, number | null>();
  const pp = (id: string) => { if (!perPiece.has(id)) { const r = recipes.find(x => x.id === id); perPiece.set(id, r ? costPerItem(recipeCost(r, catalog, { recipes }), expectedItems(r)) : null); } return perPiece.get(id)!; };
  const people = Array.from({ length: 16 }, (_, i) => { const f = FIRST[i % FIRST.length], l = LAST[(i * 7) % LAST.length]; return { name: `${f} ${l}`.replace(/^(Grandpa Joe|Aunt Linda) .*/, '$1'), email: `${f.toLowerCase().replace(/\W+/g, '')}.${l.toLowerCase()}@example.com`, weight: i < 4 ? 4 : i < 9 ? 2 : 1 }; });
  const weighted = people.flatMap(p => Array(p.weight).fill(p));
  const out: Order[] = [];
  let no = 1001;
  const start = new Date(today); start.setDate(start.getDate() - 91);
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    // more orders on Fri/Sat and a busier run-up to the holidays
    const dow = d.getDay(), weekend = dow === 5 || dow === 6;
    const lambda = (weekend ? 1.1 : 0.35) * (1 + Math.max(0, (d.getTime() - start.getTime()) / (today.getTime() - start.getTime())) * 0.6);
    let count = 0; for (let k = 0; k < 4; k++) if (rand() < lambda / 4) count++;
    for (let c = 0; c < count; c++) {
      const who = pick(weighted);
      const lines = 1 + (rand() < 0.3 ? 1 : 0);
      const items: OrderItem[] = [];
      for (let l = 0; l < lines; l++) {
        const p = pick(menu);
        if (items.some(i => i.productId === p.productId)) continue;
        const qty = rand() < 0.8 ? 1 : 2;
        if (p.kind === 'mixed') {
          const step = p.step ?? 1, opts = [...(p.options ?? [])].sort(() => rand() - 0.5);
          let left = p.pieces; const mix: { recipeId: string; recipeTitle: string; count: number; dough?: boolean }[] = [];
          for (let i = 0; left > 0; i = (i + 1) % opts.length) { const o = opts[i]; const add = Math.min(left, step * (1 + Math.floor(rand() * 2))); const ex = mix.find(m => m.recipeId === o.recipeId); if (ex) ex.count += add; else mix.push({ recipeId: o.recipeId, recipeTitle: o.recipeTitle, count: add, ...(o.dough === false ? { dough: false } : {}) }); left -= add; }
          items.push({ productId: p.productId, name: p.name, recipeId: 'mixed', recipeTitle: p.name, pieces: p.pieces, qty, unitPrice: p.price, mix });
        } else items.push({ productId: p.productId, name: p.name, recipeId: p.recipeId, recipeTitle: p.recipeTitle, pieces: p.pieces, qty, unitPrice: p.price, dough: p.dough !== false });
      }
      const sub = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      const discount = rand() < 0.08 ? Math.min(5, sub) : 0;
      const total = Math.round((sub - discount) * 100) / 100;
      const created = new Date(d); created.setHours(9 + Math.floor(rand() * 11), Math.floor(rand() * 60));
      const pickupDay = new Date(created); pickupDay.setDate(pickupDay.getDate() + 2 + Math.floor(rand() * 4));
      const daysAgo = (today.getTime() - pickupDay.getTime()) / 864e5;
      const cancelled = rand() < 0.04;
      const status: Order['status'] = cancelled ? 'cancelled' : daysAgo > 0 ? 'completed' : daysAgo > -2 ? 'ready' : 'confirmed';
      const paid = status === 'completed' ? (daysAgo > 10 ? rand() < 0.97 : rand() < 0.75) : rand() < 0.2;
      let cost = 0, complete = true;
      for (const i of items) for (const part of i.mix?.length ? i.mix.map(m => ({ id: m.recipeId, n: m.count * i.qty })) : [{ id: i.recipeId, n: i.pieces * i.qty }]) { const v = pp(part.id); if (v === null) complete = false; else cost += v * part.n; }
      const completedAt = status === 'completed' ? new Date(pickupDay.getFullYear(), pickupDay.getMonth(), pickupDay.getDate(), 16, 30).toISOString() : undefined;
      const ymd = `${pickupDay.getFullYear()}-${String(pickupDay.getMonth() + 1).padStart(2, '0')}-${String(pickupDay.getDate()).padStart(2, '0')}`;
      out.push({
        orderId: `demo-${no}`, orderNo: no++, source: rand() < 0.7 ? 'form' : 'manual', status, customer: { name: who.name, contact: who.email }, items, total,
        ...(discount ? { discount } : {}), pickupDate: ymd, ...(pickups.length ? { pickupGroup: pick(pickups) } : {}),
        createdAt: created.toISOString(), updatedAt: completedAt ?? created.toISOString(), ...(completedAt ? { completedAt } : {}),
        paid, ...(paid ? { paidMethod: pick(METHODS) } : {}),
        ...(status === 'completed' ? { costSnapshot: { total: complete ? Math.round(cost * 100) / 100 : null, complete } } : {}),
      } as Order);
    }
  }
  return out;
}
