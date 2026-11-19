// Weekly summary email settings, and the reviews you chose to show on the order form.
import { Mail, Quote, Star } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../app-context';
import { addEvents, getSheetConfig } from '../ledger';
import { useLedger } from '../ledgerState';
import type { ShopSettings } from '../freezer';

type Featured = NonNullable<ShopSettings['featured']>[number];

function useSaveShop() {
  const { bakery } = useLedger();
  const { run } = useApp();
  return (patch: Partial<ShopSettings>) => run(async () => { await addEvents([{ type: 'shop.settings', settings: { ...bakery.shop, ...patch } } as any]); });
}

export function WeeklySummarySettings() {
  const { bakery } = useLedger();
  const { notify } = useApp();
  const save = useSaveShop();
  const [busy, setBusy] = useState(false);
  const on = bakery.shop.weekly?.off !== true;
  const cfg = getSheetConfig();
  const old = (cfg.scriptVersion ?? 1) < 14;
  const sample = async () => {
    setBusy(true);
    try {
      const r = await fetch(cfg.url!, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: cfg.key, action: 'weeklyPreview' }) }).then(x => x.json());
      notify(r.ok ? '✉️ Sample summary sent to the bakery Gmail (covers the last 7 days).' : r.error === 'unknown-action' ? 'Update the sheet script to version 14 first.' : `Couldn’t send it (${r.error ?? 'unknown problem'}).`, !r.ok);
    } catch { notify('Couldn’t reach the bakery sheet.', true); }
    setBusy(false);
  };
  return (
    <section className="card">
      <h3><Mail size={18} /> Weekly summary email</h3>
      <label className="agree"><input type="checkbox" checked={on} onChange={e => void save({ weekly: { off: !e.target.checked || undefined } })} /> Email me a summary every Sunday evening</label>
      <p className="muted small">Sent to the bakery Gmail after 6 PM on Sundays: new orders, what was picked up and the sales, what's waiting for you, the most-ordered flavour, new and returning customers, tasting boxes, loyalty rewards and reviews. Test orders never count. Paused while testing mode is on. (If no device or customer opens anything Sunday evening, it goes out with the next visit, up to Tuesday.)</p>
      {old && <p className="warn-text small">Needs sheet script version 14. Update it in Sheet settings.</p>}
      <button className="small-btn" disabled={busy || old || !cfg.url} onClick={() => void sample()}>{busy ? 'Sending…' : 'Email me a sample now'}</button>
    </section>
  );
}

const same = (a: Featured, b: { text: string }) => a.text.trim() === b.text.trim();

/** "Show on order form" toggle for one review comment (Reports → What people think). */
export function FeatureToggle({ c }: { c: { text: string; name: string; avg: number } }) {
  const { bakery } = useLedger();
  const { notify } = useApp();
  const save = useSaveShop();
  const list = bakery.shop.featured ?? [];
  const on = list.some(f => same(f, c));
  const toggle = () => {
    if (on) { void save({ featured: list.filter(f => !same(f, c)) }); return; }
    if (list.length >= 3) { notify('You can show up to 3 reviews. Take one off first (Pickup & form → Reviews on your order form).', true); return; }
    void save({ featured: [...list, { text: c.text.trim().slice(0, 280), name: c.name.replace(/\s*\(card\)$/, '').replace(/^From a card$/, ''), stars: Math.round(c.avg) }] }).then(() => notify('This review now shows on your order form.'));
  };
  return <button className={'small-btn feature-btn' + (on ? ' on' : '')} onClick={toggle} title="Show this review on the order form">{on ? '✓ On order form' : <><Quote size={12} /> Show on form</>}</button>;
}

export function FeaturedReviewsSettings() {
  const { bakery } = useLedger();
  const save = useSaveShop();
  const list = bakery.shop.featured ?? [];
  return (
    <section className="card">
      <h3><Quote size={18} /> Reviews on your order form</h3>
      {list.length ? <ul className="featured-list">{list.map((f, i) => (
        <li key={i}><span className="stars-inline">{Array.from({ length: f.stars ?? 0 }, (_, k) => <Star key={k} size={12} fill="currentColor" />)}</span> “{f.text}” <span className="muted small">· {f.name || 'a customer'}</span>
          <button className="small-btn" onClick={() => void save({ featured: list.filter((_, k) => k !== i) })}>Remove</button></li>
      ))}</ul> : <p className="muted small">None yet.</p>}
      <p className="muted small">Pick up to 3 from <b>Reports → What people think</b> (tap “Show on form” next to a comment). Only the first name shows. Needs sheet script version 14.</p>
    </section>
  );
}
