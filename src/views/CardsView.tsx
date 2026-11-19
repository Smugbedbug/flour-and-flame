// Tuck-in order cards: business-card size (3.5 × 2 in), 10 per US Letter sheet, with a QR code to the order form.
import { ArrowLeft, Printer, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { go, useApp } from '../app-context';
import { useLedger } from '../ledgerState';
import { getSheetConfig } from '../ledger';
import { PhoenixEmblem } from '../components/Logo';
import { Picture } from '../components/MenuPicture';

export function cardLink(): string | null {
  const m = (getSheetConfig().url ?? '').match(/\/macros\/s\/([A-Za-z0-9_-]+)\/exec/);
  return m ? `${location.origin}${location.pathname}#/order-form/${m[1]}/from/card` : null;
}

export function CardsView() {
  const { recipes } = useApp();
  const { bakery } = useLedger();
  const link = cardLink();
  const onMenu = useMemo(() => [...new Set(bakery.products.filter(p => p.active).flatMap(p => (p.kind === 'mixed' ? (p.options ?? []).map(o => o.recipeId) : [p.recipeId])))]
    .map(id => recipes.find(r => r.id === id)).filter(Boolean) as typeof recipes, [bakery.products, recipes]);
  const saved = (() => { try { return JSON.parse(localStorage.getItem('ff-cards') ?? '{}'); } catch { return {}; } })();
  const [chosen, setChosen] = useState<string[]>(() => saved.chosen ?? ['generic']);
  const [line, setLine] = useState<string>(saved.line ?? 'Liked these? Scan to order more!');
  useEffect(() => { try { localStorage.setItem('ff-cards', JSON.stringify({ chosen, line })); } catch { /* ignore */ } }, [chosen, line]);
  const [svg, setSvg] = useState('');
  useEffect(() => { if (link) void QRCode.toString(link, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#1c1512', light: '#0000' } }).then(setSvg); }, [link]);
  // fill a sheet of 10, cycling through the chosen designs
  const designs = chosen.length ? chosen : ['generic'];
  const sheet = Array.from({ length: 10 }, (_, i) => designs[i % designs.length]);
  const toggle = (id: string) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : [...c, id]));

  if (!link) return <div className="page"><h2><QrCode size={24} /> Order cards</h2><p className="muted">Connect the <button className="link" onClick={() => go('sheet')}>bakery sheet</button> first. The card’s QR code opens your order form.</p></div>;
  return (
    <div className="page cards-page">
      <div className="page-head no-print">
        <h2><QrCode size={24} /> Tuck-in order cards</h2>
        <div className="btn-row"><button onClick={() => history.length > 1 ? history.back() : go('orders')}><ArrowLeft size={16} /> Back</button><button className="primary big" onClick={() => window.print()}><Printer size={18} /> Print 10 cards</button></div>
      </div>
      <section className="card no-print">
        <p className="small">Your designs and message are remembered, so next time just tap <b>Print 10 cards</b>. Business-card size (3.5 × 2 inches), 10 per sheet of US Letter paper. Print at <b>100% / Actual size</b> (not “Fit to page”). Use thick cardstock and cut along the light lines, or buy perforated business-card sheets that snap apart: the layout matches the standard Avery 2″ × 3½″ card template (e.g. <b>Avery 8371 for inkjet</b> or <b>Avery 5371 for laser</b> printers). The QR code opens your order form. Orders that come from it count as “Tried a tasting box” in Reports.</p>
        <p className="small"><b>Designs on this sheet</b> (pick one or more; they repeat to fill 10):</p>
        <div className="chip-row">
          <button className={'chip' + (chosen.includes('generic') ? ' on' : '')} onClick={() => toggle('generic')}>Logo only</button>
          {onMenu.map(r => <button key={r.id} className={'chip' + (chosen.includes(r.id) ? ' on' : '')} onClick={() => toggle(r.id)}>{r.title}</button>)}
        </div>
        <label className="field">Message on the card<input value={line} maxLength={60} onChange={e => setLine(e.target.value)} /></label>
      </section>
      <div className="card-sheet">
        {sheet.map((id, i) => {
          const r = recipes.find(x => x.id === id);
          return (
            <div key={i} className="tuck-card">
              <div className="tc-left">
                {r ? <Picture look={bakery.looks[r.id]} title={r.title} seed={r.id} size={78} /> : <span className="tc-logo"><PhoenixEmblem size={64} /></span>}
              </div>
              <div className="tc-mid">
                <span className="tc-brand">FLOUR AND FLAME</span>
                {r && <strong className="tc-title">{r.title}</strong>}
                <span className="tc-line">{line}</span>
              </div>
              <div className="tc-qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label="QR code to the order form" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
