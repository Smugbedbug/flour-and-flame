// Complete local backup / restore. Independent of any future cloud sync.
import { dumpAll, replaceAll, setMeta, getMeta, DB_VERSION, STORES, type RawDump } from './db';
import { recipeProblems, validCatalogIngredient, type Recipe } from './types';
import { resetLedgerCursor } from './ledger';

export const BACKUP_FORMAT = 'flour-and-flame-backup';
/** v1 (app 0.3): no photos/production. v2 (app 0.4): adds photos + production. Older files still restore. */
export const BACKUP_VERSION = 2;
export const APP_VERSION = '0.16.2';

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  backupVersion: number;
  appVersion: string;
  dbVersion: number;
  createdAt: string;
  counts: Record<string, number>;
  data: RawDump;
};

export async function createBackup(): Promise<BackupFile> {
  const data = await dumpAll();
  // Device-specific bookkeeping is not carried between installs.
  data.meta = data.meta.filter((m: any) => m?.key !== 'lastBackupAt');
  const counts = Object.fromEntries(STORES.map(s => [s, data[s].length]));
  return { format: BACKUP_FORMAT, backupVersion: BACKUP_VERSION, appVersion: APP_VERSION, dbVersion: DB_VERSION, createdAt: new Date().toISOString(), counts, data };
}

export function backupFileName(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `flour-and-flame-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

export type BackupCheck = { ok: true; backup: BackupFile; summary: Record<string, number> } | { ok: false; problems: string[] };

/** Validate a backup BEFORE anything in the active database is touched. */
export function validateBackup(text: string): BackupCheck {
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return { ok: false, problems: ['This file is not valid JSON.'] }; }
  const problems: string[] = [];
  if (!parsed || parsed.format !== BACKUP_FORMAT) return { ok: false, problems: ['This is not a Flour and Flame backup file. (Recipe files are imported from the Import screen instead.)'] };
  if (typeof parsed.backupVersion !== 'number' || parsed.backupVersion > BACKUP_VERSION) problems.push(`Backup version ${parsed.backupVersion} is newer than this app understands (${BACKUP_VERSION}). Update the app first.`);
  const d = parsed.data;
  if (!d || typeof d !== 'object') return { ok: false, problems: [...problems, 'Backup has no data section.'] };
  for (const s of ['recipes', 'catalog', 'revisions', 'meta'] as const) if (!Array.isArray(d[s])) problems.push(`Backup is missing "${s}".`);
  for (const s of ['outbox', 'sessions', 'photos', 'production', 'ledger'] as const) if (d[s] !== undefined && !Array.isArray(d[s])) problems.push(`"${s}" must be a list.`);
  if (problems.length) return { ok: false, problems };

  (d.recipes as unknown[]).forEach((r, i) => { const p = recipeProblems(r); if (p.length) problems.push(`Recipe ${i + 1} (${(r as any)?.title ?? 'untitled'}): ${p[0]}`); });
  const ids = (d.recipes as Recipe[]).map(r => r.id);
  if (new Set(ids).size !== ids.length) problems.push('Two recipes share the same id.');
  (d.catalog as unknown[]).forEach((c, i) => { if (!validCatalogIngredient(c)) problems.push(`Ingredient catalog entry ${i + 1} is invalid.`); });
  (d.revisions as any[]).forEach((v, i) => {
    if (!v || typeof v.recipeId !== 'string' || !Number.isInteger(v.version) || recipeProblems(v.snapshot).length) problems.push(`Revision ${i + 1} is invalid.`);
  });
  (d.meta as any[]).forEach((m, i) => { if (!m || typeof m.key !== 'string') problems.push(`Setting ${i + 1} is invalid.`); });
  ((d.sessions ?? []) as any[]).forEach((s, i) => { if (!s || typeof s.recipeId !== 'string') problems.push(`Baking session ${i + 1} is invalid.`); });
  ((d.photos ?? []) as any[]).forEach((p, i) => { if (!p || typeof p.id !== 'string' || typeof p.recipeId !== 'string' || typeof p.dataUrl !== 'string' || !p.dataUrl.startsWith('data:image/')) problems.push(`Photo ${i + 1} is invalid.`); });
  ((d.production ?? []) as any[]).forEach((p, i) => { if (!p || typeof p.id !== 'string' || typeof p.recipeId !== 'string' || typeof p.actualQuantity !== 'number' || typeof p.date !== 'string') problems.push(`Production record ${i + 1} is invalid.`); });
  if (problems.length) return { ok: false, problems: problems.slice(0, 12) };

  ((d.ledger ?? []) as any[]).forEach((e, i) => { if (!e || typeof e.eventId !== 'string' || typeof e.type !== 'string') problems.push(`Freezer/order event ${i + 1} is invalid.`); });
  if (problems.length) return { ok: false, problems: problems.slice(0, 12) };
  const backup: BackupFile = { ...parsed, data: { outbox: [], sessions: [], photos: [], production: [], ledger: [], ...d } };
  return { ok: true, backup, summary: Object.fromEntries(STORES.map(s => [s, backup.data[s].length])) };
}

export async function restoreBackup(backup: BackupFile): Promise<void> {
  const keepLastBackup = await getMeta<string>('lastBackupAt');
  await replaceAll(backup.data);
  if (keepLastBackup) await setMeta('lastBackupAt', keepLastBackup);
  await setMeta('lastRestoreAt', new Date().toISOString());
  resetLedgerCursor();
}

export async function recordBackupExported(): Promise<string> {
  const at = new Date().toISOString();
  await setMeta('lastBackupAt', at);
  return at;
}

export const BACKUP_REMINDER_DAYS = 7;
export function backupIsDue(lastBackupAt: string | undefined, now = Date.now()): boolean {
  if (!lastBackupAt) return true;
  return now - Date.parse(lastBackupAt) > BACKUP_REMINDER_DAYS * 86400_000;
}

/** Trigger a browser download of text content. Works offline. */
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const blob = new Blob([text], { type }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
