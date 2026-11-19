// PC → phone updates ("hub"). The PC publishes an ENCRYPTED copy of recipes, prices and packaging costs
// to a secret GitHub gist in the user's own account; the phone downloads, decrypts and merges it.
// Without the passphrase, the gist's contents are unreadable (AES-GCM 256, key from PBKDF2-SHA256).
import { applyHubChanges, getMeta, readData } from './db';
import { canonicalName } from './costing';
import { sameRecipeContent } from './recipeCompare';
import type { CatalogIngredient, Recipe } from './types';
import { getSheetConfig, scheduleSync, setSheetConfig } from './ledger';

export const HUB_FILE = 'flour-and-flame-hub.json';
const API = 'https://api.github.com';
const PBKDF2_ITERATIONS = 310_000;

// ---------------- device-local settings (never in backups) ----------------
export type HubRole = 'hub' | 'receiver';
export type Baseline = Record<string, { hub: number; hubDeleted: boolean; local: number }>;
export type HubConfig = {
  role?: HubRole;
  gistId?: string;
  lastPublishedAt?: string;
  lastPublishedHash?: string;
  lastReceivedAt?: string;
  /** gist updated_at of the last update applied on this device */
  lastSeenUpdatedAt?: string;
  baseline?: Baseline;
};
const CFG = 'ff-hub', TOKEN = 'ff-hub-token', PASS = 'ff-hub-pass';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* unavailable */ } },
};
export function getHubConfig(): HubConfig { try { return JSON.parse(ls.get(CFG) || '{}'); } catch { return {}; } }
export function setHubConfig(patch: Partial<HubConfig>): HubConfig {
  const next = { ...getHubConfig(), ...patch };
  ls.set(CFG, JSON.stringify(next));
  window.dispatchEvent(new Event('ff-hub'));
  return next;
}
export function clearHub() { ls.set(CFG, null); ls.set(TOKEN, null); ls.set(PASS, null); window.dispatchEvent(new Event('ff-hub')); }
export const getToken = () => ls.get(TOKEN) || '';
export const setToken = (t: string) => ls.set(TOKEN, t.trim() || null);
export const getPass = () => ls.get(PASS) || '';
export const setPass = (p: string) => ls.set(PASS, p || null);

