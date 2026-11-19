// "You usually sell ~24 Brown Butter a week; 8 free: make a batch."
import { TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { doughNudges } from '../forecast';
import { useLedger } from '../ledgerState';

export function DoughNudges({ compact }: { compact?: boolean }) {
  const { bakery } = useLedger();
  const nudges = useMemo(() => doughNudges(bakery.orders, bakery.plan), [bakery.orders, bakery.plan]);
  if (!nudges.length) return null;
  if (compact) return <p className="small nudge-line"><TrendingUp size={14} /> Running low for a usual week: {nudges.map(n => `${n.recipeTitle} (sell ~${n.perWeek}, ${n.free} free)`).join(' · ')}</p>;
  return (
    <div className="nudge-card" role="note">
      <TrendingUp size={18} />
      <div>
        <b>Time to make dough</b>
        <ul>{nudges.map(n => <li key={n.recipeId}>You usually sell about <b>{n.perWeek} {n.recipeTitle}</b> a week and have <b>{n.free}</b> free. Make about <b>{n.makeMore}</b> more.</li>)}</ul>
        <span className="muted small">Based on your last few weeks of orders (tests, tasting boxes and cancelled orders don’t count). “Free” means not already set aside for confirmed orders.</span>
      </div>
    </div>
  );
}
