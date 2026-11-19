import { beforeEach, describe, expect, test, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { checkForUpdate, computeHubPlan, decryptJson, encryptJson, finishWithChoices, getHubConfig, parseGistId, sendUpdate, setHubConfig, setPass, setToken, HUB_FILE } from '../src/hub';
import { init, readData, revisionsFor, setRecipeDeleted, writeCatalog, writeRecipe } from '../src/db';
import { testRecipes } from './fixtures';
import type { Recipe } from '../src/types';

// ---- simulated GitHub gist storage ----
let gists: Record<string, { updated_at: string; content: string }> = {};
let clock = Date.parse('2026-11-18T12:00:00Z');
function mockGitHub() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const out = (id: string) => ({ id, updated_at: gists[id].updated_at, html_url: 'https://gist.github.com/' + id, files: { [HUB_FILE]: { content: gists[id].content, truncated: false } } });
    if (u.pathname === '/gists' && init.method === 'POST') {
      if (auth !== 'Bearer good-token') return json(401, {});
      const id = 'a'.repeat(31) + Object.keys(gists).length;
      gists[id] = { updated_at: new Date((clock += 60000)).toISOString(), content: JSON.parse(String(init.body)).files[HUB_FILE].content };
      return json(201, out(id));
    }
    const m = u.pathname.match(/^\/gists\/(\w+)$/);
    if (m && init.method === 'PATCH') {
      if (auth !== 'Bearer good-token') return json(401, {});
      if (!gists[m[1]]) return json(404, {});
      gists[m[1]] = { updated_at: new Date((clock += 60000)).toISOString(), content: JSON.parse(String(init.body)).files[HUB_FILE].content };
      return json(200, out(m[1]));
    }
    if (m) return gists[m[1]] ? json(200, out(m[1])) : json(404, {});
    return json(404, {});
  }));
}

// ---- two devices in one test: swap database + local settings ----
type Device = { db: IDBFactory; storage: Record<string, string> };
const pc: Device = { db: new IDBFactory(), storage: {} }, phone: Device = { db: new IDBFactory(), storage: {} };
let current: Device | null = null;
function use(d: Device) {
  if (current) { current.storage = { ...localStorage }; }
  localStorage.clear(); for (const [k, v] of Object.entries(d.storage)) localStorage.setItem(k, v);
  (globalThis as any).indexedDB = d.db; current = d;
}
beforeEach(() => {
  gists = {}; mockGitHub(); current = null; localStorage.clear();
  pc.db = new IDBFactory(); pc.storage = {}; phone.db = new IDBFactory(); phone.storage = {};
});
const recipe = (id: string) => async () => (await readData()).recipes.find(r => r.id === id)!;

describe('encryption', () => {
  test('round trip, and a wrong passphrase is rejected', async () => {
    const env = await encryptJson({ hello: 'brown butter' }, 'correct horse');
    expect(env.data).not.toContain('brown');
    expect(await decryptJson(env, 'correct horse')).toEqual({ hello: 'brown butter' });
    await expect(decryptJson(env, 'wrong pass')).rejects.toThrow(/Wrong passphrase/);
    await expect(encryptJson({}, '123')).rejects.toThrow(/at least 6/);
  });
  test('pairing links and gist URLs are understood', () => {
    const id = '0123456789abcdef0123456789abcdef';
    expect(parseGistId(`https://smugbedbug.github.io/flour-and-flame/#/pair/${id}`)).toBe(id);
    expect(parseGistId(`https://gist.github.com/Smugbedbug/${id}`)).toBe(id);
    expect(parseGistId(id)).toBe(id);
    expect(parseGistId('hello')).toBeNull();
  });
});

