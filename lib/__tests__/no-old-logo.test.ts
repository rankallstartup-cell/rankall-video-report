import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

// The old logo was a blue "R" badge next to a "rankall.io" text wordmark.
const PAGES = [
  'app/login/page.tsx', 'app/signup/page.tsx', 'components/SignupForm.tsx',
  'app/forgot-password/page.tsx', 'app/reset-password/page.tsx', 'app/unsubscribe/page.tsx',
  'app/dashboard/client/layout.tsx', 'app/dashboard/layout.tsx', 'app/score/[slug]/page.tsx',
  'app/report/[id]/page.tsx', 'app/r/[id]/page.tsx', 'app/business/[slug]/page.tsx',
  'components/ScoreCardView.tsx', 'app/demo/page.tsx',
  'app/api/og/report/og-image.tsx', 'app/api/og/marketing/og-image.tsx', 'app/[industry]/[city]/opengraph-image.tsx',
];

describe('every page uses the new RankAll logo', () => {
  it.each(PAGES)('%s has no old R badge or rankall.io text logo', (f) => {
    const s = src(f);
    expect(s).not.toMatch(/>R<\/(span|div)>/);
    // A bare "rankall.io" element used as a logo (a URL in a sentence is fine).
    expect(s).not.toMatch(/>rankall(<span[^>]*>\.io<\/span>|\.io)<\//);
  });
  it('pages use the shared Logo; share images use OgLogo', () => {
    expect(src('components/Logo.tsx')).toContain('/rankall-logo-dark.png');
    expect(src('app/login/page.tsx')).toContain('<Logo ');
    expect(src('app/api/og/marketing/og-image.tsx')).toContain('<OgLogo ');
  });
});
