// Pictures for the order form: the drawn illustration, or a picture you upload (AI-made or a real photo).
import { Copy, ExternalLink, ImagePlus, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../app-context';
import { addEvents } from '../ledger';
import { photosFor } from '../db';
import { menuPicture } from '../photos';
import type { MenuLook } from '../freezer';
import type { Recipe, RecipePhoto } from '../types';
import { artFor, CookieArt, type ArtSpec } from './CookieArt';

export const artOf = (r: Pick<Recipe, 'title' | 'category' | 'ingredients'>): ArtSpec => artFor(r.title, r.category, r.ingredients.map(i => i.name));
export const lookFor = (r: Recipe, photo?: string, illustrationLabel?: boolean): MenuLook => ({ recipeId: r.id, recipeTitle: r.title, art: artOf(r), ...(photo ? { photo, illustrationLabel: illustrationLabel !== false } : {}) });
/** menu.look events for recipes that don't have a picture yet (so the order form always shows one). */
export function missingLookEvents(recipeIds: string[], recipes: Recipe[], looks: Record<string, MenuLook>) {
  return [...new Set(recipeIds)].filter(id => !looks[id]).map(id => recipes.find(r => r.id === id)).filter(Boolean).map(r => ({ type: 'menu.look', look: lookFor(r!) } as any));
}

/** Shows the uploaded picture if there is one, else the illustration. */
export function Picture({ look, title, seed, size = 72, label }: { look?: { art?: ArtSpec; photo?: string; illustration?: boolean; illustrationLabel?: boolean }; title: string; seed: string; size?: number; label?: boolean }) {
  const art = look?.art ?? artFor(title);
  if (look?.photo) return (
    <span className="menu-pic" style={{ width: size }}>
      <img src={look.photo} alt={title} width={size} height={size} loading="lazy" />
      {label && (look.illustration ?? look.illustrationLabel) !== false && <span className="pic-tag">Illustration</span>}
    </span>
  );
  return <span className="menu-pic" style={{ width: size }}><CookieArt spec={art} seed={seed} size={size} title={title} />{label && <span className="pic-tag">Illustration</span>}</span>;
}

export function aiPrompt(r: Recipe): string {
  const a = artOf(r);
  const thing = a.shape === 'bar' ? `square-cut ${/blondie/i.test(r.title) ? 'blondie' : 'brownie'}` : a.shape === 'crispy' ? 'crispy rice cereal treat square' : 'cookie';
  const highlights = r.ingredients.map(i => i.name.toLowerCase()).filter(n => /chip|chunk|chocolate|sprinkle|nut|pecan|walnut|almond|caramel|toffee|oat|cranberr|raisin|cinnamon|salt|espresso|coffee|peanut|m&m|candy|lemon|matcha|cherry|coconut|white/.test(n)).slice(0, 6);
  return `A realistic, appetizing photo of a single homemade ${r.title} ${thing}${highlights.length ? ` made with ${highlights.join(', ')}` : ''}. ` +
    `Seen from slightly above, centred, on a plain light-colored background with soft natural window light. Bakery-quality but homemade looking. ` +
    `Square image. No text, no hands, no logos, no packaging.`;
}

/** Opens ChatGPT with the request typed in (the ?q= address is widely used but not officially documented, so copying stays available). */
export const chatGptLink = (prompt: string) => `https://chatgpt.com/?q=${encodeURIComponent('Please create this image: ' + prompt)}`;

export function PictureDialog({ recipe, look, onClose }: { recipe: Recipe; look?: MenuLook; onClose: () => void }) {
  const { run, notify } = useApp();
  const [photo, setPhoto] = useState<string | undefined>(look?.photo);
  const [label, setLabel] = useState(look?.illustrationLabel ?? true);
  const [mine, setMine] = useState<RecipePhoto[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void photosFor(recipe.id).then(setMine).catch(() => {}); }, [recipe.id]);
  const take = async (blob: Blob) => { setBusy(true); try { setPhoto(await menuPicture(blob)); } catch (e) { notify(e instanceof Error ? e.message : 'That picture couldn’t be used.', true); } setBusy(false); };
  const prompt = aiPrompt(recipe);
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pic-title">
      <div className="modal wide">
        <h3 id="pic-title"><ImagePlus size={18} /> Picture on the order form: {recipe.title}</h3>
        <div className="pic-preview">
          <Picture look={photo ? { photo, illustration: label } : { art: artOf(recipe) }} title={recipe.title} seed={recipe.id} size={160} label={!photo || label} />
          <div className="pic-choices">
            <button className={!photo ? 'on' : ''} onClick={() => setPhoto(undefined)}><Sparkles size={16} /> Use the drawn illustration</button>
            <label className="button-like"><ImagePlus size={16} /> Upload a picture<input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void take(f); e.target.value = ''; }} /></label>
            {busy && <p className="muted small">Preparing the picture…</p>}
            {photo && <label className="agree"><input type="checkbox" checked={label} onChange={e => setLabel(e.target.checked)} /> Show “Illustration” under it (keep this on for AI pictures; turn it off for real photos of your cookies)</label>}
          </div>
        </div>
        {mine.length > 0 && <>
          <p className="small"><b>Or use one of this recipe’s photos:</b></p>
          <div className="photo-pick">{mine.map(p => <button key={p.id} aria-label="Use this photo" onClick={() => void fetch(p.dataUrl).then(r => r.blob()).then(take)}><img src={p.thumbUrl} alt="" width={72} height={72} /></button>)}</div>
        </>}
        <details className="ai-help" open={!photo}>
          <summary><Wand2 size={16} /> Make a realistic AI picture of this cookie</summary>
          <ol className="small">
            <li>Tap <b>Create in ChatGPT</b>. ChatGPT opens in a new tab with the description already typed in. Press send if it doesn’t start on its own. (If the box is empty, tap <b>Copy description</b> and paste it in.)</li>
            <li>When the picture appears, save it: right-click → <b>Save image as…</b> on the PC, or long-press → <b>Download image</b> on the phone.</li>
            <li>Come back to this tab and tap <b>Upload a picture</b>, then <b>Save</b>.</li>
          </ol>
          <div className="btn-row"><button className="primary" onClick={() => window.open(chatGptLink(prompt), '_blank', 'noopener')}><ExternalLink size={16} /> Create in ChatGPT</button></div>
          <textarea readOnly value={prompt} rows={4} aria-label="Picture description" />
          <button className="small-btn" onClick={() => void navigator.clipboard?.writeText(prompt).then(() => notify('Description copied. Paste it into your AI picture tool.')).catch(() => notify('Copy failed.', true))}><Copy size={14} /> Copy description</button>
        </details>
        <p className="muted small">Pictures are shrunk to a small square so they load quickly for customers. They appear on the order form with bakery-sheet script version 5.</p>
        <div className="btn-row">
          <button className="primary" disabled={busy} onClick={() => void run(async () => { await addEvents([{ type: 'menu.look', look: lookFor(recipe, photo, label) } as any]); notify('Picture saved for the order form.'); onClose(); })}>Save</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
