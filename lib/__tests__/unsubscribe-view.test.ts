import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { initialUnsubscribeView } from '../unsubscribeView';

describe('/unsubscribe first screen — b8be', () => {
  it('a bare visit explains how to unsubscribe instead of claiming success', () => {
    expect(initialUnsubscribeView('', '', false)).toBe('missing');
    expect(initialUnsubscribeView('a@b.com', '', false)).toBe('missing');
    expect(initialUnsubscribeView('', 'tok', false)).toBe('missing');
  });
  it('a signed link asks for confirmation first', () => {
    expect(initialUnsubscribeView('a@b.com', 'tok', false)).toBe('confirm');
  });
  it('the API redirect shows the done screen', () => {
    expect(initialUnsubscribeView('a@b.com', '', true)).toBe('done');
  });
  it('the page does not call the API on load', () => {
    const src = readFileSync(join(process.cwd(), 'app/unsubscribe/page.tsx'), 'utf8');
    expect(src).not.toContain('useEffect');
    expect(src).toContain('onClick={confirm}');
  });
});
