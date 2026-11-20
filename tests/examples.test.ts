import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { recipeProblems } from '../src/types';

// The example files are what the recipe GPT copies; they must always import cleanly.
describe('example recipe files', () => {
  for (const f of readdirSync('examples').filter(n => n.endsWith('.json'))) {
    test(f, () => {
      const data = JSON.parse(readFileSync(`examples/${f}`, 'utf8'));
      for (const r of Array.isArray(data) ? data : [data]) expect(recipeProblems(r)).toEqual([]);
    });
  }
});

describe('examples inside the recipe GPT knowledge file', () => {
  const md = readFileSync('docs/gpt/1-flour-and-flame-app.md', 'utf8');
  const blocks = [...md.matchAll(/```json\n([\s\S]*?)```/g)].map(m => m[1]);
  test('has examples, and every one imports cleanly', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks) expect(recipeProblems(JSON.parse(b))).toEqual([]);
  });
});
