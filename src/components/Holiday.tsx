// A string of softly twinkling holiday lights across the top of the screen.
export function HolidayLights({ count = 22 }: { count?: number }) {
  const colors = ['#ff5a5a', '#ffd166', '#5ad1ff', '#7be07b', '#ff9de2'];
  return (
    <div className="holiday-lights" aria-hidden="true">
      <svg viewBox="0 0 1000 40" preserveAspectRatio="none" className="hl-wire"><path d="M0 6 Q25 30 50 10 T100 10 T150 10 T200 10 T250 10 T300 10 T350 10 T400 10 T450 10 T500 10 T550 10 T600 10 T650 10 T700 10 T750 10 T800 10 T850 10 T900 10 T950 10 T1000 8" fill="none" stroke="#2b3a2b" strokeWidth="2.5" /></svg>
      <div className="hl-bulbs">{Array.from({ length: count }, (_, i) => <i key={i} style={{ ['--c' as any]: colors[i % colors.length], animationDelay: `${(i * 0.37) % 2.4}s` }} />)}</div>
    </div>
  );
}
