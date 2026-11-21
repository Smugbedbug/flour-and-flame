// Test-bake log: what you did and how it turned out, so batches of an experimental recipe can be compared.
// Stored as ledger events (saved on this device, shared through the bakery sheet when connected, in backups).
import type { Recipe, RecipeStatus } from './types';

export const SCORE_KEYS = ['sweet', 'salt', 'texture', 'look', 'flavor', 'overall'] as const;
export type ScoreKey = typeof SCORE_KEYS[number];
export const SCORE_LABELS: Record<ScoreKey, string> = { sweet: 'Sweetness', salt: 'Saltiness', texture: 'Texture', look: 'Looks', flavor: 'Flavor', overall: 'Overall' };
/** What each score means, shown under the slider. Sweetness and saltiness are "just right" at 3. */
export const SCORE_HINTS: Record<ScoreKey, string> = { sweet: '1 not sweet · 3 just right · 5 too sweet', salt: '1 bland · 3 just right · 5 too salty', texture: '1 poor · 5 perfect', look: '1 poor · 5 perfect', flavor: '1 poor · 5 perfect', overall: '1 poor · 5 would sell it' };
export type Scores = Partial<Record<ScoreKey, number>>;

export const CHECK_WHEN = ['Bake day', 'Next day', 'Day 3', 'Day 5'] as const;
export type TasteCheck = { when: string; at: string; scores: Scores; notes?: string };

export type BakeLog = {
  id: string;
  recipeId: string;
  recipeTitle: string;
  recipeVersion: number;
  status: RecipeStatus;
  /** YYYY-MM-DD */
  date: string;
  /** batch size, 1 = as written */
  factor?: number;
  /** what this batch was testing ("dark brown sugar instead of light") */
  goal?: string;
  /** changes made to the recipe for this batch */
  changes?: string;
  ovenTempF?: number;
  convection?: boolean;
  /** minutes actually baked */
  bakeMinutes?: number;
  rack?: 'top' | 'middle' | 'bottom';
  /** pan, sheet or liners used */
  pan?: string;
  portionG?: number;
  /** minutes of hands-on work (mixing, scooping, frosting) for this batch */
  handsOnMinutes?: number;
  /** hours the dough/batter rested or chilled before baking */
  restHours?: number;
  fromFrozen?: boolean;
  doughTempF?: number;
  /** weather in the kitchen */
  kitchen?: 'dry' | 'normal' | 'humid' | 'hot';
  yieldCount?: number;
  yieldUnit?: string;
  /** spread / rise / doneness: how they came out of the oven */
  result?: string;
  checks: TasteCheck[];
  decision?: 'keep' | 'tweak' | 'revert' | 'approve';
  next?: string;
  notes?: string;
  /** production record this came from (Finish baking), if any */
  productionId?: string;
  createdAt: string;
  updatedAt: string;
};

export const DECISIONS: Record<NonNullable<BakeLog['decision']>, string> = { keep: 'Keep as is', tweak: 'Tweak and test again', revert: 'Go back to the last version', approve: 'Ready to approve' };
export const KITCHEN: Record<NonNullable<BakeLog['kitchen']>, string> = { dry: 'Dry', normal: 'Normal', humid: 'Humid', hot: 'Hot' };

export type BakeLogSave = { type: 'bakelog.save'; log: BakeLog };
export type BakeLogDelete = { type: 'bakelog.delete'; logId: string };

export function newBakeLog(r: Pick<Recipe, 'id' | 'title' | 'version' | 'status' | 'portionWeightG' | 'ovenTemp' | 'yieldAmount' | 'yieldUnit'>, today: string, extra: Partial<BakeLog> = {}): BakeLog {
  const now = new Date().toISOString();
  const temp = r.ovenTemp?.match(/(\d{3})\s*°?\s*F/i);
  return {
    id: crypto.randomUUID(), recipeId: r.id, recipeTitle: r.title, recipeVersion: r.version, status: r.status, date: today, factor: 1,
    ...(temp ? { ovenTempF: Number(temp[1]) } : {}), ...(r.portionWeightG ? { portionG: r.portionWeightG } : {}),
    yieldUnit: r.yieldUnit === 'pan' ? 'pieces' : r.yieldUnit, checks: [], createdAt: now, updatedAt: now, ...extra,
  };
}

/** Latest score for each key across a log's taste checks (bake day first, later checks override). */
export function latestScores(log: BakeLog): Scores {
  return log.checks.reduce<Scores>((s, c) => ({ ...s, ...Object.fromEntries(Object.entries(c.scores).filter(([, v]) => typeof v === 'number')) }), {});
}

/** Logs of one recipe, newest first; deleted ones removed. */
export function logsFor(all: BakeLog[], recipeId: string): BakeLog[] {
  return all.filter(l => l.recipeId === recipeId).sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
}

const fmtTemp = (l: BakeLog) => l.ovenTempF ? `${l.ovenTempF}°F${l.convection ? ' convection' : ''}` : '';
const fmtScores = (s: Scores) => SCORE_KEYS.filter(k => s[k]).map(k => `${SCORE_LABELS[k]} ${s[k]}`).join(', ');

