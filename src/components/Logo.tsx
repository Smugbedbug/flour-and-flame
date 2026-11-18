// Flour and Flame minimal copper phoenix. Same artwork as public/phoenix-emblem.svg and the app icons.
import { useId } from 'react';

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
        <path d="M30.6 34C21.4 33.2 11.6 26.6 6.6 10.8C13.6 19.2 21.2 22.8 29.6 25.6Z"/>
        <path d="M30.6 28.4C25.4 25.8 20.6 20 18.6 9.5C22.6 16.6 26.4 20.2 31 22.8Z"/>
        <path d="M33.4 34C42.6 33.2 52.4 26.6 57.4 10.8C50.4 19.2 42.8 22.8 34.4 25.6Z"/>
        <path d="M33.4 28.4C38.6 25.8 43.4 20 45.4 9.5C41.4 16.6 37.6 20.2 33 22.8Z"/>
        <path d="M32 13.2C34.3 13.2 35 16.4 33.5 19.4C35.2 25.4 34.9 33.2 32 41.5C29.1 33.2 28.8 25.4 30.5 19.4C29 16.4 29.7 13.2 32 13.2Z"/>
        <path d="M32.9 13.6C33.9 10.2 36.6 8.4 39.8 8.6C37.2 9.8 35.6 11.8 34.6 14.8Z"/>
        <path d="M32 40C34.3 45.5 34.2 51.5 32 58C29.8 51.5 29.7 45.5 32 40Z"/>
        <path d="M31 41.5C27.2 45 24.6 49.6 23.4 55.5C26.6 51.2 29.2 48.6 31.4 46.6Z"/>
        <path d="M33 41.5C36.8 45 39.4 49.6 40.6 55.5C37.4 51.2 34.8 48.6 32.6 46.6Z"/>
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
