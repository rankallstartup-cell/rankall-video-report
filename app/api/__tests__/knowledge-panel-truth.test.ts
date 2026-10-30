import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// b02d: (1) page fallback claimed +25 for a never-checked panel;
// (2) a Wikidata ID alone counted as "claimed"; (3) "15+" advice figure.
const src = readFileSync(join(process.cwd(), 'app/report/[id]/page.tsx'), 'utf8');
const cardSrc = readFileSync(join(process.cwd(), 'components/KnowledgePanelCard.tsx'), 'utf8');
const libSrc = readFileSync(join(process.cwd(), 'lib/knowledgePanel.ts'), 'utf8');

describe('knowledge panel overclaims — b02d', () => {
  it('page fallback for a never-checked panel is 0 + not checked', () => {
    expect(src).toContain("score_contribution: 0, error: 'not checked',");
    expect(src).not.toContain('score_contribution: 25, error: null,');
    // No measured-verdict missing-fields list for an unchecked panel.
    expect(src).not.toContain("'No Knowledge Panel found',\n              'Google has not verified this entity',");
    // No causal competitor claim for an unchecked panel.
    expect(src).toContain('!kpData.exists && !kpData.error && scan?.competitor_name');
  });

  it('card renders a not-checked state, not "Not Found"', () => {
    expect(cardSrc).toContain("not_checked");
    expect(cardSrc).toContain('Not Checked');
    expect(cardSrc).toContain('Rescan to check it');
    // Missing-fields list suppressed for not-checked (nothing measured).
    expect(cardSrc).toContain("status !== 'verified' && status !== 'not_checked'");
    // Any non-null error (except the deliberate unconfigured hide) is
    // not-checked, not a measured "Not Found".
    expect(cardSrc).toContain("error && error !== 'SerpAPI not configured' ? 'not_checked'");
  });

  it('Wikidata ID alone does not imply claimed; 15+ is advice copy', () => {
    expect(libSrc).toContain('const claimed = !!(kg.claimed || kg.owner_verified);');
    expect(libSrc).not.toContain('|| wikiDataId');
    expect(libSrc).not.toContain('Build 15+ directory citations');
    expect(libSrc).toContain('Build directory citations to strengthen entity presence');
  });
});

describe('detectKnowledgePanel — b02d behaviour', () => {
  beforeEach(() => {
    process.env.SERPAPI_KEY = 'test-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SERPAPI_KEY;
  });

  const fullKg = (over: Record<string, unknown> = {}) => ({
    title: 'Bright Smile Dental',
    description: 'A dental practice.',
    image: { image_url: 'https://example.com/photo.jpg' },
    type: 'Dentist',
    sub_types: ['Dental clinic'],
    profiles: { a: { link: 'https://x.com/a' }, b: { link: 'https://fb.com/b' } },
    website: 'https://brightsmile.example',
    wikidata_id: 'Q123',
    ...over,
  });

  it('Wikidata ID without claimed/owner_verified is NOT claimed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ knowledge_graph: fullKg() }),
    }));
    const { detectKnowledgePanel } = await import('@/lib/knowledgePanel');
    const r = await detectKnowledgePanel('Bright Smile Dental', 'dentist', 'Austin');
    expect(r.exists).toBe(true);
    expect(r.wikiDataId).toBe('Q123');
    expect(r.claimed).toBe(false);
    // Unclaimed + complete -> 8, not the claimed 25.
    expect(r.score_contribution).toBe(8);
  });

  it('claimed=true still counts as claimed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ knowledge_graph: fullKg({ claimed: true }) }),
    }));
    const { detectKnowledgePanel } = await import('@/lib/knowledgePanel');
    const r = await detectKnowledgePanel('Bright Smile Dental', 'dentist', 'Austin');
    expect(r.claimed).toBe(true);
    expect(r.score_contribution).toBe(25);
  });

  it('no panel found is 0 with advice copy, no 15+', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }));
    const { detectKnowledgePanel } = await import('@/lib/knowledgePanel');
    const r = await detectKnowledgePanel('Bright Smile Dental', 'dentist', 'Austin');
    expect(r.exists).toBe(false);
    expect(r.score_contribution).toBe(0);
    expect(r.missingFields.join(' ')).not.toContain('15+');
    expect(r.missingFields).toContain('Build directory citations to strengthen entity presence');
  });
});
