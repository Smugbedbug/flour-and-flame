// Phone → PC recipes: the "Send to PC" button (phone) and the "From your phone" inbox (PC).
import { Check, ChevronDown, Laptop, Smartphone, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { go, useApp } from '../app-context';
import { getHubConfig } from '../hub';
import { getSheetConfig } from '../ledger';
import { useLedger } from '../ledgerState';
import { addShared, sendRecipeToPc, skipShared, type RecipeShare } from '../recipeShare';
import type { Recipe } from '../types';

export const isPhoneReceiver = () => getHubConfig().role === 'receiver';

/** Phone (linked to the PC): send this recipe to the PC through the bakery sheet. */
export function SendToPcButton({ recipe }: { recipe: Recipe }) {
  const { run, notify } = useApp();
  const { bakery, connected } = useLedger();
  if (!isPhoneReceiver()) return null;
  const waiting = bakery.recipeShares.find(s => s.recipe.id === recipe.id && s.recipe.version === recipe.version && s.recipe.updatedAt === recipe.updatedAt);
  const send = () => {
    if (!connected || !getSheetConfig().url) { notify('Connect the bakery sheet on this phone first (Orders → Pickup & form → Bakery sheet settings).', true); return; }
    void run(async () => { await sendRecipeToPc(recipe); notify('📲 Sent. Your PC will show it under Recipes → From your phone.'); });
  };
  return waiting
    ? <button disabled title="Waiting for your PC to add it"><Check size={16} /> Sent to PC</button>
    : <button onClick={send}><Laptop size={16} /> Send to PC</button>;
}

/** PC: recipes your phone sent, waiting for Add or Skip. */
export function PhoneInbox() {
  const { recipes, catalog, run, refresh, notify } = useApp();
  const { bakery } = useLedger();
  const [open, setOpen] = useState<string | null>(null);
  const list = bakery.recipeShares;
  // a quiet heads-up when a new one arrives while the app is open
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (isPhoneReceiver()) return;
    if (seen.current !== null && list.length > seen.current) { const s = list[list.length - 1]; notify(`📲 Recipe from your phone: ${s.recipe.title}`); }
    seen.current = list.length;
  }, [list.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isPhoneReceiver() || !list.length) return null;

  const add = (s: RecipeShare) => run(async () => {
    const had = recipes.find(r => r.id === s.recipe.id);
    const saved = await addShared(s, recipes, catalog);
    await refresh();
    notify(had ? `"${saved.title}" saved as version ${saved.version}. The previous version is in History.` : `"${saved.title}" added to your recipes.`);
    go('recipe/' + saved.id);
  });
  const skip = (s: RecipeShare) => run(async () => { await skipShared(s); notify(`Skipped "${s.recipe.title}".`); });

  return (
    <section className="card phone-inbox" aria-label="Recipes from your phone">
      <h3><Smartphone size={18} /> From your phone <span className="pi-count">{list.length}</span></h3>
      <ul>
        {list.map(s => {
          const had = recipes.find(r => r.id === s.recipe.id);
          const r = s.recipe;
          return (
            <li key={s.shareId}>
              <div className="pi-main">
                <strong>{r.title}</strong>
                <span className="muted small">{r.category} · {r.ingredients.length} ingredients · {had ? `update to your version ${had.version}` : 'new recipe'} · sent {new Date(s.sentAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
              </div>
              <div className="btn-row tight">
                <button className="small-btn primary" onClick={() => void add(s)}><Check size={15} /> {had ? 'Save as new version' : 'Add'}</button>
                <button className="small-btn" aria-expanded={open === s.shareId} onClick={() => setOpen(open === s.shareId ? null : s.shareId)}><ChevronDown size={15} /> Look first</button>
                <button className="small-btn" onClick={() => void skip(s)}><X size={15} /> Skip</button>
              </div>
              {open === s.shareId && (
                <div className="pi-preview">
                  <p className="small"><b>Makes</b> {r.yieldAmount} {r.yieldUnit}{r.ovenTemp ? ` · ${r.ovenTemp}` : ''} · {r.status}</p>
                  <ul className="small">{r.ingredients.map(i => <li key={i.id}>{i.amount} {i.unit === 'each' ? '' : i.unit} {i.name}{i.section ? <span className="muted"> ({i.section})</span> : null}</li>)}</ul>
                  <ol className="small">{r.steps.map((st, k) => <li key={k}>{st}</li>)}</ol>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small">Nothing changes on this PC until you tap Add. Updates become a new version; the old one stays in History.</p>
    </section>
  );
}
