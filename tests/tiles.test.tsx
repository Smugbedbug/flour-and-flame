import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { IngredientTiles, groupBySection } from '../src/components/IngredientTiles';
import { testRecipes as seeds } from './fixtures';

function Harness({ factor }: { factor: number }) {
  const [checked, setChecked] = useState<string[]>([]);
  return <IngredientTiles ingredients={seeds[0].ingredients} factor={factor} checked={checked} onToggle={id => setChecked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])} />;
}

describe('ingredient tiles', () => {
  test('whole tile toggles measured state and never touches the master recipe', () => {
    const before = JSON.stringify(seeds[0]);
    render(<Harness factor={2} />);
    const butter = screen.getByRole('button', { name: /Unsalted butter, 340 g/ });
    expect(butter.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(butter);
    expect(butter.getAttribute('aria-pressed')).toBe('true');
    expect(butter.textContent).toContain('24 tbsp');
    expect(butter.textContent).toContain('3 sticks');
    expect(JSON.stringify(seeds[0])).toBe(before);
  });
  test('group headings are preserved in recipe order', () => {
    expect(groupBySection(seeds[0].ingredients).map(g => g.section)).toEqual(['Dough', 'Coating', 'Butter adjustment']);
    render(<Harness factor={1} />);
    expect(screen.getByText('Coating')).toBeTruthy();
  });
  test('no doubled approximation symbols', () => {
    const { container } = render(<Harness factor={2} />);
    expect(container.textContent).not.toContain('≈ ≈');
  });
});
