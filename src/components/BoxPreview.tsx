// Customer order form: a bakery box that fills as treats are picked, and the "order received" box that
// closes, ties a ribbon and gets the Flour & Flame stamp. Respects reduced motion.
import { CookieArt, artFor, type ArtSpec } from './CookieArt';

export type Treat = { title: string; art?: ArtSpec };
const specOf = (t: Treat) => t.art ?? artFor(t.title);
const cols = (pieces: number) => (pieces <= 1 ? 1 : pieces <= 4 ? 2 : pieces <= 6 ? 3 : pieces <= 12 ? 6 : 6);

/** One box with `pieces` slots; `fill` lists what's in each slot (missing = empty). */
export function BakeryBox({ pieces, fill, label, size = 26 }: { pieces: number; fill: Treat[]; label?: string; size?: number }) {
  const c = cols(pieces);
  return (
    <div className="bake-box" style={{ ['--cols' as any]: c, ['--cell' as any]: `${size + 8}px` }} aria-label={label ?? `Box of ${pieces}: ${fill.length} filled`}>
      <div className="bb-tray">
        {Array.from({ length: pieces }, (_, i) => {
          const t = fill[i];
          return <span key={i} className={'bb-slot' + (t ? ' full' : '')} style={{ ['--i' as any]: i }}>{t && <CookieArt spec={specOf(t)} seed={t.title + i} size={size} />}</span>;
        })}
      </div>
    </div>
  );
}

/** Boxes for one size of one flavour: qty × a full box (up to 4 drawn, then "+N"). */
export function PickBoxes({ treat, pieces, qty }: { treat: Treat; pieces: number; qty: number }) {
  if (qty < 1) return null;
  const shown = Math.min(qty, 4), small = pieces > 6 ? 18 : 22;
  return (
    <div className="pick-boxes" aria-live="polite" aria-label={`${qty} box${qty > 1 ? 'es' : ''} of ${pieces} ${treat.title}`}>
      {Array.from({ length: shown }, (_, k) => <BakeryBox key={k} pieces={Math.min(pieces, 24)} fill={Array.from({ length: Math.min(pieces, 24) }, () => treat)} size={pieces === 1 ? 32 : small} />)}
      {qty > shown && <span className="pb-more">+{qty - shown}</span>}
    </div>
  );
}

/** Order received: the box (filled with what they ordered) closes, a ribbon ties, the stamp lands. */
export function BoxSuccess({ orderNo, treats }: { orderNo?: number; treats: Treat[] }) {
  const fill = Array.from({ length: 6 }, (_, i) => treats.length ? treats[i % treats.length] : { title: 'Cookie' });
  return (
    <div className="box-success" aria-hidden="true">
      <div className="bs-scene">
        <div className="bs-box">
          <div className="bs-inside"><BakeryBox pieces={6} fill={fill} size={34} /></div>
          <div className="bs-lid"><span className="bs-window" /></div>
          <span className="bs-ribbon v" /><span className="bs-ribbon h" />
          <span className="bs-bow"><i /><i /><b /></span>
          <span className="bs-stamp"><small>Flour &amp; Flame</small>{orderNo ? <b>#{orderNo}</b> : <b>✓</b>}</span>
        </div>
        {Array.from({ length: 10 }, (_, i) => <span key={i} className="bs-spark" style={{ ['--i' as any]: i }} />)}
      </div>
    </div>
  );
}
