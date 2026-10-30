import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { FOOTER_GRID_CSS } from '../footerLayout';
import { industryPlural } from '../industryPlural';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('footer grid keeps all link columns on one row', () => {
  it('desktop grid is brand + 3 columns; tablet and phone stack the brand', () => {
    expect(FOOTER_GRID_CSS).toContain('grid-template-columns:minmax(0,1.6fr) repeat(3,minmax(0,1fr))');
    expect(FOOTER_GRID_CSS).toMatch(/max-width:960px[\s\S]*\.ra-fbrand\{grid-column:1\/-1/);
    expect(FOOTER_GRID_CSS).toMatch(/max-width:560px[\s\S]*repeat\(2,minmax\(0,1fr\)\)/);
  });

  it('the shared footer uses the grid, not the auto-fit span-2 layout', () => {
    const s = src('components/SiteChrome.tsx');
    expect(s).toContain('FOOTER_GRID_CSS');
    expect(s).toContain('ra-fgrid');
    expect(s).not.toMatch(/gridColumn:\s*'span 2'/);
  });

  it('Roofing reads as Roofing Companies', () => {
    expect(industryPlural('Roofing')).toBe('Roofing Companies');
  });
});
