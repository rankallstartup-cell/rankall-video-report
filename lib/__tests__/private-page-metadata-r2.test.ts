import { describe, it, expect } from 'vitest';
import { metadata as reportMeta } from '../../app/report/[id]/layout';
import { metadata as shareMeta } from '../../app/r/[id]/layout';

// Fix round 2: private pages inherited the root self-canonical + og:url.
describe.each([
  ['/report/[id]', reportMeta],
  ['/r/[id]', shareMeta],
])('%s metadata', (_route, m) => {
  it('noindex', () => {
    expect(m.robots).toEqual({ index: false, follow: false });
  });
  it('replaces the inherited canonical with null', () => {
    expect(m.alternates).toEqual({ canonical: null });
  });
  it('defines its own openGraph object with no url', () => {
    expect(m.openGraph).toBeTruthy();
    expect((m.openGraph as Record<string, unknown>).url).toBeUndefined();
  });
});

describe('report title', () => {
  it('uses title.absolute (no doubled Rankall.io)', () => {
    const t = reportMeta.title as { absolute: string };
    expect(t.absolute).toBe('AI Visibility Report | Rankall.io');
    expect(t.absolute.match(/Rankall\.io/g)?.length).toBe(1);
  });
});