// ---------------- encryption ----------------
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(pass: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export type Envelope = { format: 'flour-and-flame-hub'; v: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string; data: string };

export async function encryptJson(value: unknown, pass: string): Promise<Envelope> {
  if (pass.length < 6) throw Error('Use a passphrase of at least 6 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt, PBKDF2_ITERATIONS);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value))));
  return { format: 'flour-and-flame-hub', v: 1, kdf: 'PBKDF2-SHA256', iterations: PBKDF2_ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(ct) };
}
export async function decryptJson<T>(env: Envelope, pass: string): Promise<T> {
  if (!env || env.format !== 'flour-and-flame-hub' || env.v !== 1) throw Error('This isn’t a Flour and Flame update.');
  const key = await deriveKey(pass, unb64(env.salt), env.iterations);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
    return JSON.parse(new TextDecoder().decode(pt)) as T;
  } catch { throw Error('Wrong passphrase. Use the same passphrase you set on your PC.'); }
}

// ---------------- the update package ----------------
export type HubPackage = {
  format: 'flour-and-flame-hub-data';
  version: 1;
  publishedAt: string;
  recipes: Recipe[];
  catalog: CatalogIngredient[];
  packaging: Record<string, number>;
  /** shared bakery sheet settings, so the phone connects automatically */
  sheet?: { url: string; key: string };
};

export async function buildHubPackage(): Promise<HubPackage> {
  const d = await readData();
  const sc = getSheetConfig();
  return { format: 'flour-and-flame-hub-data', version: 1, publishedAt: new Date().toISOString(), recipes: d.recipes, catalog: d.catalog, packaging: (await getMeta<Record<string, number>>('packagingCosts')) ?? {}, ...(sc.url && sc.key ? { sheet: { url: sc.url, key: sc.key } } : {}) };
}

/** Fingerprint of the package content (ignores publish time) to know whether there are unsent changes. */
export async function packageHash(p: HubPackage): Promise<string> {
  const text = JSON.stringify({ ...p, publishedAt: '' });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return b64(new Uint8Array(digest)).slice(0, 24);
}

// ---------------- merge plan (pure, testable) ----------------
export type PlanAction = 'add' | 'update' | 'same' | 'keep-local' | 'conflict';
export type PlanItem = { id: string; title: string; action: PlanAction; hub: Recipe; local?: Recipe; setDeleted?: boolean };
export type HubPlan = { items: PlanItem[]; conflicts: PlanItem[]; changes: number; catalogChanges: number };

/**
 * Decide what to do with each recipe from the PC:
 *  - new on the phone → add
 *  - identical → nothing
 *  - PC changed it and the phone didn't (since the last update) → update (phone's copy stays in History)
 *  - phone changed it and the PC didn't → keep the phone's version
 *  - both changed → conflict: you choose; nothing is lost either way
 * First update ever (no baseline): the PC's version is applied; the phone's copy stays in History.
 */
export function computeHubPlan(local: Recipe[], hub: Recipe[], baseline: Baseline = {}, localCatalog: CatalogIngredient[] = [], hubCatalog: CatalogIngredient[] = []): HubPlan {
  const items: PlanItem[] = hub.map(h => {
    const l = local.find(x => x.id === h.id), b = baseline[h.id];
    const hubDeleted = !!h.deletedAt;
    let setDeleted: boolean | undefined;
    if (l && hubDeleted !== !!l.deletedAt && (!b || hubDeleted !== b.hubDeleted)) setDeleted = hubDeleted;
    if (!l) return { id: h.id, title: h.title, action: 'add', hub: h, setDeleted: hubDeleted || undefined };
    if (sameRecipeContent(l, h)) return { id: h.id, title: h.title, action: 'same', hub: h, local: l, setDeleted };
    const phoneChanged = b ? l.version !== b.local : false;
    const hubChanged = b ? h.version !== b.hub : true;
    const action: PlanAction = !hubChanged ? 'keep-local' : phoneChanged ? 'conflict' : 'update';
    return { id: h.id, title: h.title, action, hub: h, local: l, setDeleted };
  });
  const catalogChanges = hubCatalog.filter(c => { const m = localCatalog.find(x => x.id === c.id); return !m || JSON.stringify(m) !== JSON.stringify(c); }).length;
  const conflicts = items.filter(i => i.action === 'conflict');
  const changes = items.filter(i => i.action === 'add' || i.action === 'update' || i.setDeleted !== undefined).length;
  return { items, conflicts, changes, catalogChanges };
}

/** Apply a plan. `choices` resolves conflicts: 'pc' (use PC version; phone's stays in History) or 'phone' (keep). */
export async function applyHubPlan(pkg: HubPackage, plan: HubPlan, choices: Record<string, 'pc' | 'phone'>, baseline: Baseline): Promise<{ baseline: Baseline; summary: string }> {
  const d = await readData();
  // Catalog: PC entries win by id. A phone-only entry with the same name as a PC entry is merged into it (no duplicates).
  const hubIds = new Set(pkg.catalog.map(c => c.id));
  const mergeLocal = d.catalog.filter(c => !hubIds.has(c.id) && !c.mergedInto).flatMap(c => {
    const twin = pkg.catalog.find(h => !h.mergedInto && canonicalName(h.name) === canonicalName(c.name));
    return twin ? [{ fromId: c.id, intoId: twin.id }] : [];
  });
  const toSave = plan.items.filter(i => i.action === 'add' || i.action === 'update' || (i.action === 'conflict' && choices[i.id] === 'pc'));
  const unresolved = plan.conflicts.filter(c => !choices[c.id]);
  if (unresolved.length) throw Error(`Choose which version to keep for: ${unresolved.map(u => u.title).join(', ')}.`);
  const versions = await applyHubChanges({
    catalog: pkg.catalog,
    mergeLocal,
    recipes: toSave.map(i => ({ recipe: i.hub, expectedVersion: i.local ? i.local.version : null })),
    deletedFlags: plan.items.filter(i => i.setDeleted !== undefined).map(i => ({ id: i.id, deleted: i.setDeleted! })),
    packaging: pkg.packaging,
  });
  const next: Baseline = { ...baseline };
  for (const i of plan.items) next[i.id] = { hub: i.hub.version, hubDeleted: !!i.hub.deletedAt, local: versions[i.id] ?? i.local?.version ?? 0 };
  const added = toSave.filter(i => i.action === 'add').length, updated = toSave.length - added;
  const parts = [added && `${added} new recipe${added > 1 ? 's' : ''}`, updated && `${updated} updated`, plan.catalogChanges && 'prices updated'].filter(Boolean);
  return { baseline: next, summary: parts.length ? parts.join(', ') : 'everything already up to date' };
}

// ---------------- GitHub (secret gist in the user's account) ----------------
type GistFile = { content?: string; truncated?: boolean; raw_url?: string };
type Gist = { id: string; updated_at: string; html_url: string; files: Record<string, GistFile> };

async function gh(path: string, init: RequestInit = {}, token?: string): Promise<Gist> {
  let res: Response;
  try {
    res = await fetch(API + path, { ...init, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch { throw Error('Can’t reach GitHub. Check the internet connection and try again.'); }
  if (res.status === 401) throw Error('GitHub didn’t accept the token. Create a new one (Gists: read and write) and paste it again.');
  if (res.status === 403) throw Error('GitHub refused the request (token permission or rate limit). Make sure the token has Gists: read and write, or try again later.');
  if (res.status === 404) throw Object.assign(Error('The update link wasn’t found on GitHub. On the PC, send a new update and re-link the phone.'), { notFound: true });
  if (!res.ok) throw Error(`GitHub error ${res.status}. Try again in a minute.`);
  return res.json();
}

export async function publishToGist(token: string, gistId: string | undefined, text: string): Promise<Gist> {
  if (!token) throw Error('Paste your GitHub token first.');
  if (text.length > 950_000) throw Error('The update is too large to send (over ~1 MB).');
  const body = JSON.stringify({ description: 'Flour and Flame Bakery: encrypted PC → phone update (unreadable without your passphrase)', ...(gistId ? {} : { public: false }), files: { [HUB_FILE]: { content: text } } });
  if (gistId) {
    try { return await gh(`/gists/${gistId}`, { method: 'PATCH', body }, token); }
    catch (e: any) { if (!e?.notFound) throw e; }
  }
  return gh('/gists', { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), public: false }) }, token);
}

export async function fetchFromGist(gistId: string, token?: string): Promise<{ updatedAt: string; text: string }> {
  const g = await gh(`/gists/${encodeURIComponent(gistId)}`, {}, token || undefined);
  const f = g.files?.[HUB_FILE];
  if (!f) throw Error('That link doesn’t contain a Flour and Flame update.');
  let text = f.content ?? '';
  if (f.truncated && f.raw_url) { const r = await fetch(f.raw_url, { cache: 'no-store' }); if (!r.ok) throw Error('Couldn’t download the full update.'); text = await r.text(); }
  return { updatedAt: g.updated_at, text };
}

/** Extract a gist id from a pairing link, gist URL or bare id. */
export function parseGistId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/(?:#\/pair\/|gist\.github\.com\/(?:[^/]+\/)?)([0-9a-f]{20,40})/i) ?? s.match(/^([0-9a-f]{20,40})$/i);
  return m ? m[1].toLowerCase() : null;
}
export const pairingLink = (gistId: string) => `${location.origin}${location.pathname}#/pair/${gistId}`;

// ---------------- high-level actions ----------------
export async function sendUpdate(): Promise<{ gistId: string; at: string }> {
  const cfg = getHubConfig(), pass = getPass(), token = getToken();
  if (!pass) throw Error('Set a passphrase first.');
  const pkg = await buildHubPackage();
  const env = await encryptJson(pkg, pass);
  const g = await publishToGist(token, cfg.gistId, JSON.stringify(env));
  setHubConfig({ role: 'hub', gistId: g.id, lastPublishedAt: pkg.publishedAt, lastPublishedHash: await packageHash(pkg) });
  return { gistId: g.id, at: pkg.publishedAt };
}

export type CheckResult =
  | { status: 'no-change' }
  | { status: 'applied'; summary: string }
  | { status: 'needs-choice'; pkg: HubPackage; plan: HubPlan; updatedAt: string };

/** Phone: download the latest update; apply automatically unless a recipe was changed on both devices. */
export async function checkForUpdate(force = false): Promise<CheckResult> {
  const cfg = getHubConfig(), pass = getPass();
  if (cfg.role !== 'receiver' || !cfg.gistId || !pass) throw Error('This device isn’t linked to your PC yet.');
  const { updatedAt, text } = await fetchFromGist(cfg.gistId);
  if (!force && updatedAt === cfg.lastSeenUpdatedAt) return { status: 'no-change' };
  let env: Envelope;
  try { env = JSON.parse(text); } catch { throw Error('The update on GitHub is damaged. Send it again from the PC.'); }
  const pkg = await decryptJson<HubPackage>(env, pass);
  if (pkg.format !== 'flour-and-flame-hub-data') throw Error('Unknown update format. Update the app on both devices.');
  if (pkg.sheet) { const sc = getSheetConfig(); if (sc.url !== pkg.sheet.url || sc.key !== pkg.sheet.key) { setSheetConfig({ url: pkg.sheet.url, key: pkg.sheet.key, lastSeq: 0, lastError: undefined }); scheduleSync(50); } }
  const d = await readData();
  const plan = computeHubPlan(d.recipes, pkg.recipes, cfg.baseline, d.catalog, pkg.catalog);
  if (plan.conflicts.length) return { status: 'needs-choice', pkg, plan, updatedAt };
  const r = await applyHubPlan(pkg, plan, {}, cfg.baseline ?? {});
  setHubConfig({ baseline: r.baseline, lastSeenUpdatedAt: updatedAt, lastReceivedAt: new Date().toISOString() });
  return { status: 'applied', summary: r.summary };
}

export async function finishWithChoices(pkg: HubPackage, plan: HubPlan, updatedAt: string, choices: Record<string, 'pc' | 'phone'>): Promise<string> {
  const cfg = getHubConfig();
  const r = await applyHubPlan(pkg, plan, choices, cfg.baseline ?? {});
  setHubConfig({ baseline: r.baseline, lastSeenUpdatedAt: updatedAt, lastReceivedAt: new Date().toISOString() });
  return r.summary;
}
