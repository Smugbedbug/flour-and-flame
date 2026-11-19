// Public "How were they?" page, opened from the link in the feedback email.
// Only works with the signed link; the customer sees just their own order's flavours.
import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FullLogo, PhoenixEmblem, PhoenixSmolder, usePrefersReducedMotion } from '../components/Logo';
import { Picture } from '../components/MenuPicture';
import { StarPicker } from '../components/Stars';

type Flavour = { recipeId: string; recipeTitle: string; look?: { art?: any; photo?: string; illustration?: boolean } };

export function FeedbackPage({ deploymentId, orderId, token }: { deploymentId: string; orderId: string; token: string }) {
  const url = `https://script.google.com/macros/s/${deploymentId}/exec`;
  const [info, setInfo] = useState<{ name: string; done: boolean; flavours: Flavour[] } | null>(null);
  const [error, setError] = useState('');
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [again, setAgain] = useState<'' | 'yes' | 'maybe' | 'no'>('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    document.title = 'How were they? · Flour and Flame Bakery';
    if (!/^[A-Za-z0-9_-]{20,}$/.test(deploymentId) || !orderId || !token) { setError('This link is incomplete. Please use the link from your email.'); return; }
    fetch(`${url}?action=feedbackInfo&o=${encodeURIComponent(orderId)}&t=${encodeURIComponent(token)}`, { redirect: 'follow', cache: 'no-store' })
      .then(r => r.json()).then(d => { if (!d.ok) throw Error(d.error); setInfo(d); })
      .catch(e => setError(e?.message === 'bad-link' ? 'This link doesn’t look right. Please use the link from your email.' : 'This page couldn’t load. Check your internet connection and try again.'));
  }, [url, deploymentId, orderId, token]);

  async function send() {
    setSending(true); setError('');
    try {
      const res = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'feedback', orderId, token, ratings, again: again || undefined, comment }) });
      const d = await res.json();
      if (!d.ok) throw Error(d.error === 'empty' ? 'Please tap some stars or write a note first.' : 'Something went wrong. Please try again.');
      setSent(true); window.scrollTo({ top: 0 });
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    setSending(false);
  }

  const anything = Object.keys(ratings).length > 0 || !!again || !!comment.trim();
  return (
    <div className="order-form-page feedback-page">
      {!sent && <div className="hero"><PhoenixSmolder><FullLogo /></PhoenixSmolder></div>}
      {sent ? (
        <section className="card done" aria-live="polite">
          <ThanksBurst />
          <div className="done-text"><h2>Thank you{info?.name ? `, ${info.name}` : ''}!</h2><p>Your feedback helps decide which flavours stay on the menu.</p></div>
        </section>
      ) : (
        <section className="card">
          {!info && !error && <p className="muted">Loading…</p>}
          {info && (
            <>
              <h2>How were they{info.name ? `, ${info.name}` : ''}?</h2>
              {info.done && <p className="muted small">We already have your feedback. Thank you! You can update it below.</p>}
              {info.flavours.map(f => (
                <div key={f.recipeId} className="fb-flavour">
                  <Picture look={f.look} title={f.recipeTitle} seed={f.recipeTitle} size={72} />
                  <div><strong>{f.recipeTitle}</strong><StarPicker label={`Rating for ${f.recipeTitle}`} value={ratings[f.recipeId] ?? 0} onChange={n => setRatings({ ...ratings, [f.recipeId]: n })} /></div>
                </div>
              ))}
              <p className="fb-q">Would you order again?</p>
              <div className="seg" role="radiogroup" aria-label="Would you order again?">
                {([['yes', 'Yes! 😋'], ['maybe', 'Maybe'], ['no', 'Probably not']] as const).map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={again === k} className={again === k ? 'on' : ''} onClick={() => setAgain(k)}>{l}</button>)}
              </div>
              <label className="field">Anything else? (optional)<textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={600} rows={3} placeholder="Favourite part, too sweet, a flavour you’d love…" /></label>
              <button className="primary big" disabled={sending || !anything} onClick={() => void send()}>{sending ? 'Sending…' : 'Send feedback'}</button>
            </>
          )}
          {error && <p className="banner error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}

function ThanksBurst() {
  const reduced = usePrefersReducedMotion();
  return (
    <div className={'order-success thanks' + (reduced ? ' still' : '')} aria-hidden="true">
      <div className="os-glow" />
      {!reduced && Array.from({ length: 10 }, (_, i) => <Heart key={i} className="heart-pop" size={14 + (i % 3) * 4} style={{ ['--i' as any]: i }} />)}
      <div className="os-phoenix smolder animate"><PhoenixEmblem size={110} /></div>
    </div>
  );
}
