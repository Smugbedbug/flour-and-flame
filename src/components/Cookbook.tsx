// Cookbook animations: the Recipes page slides a cookbook to the centre and opens its cover;
// opening a recipe flips through a few pages. Tap to skip. Off with reduced motion / Animations off.
import { useEffect, useRef, useState } from 'react';
import { PhoenixEmblem } from './Logo';
import '@fontsource/caveat/latin-600.css'; // handwriting for the import animation (OFL-1.1, bundled so it works offline)

const motionOk = () => document.documentElement.dataset.anim !== 'off' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// remember the page we came from, so going back from a recipe doesn't replay the whole book
let lastPage = '', prevPage = '';
export function notePage(p: string) { if (p !== lastPage) { prevPage = lastPage; lastPage = p; } }
export const cameFrom = () => prevPage;

function useOverlay(ms: number, play: boolean) {
  const [on, setOn] = useState(() => play && motionOk());
  useEffect(() => { if (!on) return; const t = setTimeout(() => setOn(false), ms); return () => clearTimeout(t); }, [on, ms]);
  return [on, () => setOn(false)] as const;
}

/** Recipes page: the cookbook slides in and opens. */
export function BookIntro() {
  const [on, skip] = useOverlay(1700, !['recipe', 'edit', 'bake', 'new'].includes(cameFrom()));
  if (!on) return null;
  return (
    <div className="book-intro" onClick={skip} aria-hidden="true">
      <div className="book">
        <div className="book-pages"><span className="book-lines" /></div>
        <div className="book-cover">
          <div className="book-cover-front"><PhoenixEmblem size={64} /><b>Recipes</b><small>Flour and Flame</small></div>
          <div className="book-cover-back" />
        </div>
        <span className="book-spine" />
      </div>
    </div>
  );
}

/** A recipe: an open book flips through a few pages. */
export function PageFlip({ id }: { id: string }) {
  const [on, skip] = useOverlay(1150, true);
  if (!on) return null;
  return (
    <div className="page-flip" key={id} onClick={skip} aria-hidden="true">
      <div className="spread">
        <div className="leaf left"><span className="book-lines" /></div>
        <div className="leaf right"><span className="book-lines" /></div>
        {[0, 1, 2].map(i => <div key={i} className="sheet" style={{ animationDelay: `${i * 0.16}s` }}><span className="book-lines" /></div>)}
      </div>
    </div>
  );
}

/** Import: the cookbook lies open and the new recipe is written onto the page in ink, line by line. */
export function ImportWriting({ title, more, lines, onDone }: { title: string; more: number; lines: string[]; onDone: () => void }) {
  const shown = lines.slice(0, 4);
  const TITLE = 1.0, LINE = 0.42, START = 0.55;
  const stampAt = START + TITLE + shown.length * LINE + 0.15;
  const total = (stampAt + 1.15) * 1000;
  const [play] = useState(motionOk);
  const done = useRef(false);
  const finish = () => { if (done.current) return; done.current = true; onDone(); };
  useEffect(() => { if (!play) { finish(); return; } const t = setTimeout(finish, total); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!play) return null;
  const ink = (delay: number, dur: number, text: string, cls: string) => (
    <span className={'ink ' + cls} style={{ ['--d' as any]: `${delay}s`, ['--t' as any]: `${dur}s` }}>
      <span className="ink-text">{text}</span>
      <span className="quill" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M20.5 2.5c-6 1-11 5.5-13.5 12l-1.5 4 1 1 4-1.5c6.5-2.5 11-7.5 12-13.5z" fill="#f3e3c3" stroke="#5a2412" strokeWidth="1.2" strokeLinejoin="round" /><path d="M4 21l5.5-5.5M9 10.5l4.5 4.5" stroke="#5a2412" strokeWidth="1.2" strokeLinecap="round" /></svg></span>
    </span>
  );
  return (
    <div className="write-intro" onClick={finish} style={{ ['--total' as any]: `${total}ms` }} role="status" aria-label={`Adding ${title} to your cookbook`}>
      <div className="write-book">
        <div className="write-page left">
          <PhoenixEmblem size={44} />
          <b>Flour and Flame</b>
          <small>Recipes</small>
          <span className="book-lines faint" />
        </div>
        <div className="write-page right">
          {ink(START, TITLE, title, 'ink-title')}
          <span className="ink-rule" style={{ ['--d' as any]: `${START + TITLE - 0.1}s` }} />
          {shown.map((l, i) => <div key={i}>{ink(START + TITLE + i * LINE, LINE, l, 'ink-line')}</div>)}
          {more > 0 && <div>{ink(stampAt - 0.15, 0.3, `+ ${more} more recipe${more > 1 ? 's' : ''}`, 'ink-line more')}</div>}
          <span className="ink-stamp" style={{ ['--d' as any]: `${stampAt}s` }}>Added ✓</span>
        </div>
        <span className="write-gutter" />
      </div>
      <p className="write-hint">Tap to skip</p>
    </div>
  );
}
