// Public "Leave a review" page, opened from the QR code on the tuck-in card.
import { useEffect, useState } from 'react';
import { FullLogo, PhoenixSmolder } from '../components/Logo';
import { Picture } from '../components/MenuPicture';
import { StarPicker } from '../components/Stars';
import { ThanksBurst } from './FeedbackPage';

type Flavour = { recipeId: string; recipeTitle: string; look?: { art?: any; photo?: string; illustration?: boolean } };

export function ReviewPage({ deploymentId }: { deploymentId: string }) {
  const url = `https://script.google.com/macros/s/${deploymentId}/exec`;
  const [flavours, setFlavours] = useState<Flavour[] | null>(null);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [again, setAgain] = useState<'' | 'yes' | 'maybe' | 'no'>('');
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const orderLink = `${location.origin}${location.pathname}#/order-form/${deploymentId}/from/card`;

  useEffect(() => {
    document.title = 'Leave a review · Flour and Flame Bakery';
    if (!/^[A-Za-z0-9_-]{20,}$/.test(deploymentId)) { setError('This link is incomplete.'); return; }
    fetch(`${url}?action=menu`, { redirect: 'follow', cache: 'no-store' }).then(r => r.json())
      .then(d => { if (!d.ok) throw Error(); setFlavours(d.flavours ?? []); })
      .catch(() => setError('This page couldn’t load. Check your internet connection and try again.'));
  }, [url, deploymentId]);

  async function send() {
    setSending(true); setError('');
    try {
      const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'review', ratings, again: again || undefined, comment, name, website }) });
      const d = await res.json();
      if (!d.ok) throw Error(d.error === 'empty' ? 'Please tap some stars or write a note first.' : d.error === 'busy' ? 'Lots of reviews right now. Please try again in a minute.' : 'Something went wrong. Please try again.');
      setSent(true); window.scrollTo({ top: 0 });
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    setSending(false);
  }
  const anything = Object.keys(ratings).length > 0 || !!comment.trim();
  return (
    <div className="order-form-page feedback-page">
      {!sent && <div className="hero"><PhoenixSmolder><FullLogo /></PhoenixSmolder></div>}
      {sent ? (
        <section className="card done" aria-live="polite">
          <ThanksBurst />
          <div className="done-text">
            <h2>Thank you{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}!</h2>
            <p>Your review helps decide which flavours stay on the menu.</p>
            <a className="button-like primary-link" href={orderLink}>Order a box →</a>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>How were they?</h2>
          <p className="muted">Tap the stars for the ones you tried. It takes less than a minute.</p>
          {!flavours && !error && <p className="muted">Loading…</p>}
          {flavours && !flavours.length && <p className="muted">Nothing is on the menu right now, but you can still leave a note below.</p>}
          {flavours?.map(f => (
            <div key={f.recipeId} className="fb-flavour">
              <Picture look={f.look} title={f.recipeTitle} seed={f.recipeTitle} size={64} />
              <div><strong>{f.recipeTitle}</strong><StarPicker label={`Rating for ${f.recipeTitle}`} value={ratings[f.recipeId] ?? 0} onChange={n => setRatings({ ...ratings, [f.recipeId]: n })} /></div>
            </div>
          ))}
          <p className="fb-q">Would you order a box?</p>
          <div className="seg" role="radiogroup" aria-label="Would you order a box?">
            {([['yes', 'Yes! 😋'], ['maybe', 'Maybe'], ['no', 'Probably not']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={again === k} className={again === k ? 'on' : ''} onClick={() => setAgain(k)}>{l}</button>)}
          </div>
          <label className="field">Anything else? (optional)<textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={600} rows={3} placeholder="Favourite part, too sweet, a flavour you’d love…" /></label>
          <label className="field">Your first name (optional)<input value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="given-name" /></label>
          <label className="hp" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
          <button className="primary big" disabled={sending || !anything} onClick={() => void send()}>{sending ? 'Sending…' : 'Send review'}</button>
          {error && <p className="banner error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
