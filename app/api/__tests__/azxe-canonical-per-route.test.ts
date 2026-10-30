import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveAbsoluteUrlWithPathname } = require('next/dist/lib/metadata/resolvers/resolve-url');

// azxe regression: the root layout's canonical is './'. This pins the Next 16
// resolver behaviour we rely on — './' resolves against EACH route's own
// pathname, so the homepage gets the bare origin and every other page a
// self-canonical, instead of every page pointing at the homepage.
describe("azxe: root canonical './' resolves per route", () => {
  const base = new URL('https://rankall.io');
  const resolve = (pathname: string) =>
    resolveAbsoluteUrlWithPathname('./', base, pathname, { trailingSlash: false });

  it('homepage → origin', () => {
    expect(resolve('/')).toBe('https://rankall.io');
  });
  it('dynamic routes → their own path, not the homepage', () => {
    expect(resolve('/score/joes-pizza')).toBe('https://rankall.io/score/joes-pizza');
    expect(resolve('/reports/abc-123')).toBe('https://rankall.io/reports/abc-123');
    expect(resolve('/join')).toBe('https://rankall.io/join');
  });
});