describe('merge rules', () => {
  const base = testRecipes[0];
  const v = (r: Recipe, version: number, notes?: string): Recipe => ({ ...r, version, notes });
  test('new → add; identical → same; first update with differences → update (phone copy kept in history)', () => {
    const p = computeHubPlan([v(base, 1)], [v(base, 1), testRecipes[1]]);
    expect(p.items.map(i => i.action)).toEqual(['same', 'add']);
    expect(computeHubPlan([v(base, 1)], [v(base, 2, 'pc edit')]).items[0].action).toBe('update');
  });
  test('only the PC changed → update; only the phone changed → keep phone; both → conflict', () => {
    const bl = { [base.id]: { hub: 2, hubDeleted: false, local: 3 } };
    expect(computeHubPlan([v(base, 3, 'x')], [v(base, 4, 'pc')], bl).items[0].action).toBe('update');
    expect(computeHubPlan([v(base, 4, 'phone')], [v(base, 2, 'x')], bl).items[0].action).toBe('keep-local');
    const c = computeHubPlan([v(base, 4, 'phone')], [v(base, 5, 'pc')], bl);
    expect(c.items[0].action).toBe('conflict'); expect(c.conflicts).toHaveLength(1);
  });
  test('deleting on the PC moves the recipe to Recently deleted on the phone', () => {
    const p = computeHubPlan([v(base, 1)], [{ ...v(base, 1), deletedAt: '2026-11-18' }], { [base.id]: { hub: 1, hubDeleted: false, local: 1 } });
    expect(p.items[0].setDeleted).toBe(true);
  });
});

describe('PC → phone end to end (GitHub simulated)', () => {
  test('send from PC, phone links and receives; later changes flow; conflicts ask; nothing is lost', async () => {
    // PC: hub with prices
    use(pc); await init();
    await writeCatalog({ id: 'cat-unsalted-butter', name: 'Unsalted butter', packageAmount: 4, packageUnit: 'stick', price: 5 });
    setToken('good-token'); setPass('kitchen-secret'); setHubConfig({ role: 'hub' });
    const sent = await sendUpdate();
    expect(gists[sent.gistId].content).not.toContain('Brown Butter'); // encrypted at rest
    // Phone: fresh install, link and receive
    use(phone); await init(); // starts with the same test recipes (seeded)
    setHubConfig({ role: 'receiver', gistId: sent.gistId }); setPass('kitchen-secret');
    let r = await checkForUpdate();
    expect(r.status).toBe('applied');
    expect((await readData()).catalog.find(c => c.id === 'cat-unsalted-butter')!.price).toBe(5);
    expect((await checkForUpdate()).status).toBe('no-change');

    // PC edits a recipe and sends → phone updates, keeping its old version in history
    use(pc); const c1 = await recipe('test-cookie')(); await writeRecipe({ ...c1, notes: 'PC tweak' }, c1.version); await sendUpdate();
    use(phone); r = await checkForUpdate();
    expect(r).toMatchObject({ status: 'applied' });
    const ph = await recipe('test-cookie')();
    expect(ph.notes).toBe('PC tweak'); expect((await revisionsFor('test-cookie')).length).toBe(2);

    // Phone edits; PC edits the same recipe; PC sends → conflict, phone chooses
    const p1 = await recipe('test-cookie')(); await writeRecipe({ ...p1, notes: 'Phone tweak' }, p1.version);
    use(pc); const c2 = await recipe('test-cookie')(); await writeRecipe({ ...c2, notes: 'PC tweak 2' }, c2.version); await sendUpdate();
    use(phone); r = await checkForUpdate();
    expect(r.status).toBe('needs-choice');
    if (r.status !== 'needs-choice') return;
    expect(r.plan.conflicts.map(c => c.title)).toEqual(['Test Brown Butter Cookie']);
    expect((await recipe('test-cookie')()).notes).toBe('Phone tweak'); // nothing applied yet
    await finishWithChoices(r.pkg, r.plan, r.updatedAt, { 'test-cookie': 'pc' });
    const after = await recipe('test-cookie')();
    expect(after.notes).toBe('PC tweak 2');
    const hist = (await revisionsFor('test-cookie')).map(h => h.snapshot.notes);
    expect(hist).toContain('Phone tweak'); // phone's edit preserved in History

    // PC deletes a recipe → phone moves it to Recently deleted
    use(pc); await setRecipeDeleted('test-bar', true); await sendUpdate();
    use(phone); await checkForUpdate();
    expect((await recipe('test-bar')()).deletedAt).toBeTruthy();
    expect(getHubConfig().lastReceivedAt).toBeTruthy();
  });

  test('bad token and wrong passphrase give clear messages', async () => {
    use(pc); await init(); setToken('nope'); setPass('kitchen-secret'); setHubConfig({ role: 'hub' });
    await expect(sendUpdate()).rejects.toThrow(/token/);
    setToken('good-token'); const s = await sendUpdate();
    use(phone); await init(); setHubConfig({ role: 'receiver', gistId: s.gistId }); setPass('different-pass');
    await expect(checkForUpdate()).rejects.toThrow(/Wrong passphrase/);
  });
});