/** Rows for the side-by-side comparison: label + one cell per log. */
export function compareRows(logs: BakeLog[]): { label: string; cells: string[]; differs: boolean }[] {
  const rows: [string, (l: BakeLog) => string][] = [
    ['Date', l => l.date], ['Version', l => `v${l.recipeVersion} (${l.status})`], ['Testing', l => l.goal ?? ''], ['Changes', l => l.changes ?? ''],
    ['Batch size', l => l.factor && l.factor !== 1 ? `${l.factor}×` : '1×'], ['Oven', fmtTemp], ['Bake time', l => l.bakeMinutes ? `${l.bakeMinutes} min` : ''],
    ['Rack', l => l.rack ?? ''], ['Pan', l => l.pan ?? ''], ['Hands-on', l => l.handsOnMinutes ? `${l.handsOnMinutes} min` : ''], ['Portion', l => l.portionG ? `${l.portionG} g` : ''], ['Rest / chill', l => l.restHours !== undefined ? `${l.restHours} h` : ''],
    ['From frozen', l => l.fromFrozen ? 'Yes' : ''], ['Dough temp', l => l.doughTempF ? `${l.doughTempF}°F` : ''], ['Kitchen', l => l.kitchen ? KITCHEN[l.kitchen] : ''],
    ['Yield', l => l.yieldCount ? `${l.yieldCount} ${l.yieldUnit ?? ''}`.trim() : ''], ['Out of the oven', l => l.result ?? ''],
    ...SCORE_KEYS.map(k => [SCORE_LABELS[k], (l: BakeLog) => { const s = l.checks.filter(c => c.scores[k]).map(c => `${c.scores[k]}${l.checks.length > 1 ? ` (${shortWhen(c.when)})` : ''}`); return s.join(' → '); }] as [string, (l: BakeLog) => string]),
    ['Decision', l => l.decision ? DECISIONS[l.decision] : ''], ['Next', l => l.next ?? ''], ['Notes', l => [l.notes, ...l.checks.filter(c => c.notes).map(c => `${shortWhen(c.when)}: ${c.notes}`)].filter(Boolean).join(' · ')],
  ];
  return rows.map(([label, f]) => { const cells = logs.map(f); return { label, cells, differs: new Set(cells.filter(Boolean)).size > 1 }; }).filter(r => r.cells.some(Boolean));
}
const shortWhen = (w: string) => w === 'Bake day' ? 'day 0' : w === 'Next day' ? 'day 1' : w.toLowerCase();

/** Plain-text summary to paste into the Head Baker chat. */
export function headBakerText(recipe: Pick<Recipe, 'title' | 'version' | 'status'>, logs: BakeLog[]): string {
  const lines = [`Test bake results for "${recipe.title}" (current version ${recipe.version}, ${recipe.status}). Oldest first.`, ''];
  [...logs].reverse().forEach((l, i) => {
    lines.push(`Bake ${i + 1}: ${l.date}, recipe v${l.recipeVersion}${l.factor && l.factor !== 1 ? `, ${l.factor}× batch` : ''}`);
    const facts = [
      l.goal && `Testing: ${l.goal}`, l.changes && `Changes: ${l.changes}`,
      [fmtTemp(l), l.bakeMinutes && `${l.bakeMinutes} min`, l.rack && `${l.rack} rack`, l.pan].filter(Boolean).join(', ') && `Bake: ${[fmtTemp(l), l.bakeMinutes && `${l.bakeMinutes} min`, l.rack && `${l.rack} rack`, l.pan].filter(Boolean).join(', ')}`,
      [l.handsOnMinutes && `${l.handsOnMinutes} min hands-on`, l.portionG && `${l.portionG} g portions`, l.restHours !== undefined && `rested ${l.restHours} h`, l.fromFrozen && 'baked from frozen', l.doughTempF && `dough ${l.doughTempF}°F`, l.kitchen && `${KITCHEN[l.kitchen].toLowerCase()} kitchen`].filter(Boolean).join(', ') && `Prep: ${[l.handsOnMinutes && `${l.handsOnMinutes} min hands-on`, l.portionG && `${l.portionG} g portions`, l.restHours !== undefined && `rested ${l.restHours} h`, l.fromFrozen && 'baked from frozen', l.doughTempF && `dough ${l.doughTempF}°F`, l.kitchen && `${KITCHEN[l.kitchen].toLowerCase()} kitchen`].filter(Boolean).join(', ')}`,
      l.yieldCount && `Yield: ${l.yieldCount} ${l.yieldUnit ?? ''}`.trim(), l.result && `Out of the oven: ${l.result}`,
      ...l.checks.map(c => `Scores ${c.when.toLowerCase()} (1-5; sweet/salt 3 = just right): ${fmtScores(c.scores) || 'none'}${c.notes ? `. Notes: ${c.notes}` : ''}`),
      l.decision && `My call: ${DECISIONS[l.decision]}`, l.next && `Next idea: ${l.next}`, l.notes && `Notes: ${l.notes}`,
    ].filter(Boolean) as string[];
    facts.forEach(f => lines.push('- ' + f));
    lines.push('');
  });
  lines.push('Please compare these bakes, explain what changed the results, and recommend the next single change to test.');
  return lines.join('\n');
}

/** Basic shape check for events coming from the sheet or a backup. */
export const validBakeLog = (l: any): l is BakeLog => !!l && typeof l.id === 'string' && typeof l.recipeId === 'string' && typeof l.date === 'string' && Array.isArray(l.checks);
