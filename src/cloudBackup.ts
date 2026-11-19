// Automatic backup: once a week (and on demand) the PC saves an encrypted copy of everything
// (recipes, prices, freezer & order history, photos when they fit) to a separate secret gist in your GitHub.
// Same passphrase as the PC → phone updates; GitHub can't read it.
import { useEffect } from 'react';
import { createBackup, recordBackupExported, restoreBackup, validateBackup } from './backup';
import { decryptJson, encryptJson, fetchFile, getHubConfig, getPass, getToken, publishFile, setHubConfig, type Envelope } from './hub';

export const BACKUP_FILE = 'flour-and-flame-backup.json';
const LIMIT = 900_000; // GitHub's API returns files up to ~1 MB in one piece
export const WEEK = 7 * 864e5;

export function cloudBackupReady(): boolean { const c = getHubConfig(); return c.role === 'hub' && !!getToken() && !!getPass(); }

export async function cloudBackupNow(): Promise<{ at: string; noPhotos: boolean }> {
  if (!cloudBackupReady()) throw Error('Set up “PC → phone updates” on this PC first (it provides the GitHub connection and passphrase).');
  const backup: any = await createBackup();
  let noPhotos = false;
  let env: Envelope = await encryptJson(backup, getPass());
  if (JSON.stringify(env).length > LIMIT && Array.isArray(backup.data?.photos) && backup.data.photos.length) {
    noPhotos = true;
    env = await encryptJson({ ...backup, data: { ...backup.data, photos: [] }, note: 'Photos left out of the automatic backup (too large).' }, getPass());
  }
  const text = JSON.stringify(env);
  if (text.length > LIMIT) throw Error('Your data is too large for the automatic backup. Use “Download a backup file” instead.');
  const g = await publishFile(getToken(), getHubConfig().backupGistId, BACKUP_FILE, text, 'Flour and Flame Bakery: encrypted automatic backup (unreadable without your passphrase)');
  const at = new Date().toISOString();
  setHubConfig({ backupGistId: g.id, lastCloudBackupAt: at, cloudBackupNoPhotos: noPhotos });
  await recordBackupExported();
  return { at, noPhotos };
}

export async function cloudBackupInfo(): Promise<{ updatedAt: string } | null> {
  const id = getHubConfig().backupGistId;
  if (!id) return null;
  const f = await fetchFile(id, BACKUP_FILE, getToken());
  return { updatedAt: f.updatedAt };
}

export async function restoreFromCloud(): Promise<Record<string, number>> {
  const id = getHubConfig().backupGistId;
  if (!id || !getPass()) throw Error('No automatic backup is linked on this device.');
  const f = await fetchFile(id, BACKUP_FILE, getToken());
  let plain: unknown;
  try { plain = await decryptJson(JSON.parse(f.text) as Envelope, getPass()); } catch { throw Error('The backup couldn’t be opened with this passphrase.'); }
  const check = validateBackup(JSON.stringify(plain));
  if (!check.ok) throw Error(check.problems.join(' '));
  await restoreBackup(check.backup);
  return check.summary;
}

/** On the PC: back up automatically when the last one is a week old (checked a little after opening the app). */
export function useAutoCloudBackup(ready: boolean, notify: (m: string, err?: boolean) => void, refresh: () => Promise<void> | void) {
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      if (!navigator.onLine || !cloudBackupReady()) return;
      const last = getHubConfig().lastCloudBackupAt;
      if (last && Date.now() - Date.parse(last) < WEEK) return;
      void cloudBackupNow().then(r => { notify(`☁️ Weekly backup saved to your GitHub${r.noPhotos ? ' (photos left out: too large)' : ''}.`); void refresh(); }).catch(() => { /* try again next time */ });
    }, 20000);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
