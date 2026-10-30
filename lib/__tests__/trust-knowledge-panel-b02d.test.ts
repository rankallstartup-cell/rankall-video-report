import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { knowledgePanelTitleMatches } from '../trust';

// b02d: a Knowledge Panel only counts when SerpAPI returns a
// knowledge_graph whose title is THIS person (normalised).
describe('b02d knowledgePanelTitleMatches', () => {
  it.each([
    ['Jane Smith', 'Dr. Jane Smith'],
    ['Dr. Jane Smith, MD', 'Jane Smith'],
    ['José Álvarez', 'Jose Alvarez'],
    ['Jane Marie Smith', 'Jane Smith'],
  ])('"%s" matches "%s"', (title, name) => {
    expect(knowledgePanelTitleMatches(title, name)).toBe(true);
  });

  it.each([
    ['Jane Smithson', 'Jane Smith'],
    ['John Smith', 'Jane Smith'],
    ['Cardiology', 'Jane Smith'],
    ['Smith & Jones Law Firm LLP', 'Jane Smith'],
    [undefined, 'Jane Smith'],
    ['Jane Smith', ''],
  ])('"%s" does not match "%s"', (title, name) => {
    expect(knowledgePanelTitleMatches(title as string | undefined, name)).toBe(false);
  });
});

describe('b02d routes require a matching knowledge_graph', () => {
  it('scan-personal no longer marks a panel from any organic result', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/scan-personal/route.ts'), 'utf8');
    expect(src).toContain('knowledgePanelTitleMatches(data?.knowledge_graph?.title, name)');
    expect(src).not.toMatch(/searchExists\(`"\$\{name\}" "\$\{specialty\}"/);
    expect(src.toLowerCase()).not.toContain('wikidata');
  });

  it('personal-competitor requires the KG title to match the competitor', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/personal-competitor/route.ts'), 'utf8');
    expect(src).toContain('knowledgePanelTitleMatches(wikiData.knowledge_graph?.title, comp.name)');
    expect(src).not.toContain('!!(wikiData.knowledge_graph?.title)');
  });
});
