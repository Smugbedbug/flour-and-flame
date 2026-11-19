import { describe, expect, test } from 'vitest';
import { computeBakery } from '../src/bakery';
import { bakeTime, planBakeDay, DEFAULT_SETTINGS } from '../src/bakeDay';

let n = 0;
const ev = (e: any) => ({ eventId: 'e' + ++n, at: `2026-11-19T10:00:${String(n % 60).padStart(2, '0')}Z`, device: 'd', seq: n, ...e });
const recipe = (id: string, title: string, category: string, steps: string[], extra: any = {}) => ({ id, schemaVersion: 1, version: 1, title, category, status: 'Approved', yieldAmount: 24, yieldUnit: 'cookies', ingredients: [], steps, updatedAt: 'x', ...extra }) as any;
const cocoa = recipe('cocoa', 'Cocoa Cookies', 'Cookies', ['Preheat the oven to 350°F.', 'Scoop and bake 11–13 minutes until set.'], { ovenTemp: '350°F' });
const van = recipe('van', 'Vanilla Cookies', 'Cookies', ['Mix.', 'Chill 30 minutes.', 'Bake until golden.']);
const brownie = recipe('b', 'Fudge Brownies', 'Brownies', ['Bake for 25 to 30 minutes.'], { yieldAmount: 1, yieldUnit: 'pan', piecesPerPan: 16 });
const item = (recipeId: string, title: string, pieces: number, qty: number, dough = true) => ({ productId: recipeId + pieces, name: title, recipeId, recipeTitle: title, pieces, qty, unitPrice: 10, dough });

describe('bake-day planner', () => {
  test('bake times come from the recipe (longer end used for the clock); none is invented', () => {
    expect(bakeTime(cocoa)).toEqual({ minutes: 11, max: 13, from: 'recipe' });
    expect(bakeTime(van)).toBeNull(); // "Chill 30 minutes" is not a bake time
    expect(bakeTime(van, { van: 9 })).toEqual({ minutes: 9, max: 9, from: 'you' });
  });
  test('freezer pulls, dough to mix, trays, pans first, and a timeline', () => {
    const events = [
      ev({ type: 'freezer.add', batchId: 'F1', recipeId: 'cocoa', recipeTitle: 'Cocoa Cookies', count: 20, frozenOn: '2026-11-10' }),
      ev({ type: 'order.create', orderId: 'a', source: 'form', status: 'confirmed', customer: { name: 'Sue' }, items: [item('cocoa', 'Cocoa Cookies', 12, 2)], pickupDate: '2026-11-21', pickupGroup: 'Work', total: 56 }),
      ev({ type: 'order.create', orderId: 'b', source: 'form', status: 'confirmed', customer: { name: 'Joe' }, items: [item('b', 'Fudge Brownies', 4, 5, false), item('van', 'Vanilla Cookies', 6, 1)], pickupDate: '2026-11-21', total: 60 }),
      ev({ type: 'order.create', orderId: 'c', source: 'form', status: 'confirmed', customer: { name: 'Late' }, items: [item('cocoa', 'Cocoa Cookies', 6, 1)], pickupDate: '2026-11-25', total: 15 }),
    ];
    const b = computeBakery(events);
    const p = planBakeDay(b, [cocoa, van, brownie], [], '2026-11-21', { ...DEFAULT_SETTINGS, start: '09:00', perTray: 12, traysAtOnce: 2 });
    expect(p.orders.map(o => o.orderId)).toEqual(['a', 'b']);
    const by = Object.fromEntries(p.items.map(i => [i.recipeId, i]));
    expect(by.cocoa).toMatchObject({ pieces: 24, fromFreezer: 20, mixMore: 4, trays: 2 });
    expect(by.van).toMatchObject({ pieces: 6, fromFreezer: 0, mixMore: 6, trays: 1 });
    expect(by.b).toMatchObject({ kind: 'pan', pieces: 20, pans: 2 });
    expect(p.blocks.map(x => x.recipeId)).toEqual(['b', 'cocoa', 'van']);  // pans first
    expect(p.blocks[0]).toMatchObject({ start: 540, end: 570 });           // 9:00 + 30 min
    expect(p.blocks[1]).toMatchObject({ start: 570, end: 583, rounds: 1, label: '2 trays' }); // 2 trays at once → 1 round of 13 min
    expect(p.blocks[2].end).toBeNull();                                     // vanilla has no bake time
    expect(p.unknownTimes).toEqual(['Vanilla Cookies']);
    expect(planBakeDay(b, [cocoa, van, brownie], [], '2026-11-26', DEFAULT_SETTINGS).overdue.map(o => o.orderId)).toEqual(['a', 'b', 'c']);
  });
});
