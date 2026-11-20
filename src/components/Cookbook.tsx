// Cookbook animations: the Recipes page slides a cookbook to the centre and opens its cover;
// opening a recipe flips through a few pages. Tap to skip. Off with reduced motion / Animations off.
import { useEffect, useState } from 'react';
import { PhoenixEmblem } from './Logo';

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
