// Flour and Flame minimal copper phoenix. Same artwork as public/phoenix-emblem.svg and the app icons.
import { useEffect, useId, useState, type ReactNode } from 'react';

export function PhoenixEmblem({ size = 32, title }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <linearGradient id={`cu${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F2B98A" /><stop offset=".55" stopColor="#D98A55" /><stop offset="1" stopColor="#A9582F" />
        </linearGradient>
      </defs>
      <g fill={`url(#cu${id})`}>
        {/* Wings are separate groups so the dashboard can hinge them at the shoulders (see .ph-wing in style.css). */}
        <g className="ph-flight">
          <g className="ph-wing ph-l ph-outer"><path d="M30.6 34C21.4 33.2 11.6 26.6 6.6 10.8C13.6 19.2 21.2 22.8 29.6 25.6Z"/></g>
          <g className="ph-wing ph-l ph-inner"><path d="M30.6 28.4C25.4 25.8 20.6 20 18.6 9.5C22.6 16.6 26.4 20.2 31 22.8Z"/></g>
          <g className="ph-wing ph-r ph-outer"><path d="M33.4 34C42.6 33.2 52.4 26.6 57.4 10.8C50.4 19.2 42.8 22.8 34.4 25.6Z"/></g>
          <g className="ph-wing ph-r ph-inner"><path d="M33.4 28.4C38.6 25.8 43.4 20 45.4 9.5C41.4 16.6 37.6 20.2 33 22.8Z"/></g>
          <path d="M32 13.2C34.3 13.2 35 16.4 33.5 19.4C35.2 25.4 34.9 33.2 32 41.5C29.1 33.2 28.8 25.4 30.5 19.4C29 16.4 29.7 13.2 32 13.2Z"/>
          <path d="M32.9 13.6C33.9 10.2 36.6 8.4 39.8 8.6C37.2 9.8 35.6 11.8 34.6 14.8Z"/>
          <path d="M32 40C34.3 45.5 34.2 51.5 32 58C29.8 51.5 29.7 45.5 32 40Z"/>
          <path d="M31 41.5C27.2 45 24.6 49.6 23.4 55.5C26.6 51.2 29.2 48.6 31.4 46.6Z"/>
          <path d="M33 41.5C36.8 45 39.4 49.6 40.6 55.5C37.4 51.2 34.8 48.6 32.6 46.6Z"/>
        </g>
      </g>
    </svg>
  );
}

/** Compact header logo: emblem + two-line wordmark. */
export function CompactLogo() {
  return (
    <span className="logo-compact">
      <PhoenixEmblem size={34} />
      <span className="logo-words"><small>FLOUR AND FLAME</small><strong>Bakery</strong></span>
    </span>
  );
}

/** Full emblem + wordmark, used on the dashboard. */
export function FullLogo() {
  return (
    <div className="logo-full">
      <PhoenixEmblem size={84} title="Flour and Flame Bakery phoenix" />
      <div className="logo-full-words"><span>FLOUR AND FLAME</span><span className="rule" /><span className="sub">BAKERY</span></div>
    </div>
  );
}

// ---------- subtle smoldering effect (dashboard only) ----------

const ANIM_KEY = 'ff-logo-animation';
export function getLogoAnimationSetting(): boolean { try { return localStorage.getItem(ANIM_KEY) !== 'off'; } catch { return true; } }
export function setLogoAnimationSetting(on: boolean) { try { localStorage.setItem(ANIM_KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ } window.dispatchEvent(new Event('ff-logo-animation')); }

export function usePrefersReducedMotion(): boolean {
  const q = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setReduced(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * Wraps the full logo with a faint ember glow, flickering highlight and a few slow rising embers.
 * CSS-only (opacity/transform), so it's cheap; off when the system asks for reduced motion or the user turns it off.
 */
export function PhoenixSmolder({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  const [enabled, setEnabled] = useState(getLogoAnimationSetting);
  useEffect(() => { const on = () => setEnabled(getLogoAnimationSetting()); window.addEventListener('ff-logo-animation', on); return () => window.removeEventListener('ff-logo-animation', on); }, []);
  const animate = enabled && !reduced;
  return (
    <span className={'smolder' + (animate ? ' animate' : ' static')} data-testid="phoenix-smolder" data-animated={animate ? 'true' : 'false'}>
      <span className="smolder-glow" aria-hidden />
      {animate && <span className="embers" aria-hidden><i /><i /><i /><i /></span>}
      {children}
    </span>
  );
}
