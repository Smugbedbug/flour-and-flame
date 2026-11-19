// Star ratings: display, and big tappable stars for the feedback page.
import { Star } from 'lucide-react';

export const avgRating = (r: Record<string, number>) => { const v = Object.values(r); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };

export function Stars({ value, size = 15, label }: { value: number; size?: number; label?: string }) {
  return (
    <span className="stars" role="img" aria-label={label ?? `${Math.round(value * 10) / 10} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map(n => <span key={n} className="star-wrap"><Star size={size} className="star-bg" /><span className="star-fill" style={{ width: `${Math.max(0, Math.min(1, value - n + 1)) * 100}%` }}><Star size={size} /></span></span>)}
    </span>
  );
}

export function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="star-picker" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>
          <Star size={34} />
        </button>
      ))}
    </div>
  );
}
