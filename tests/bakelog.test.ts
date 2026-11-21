import { describe, expect, test } from 'vitest';
import { compareRows, headBakerText, latestScores, logsFor, newBakeLog, type BakeLog } from '../src/bakeLog';
import { computeBakery } from '../src/bakery';

const recipe = { id: 'ff-cup', title: 'Salted Caramel Cupcake', version: 2, status: 'Experimental' as const, ovenTemp: '350°F', yieldAmount: 12, yieldUnit: 'cupcakes', portionWeightG: 60 };
let n = 0;
const ev = (e: any) => ({ eventId: 'e' + ++n, at: new Date(2026, 10, 20, 12, 0, n).toISOString(), device: 'pc', ...e });

describe('test bakes', () => {
  test('a new log starts from the recipe (oven temp, portion, unit)', () => {
    const l = newBakeLog(recipe, '2026-11-20');
    expect(l).toMatchObject({ recipeId: 'ff-cup', recipeVersion: 2, status: 'Experimental', ovenTempF: 350, portionG: 60, yieldUnit: 'cupcakes', factor: 1, checks: [] });
  });
  test('saves update in place, deletes stick, newest first', () => {
    const a = newBakeLog(recipe, '2026-11-18'), b = newBakeLog(recipe, '2026-11-20');
    const s = computeBakery([ev({ type: 'bakelog.save', log: a }), ev({ type: 'bakelog.save', log: b }), ev({ type: 'bakelog.save', log: { ...a, bakeMinutes: 19 } })] as any);
    expect(logsFor(s.bakeLogs, 'ff-cup').map(l => l.date)).toEqual(['2026-11-20', '2026-11-18']);
    expect(s.bakeLogs.find(l => l.id === a.id)!.bakeMinutes).toBe(19);
    const s2 = computeBakery([ev({ type: 'bakelog.save', log: a }), ev({ type: 'bakelog.delete', logId: a.id }), ev({ type: 'bakelog.save', log: a })] as any);
    expect(s2.bakeLogs).toEqual([]);
  });
  test('later taste checks override bake-day scores; comparison flags differences', () => {
    const a: BakeLog = { ...newBakeLog(recipe, '2026-11-18'), ovenTempF: 350, bakeMinutes: 20, checks: [{ when: 'Bake day', at: 'x', scores: { overall: 4, salt: 3 } }, { when: 'Next day', at: 'y', scores: { overall: 3 } }] };
    const b: BakeLog = { ...newBakeLog(recipe, '2026-11-20'), ovenTempF: 350, bakeMinutes: 18, goal: 'less bake time', checks: [{ when: 'Bake day', at: 'x', scores: { overall: 5 } }] };
    expect(latestScores(a)).toEqual({ overall: 3, salt: 3 });
    const rows = compareRows([a, b]);
    expect(rows.find(r => r.label === 'Bake time')).toMatchObject({ cells: ['20 min', '18 min'], differs: true });
    expect(rows.find(r => r.label === 'Oven')).toMatchObject({ differs: false });
    expect(rows.find(r => r.label === 'Overall')!.cells).toEqual(['4 (day 0) → 3 (day 1)', '5']);
    const text = headBakerText(recipe, [b, a]);
    expect(text).toMatch(/Bake 1: 2026-11-18/);
    expect(text).toMatch(/Bake 2: 2026-11-20[\s\S]*Testing: less bake time/);
    expect(text).toMatch(/Scores next day .*Overall 3/);
  });
});
