import { Camera, ImagePlus, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../app-context';
import { addPhoto, deletePhoto, photosFor, setPrimaryPhoto } from '../db';
import { compressPhoto } from '../photos';
import type { RecipePhoto } from '../types';

export function PhotoSection({ recipeId, title }: { recipeId: string; title: string }) {
  const { run, refresh, notify } = useApp();
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null), picker = useRef<HTMLInputElement>(null);
  const load = async () => setPhotos(await photosFor(recipeId));
  useEffect(() => { void load(); }, [recipeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(files: FileList | null, makePrimary: boolean) {
    if (!files?.length) return;
    setBusy(true);
    await run(async () => {
      for (const f of Array.from(files)) {
        const c = await compressPhoto(f);
        await addPhoto({ id: crypto.randomUUID(), recipeId, ...c, primary: false, createdAt: new Date().toISOString(), sync: 'local' }, makePrimary && f === files[0]);
      }
      await load(); await refresh();
      notify('Photo saved on this device.');
    });
    setBusy(false);
  }

  const main = photos.find(p => p.id === viewing) ?? photos.find(p => p.primary) ?? photos[0];
  return (
    <section className="card photos" id="photos" aria-label="Recipe photos">
      <h3><Camera size={18} /> Photos</h3>
      {main ? <img className="photo-main" src={main.dataUrl} alt={`${title}`} width={main.width} height={main.height} /> : <p className="muted">No photo yet. Add your own photo of this bake.</p>}
      {photos.length > 1 && (
        <div className="photo-strip">
          {photos.map(p => <button key={p.id} className={'photo-thumb' + (main?.id === p.id ? ' on' : '')} onClick={() => setViewing(p.id)} aria-label={p.primary ? 'Main photo' : 'Show photo'}><img src={p.thumbUrl} alt="" />{p.primary && <Star size={12} fill="currentColor" />}</button>)}
        </div>
      )}
      <div className="btn-row">
        <button className="primary" disabled={busy} onClick={() => camera.current?.click()}><Camera size={16} /> Take photo</button>
        <button disabled={busy} onClick={() => picker.current?.click()}><ImagePlus size={16} /> Choose photo</button>
        {main && !main.primary && <button onClick={() => void run(async () => { await setPrimaryPhoto(recipeId, main.id); await load(); await refresh(); })}><Star size={16} /> Make main photo</button>}
        {main && <button onClick={() => { if (window.confirm('Remove this photo from the recipe? (It stays in older backup files.)')) void run(async () => { await deletePhoto(main.id); setViewing(null); await load(); await refresh(); }); }}><Trash2 size={16} /> Remove</button>}
      </div>
      {/* capture opens the camera directly on Android; the second input opens the gallery/files */}
      <input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={e => { void add(e.target.files, true); e.target.value = ''; }} />
      <input hidden ref={picker} type="file" accept="image/*" multiple onChange={e => { void add(e.target.files, !photos.length); e.target.value = ''; }} />
      {busy && <p className="muted small">Optimizing photo…</p>}
      <p className="muted small">Stored on this device only and included in backups. Cloud photo sync isn’t set up yet.</p>
    </section>
  );
}
