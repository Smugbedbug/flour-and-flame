import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS, estimateMake, hm, stepTimes, totalMake } from '../src/bakeDay';
import type { Recipe } from '../src/types';

const cookie: Recipe = { schemaVersion: 1, id: 'c', version: 1, title: 'Cookie', category: 'Cookies', status: 'Approved', yieldAmount: 24, yieldUnit: 'cookies', updatedAt: 'x', ingredients: [{ id: 'f', name: 'Flour', amount: 1, unit: 'g' }],
  steps: ['Brown the butter; cool 15 minutes.', 'Mix.', 'Chill 2 hours.', 'Bake at 350°F for 10–12 minutes.', 'Cool on the tray 5 minutes.'] };
const brownie: Recipe = { ...cookie, id: 'b', title: 'Brownie', category: 'Brownies', yieldAmount: 1, yieldUnit: 'pan', piecesPerPan: 16, steps: ['Mix.', 'Bake 25–30 minutes.', 'Cool 1 hour before cutting.'] };
const s = { ...DEFAULT_SETTINGS, perTray: 12, traysAtOnce: 2 };

describe('make list estimates', () => {
  test('waits are split around the bake step', () => {
    const t = stepTimes(cookie);
    expect(t.bake).toMatchObject({ minutes: 10, max: 12 });
    expect(t.waitsBeforeBake).toBe(135); expect(t.waitsAfterBake).toBe(5);
  });
  test('baking: rounds from trays; freezing dough: no oven, only waits before baking', () => {
    const bake = estimateMake(cookie, 2, 'bake', s); // 48 cookies → 4 trays → 2 rounds × 12 min
    expect(bake).toMatchObject({ items: 48, rounds: 2, ovenMin: 24, wait: 140, handsOn: null });
    const freeze = estimateMake(cookie, 2, 'freeze', s);
    expect(freeze).toMatchObject({ rounds: 0, ovenMin: 0, wait: 135 });
  });
  test('hands-on: your number beats the latest test bake; totals overlap waits', () => {
    const logs = [{ recipeId: 'c', handsOnMinutes: 30, date: '2026-11-01' }, { recipeId: 'c', handsOnMinutes: 25, date: '2026-11-10' }];
    expect(estimateMake(cookie, 1, 'bake', s, logs).handsOn).toEqual({ minutes: 25, from: 'test bakes' });
    expect(estimateMake(cookie, 1, 'bake', { ...s, handsOn: { c: 40 } }, logs).handsOn).toEqual({ minutes: 40, from: 'you' });
    const a = estimateMake(cookie, 1, 'freeze', s, logs), b = estimateMake(brownie, 2, 'bake', { ...s, handsOn: { b: 20 } });
    expect(b).toMatchObject({ rounds: 1, ovenMin: 30, wait: 60 });
    expect(totalMake([a, b])).toEqual({ handsOn: 45, oven: 30, longestWait: 135, total: 210, missingHandsOn: 0, missingOven: 0 });
    expect(hm(210)).toBe('3 h 30 min');
  });
});
