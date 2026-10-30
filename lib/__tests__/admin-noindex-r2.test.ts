import { describe, it, expect } from 'vitest';
import robots from '../../app/robots';
import { metadata } from '../../app/admin/layout';

// Fix round 2: /admin was neither disallowed nor noindex.
describe('/admin is kept out of search', () => {
  it('every robots group disallows /admin/', () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    for (const rule of rules) expect(rule.disallow).toContain('/admin/');
  });
  it('admin layout is noindex with no canonical', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toEqual({ canonical: null });
  });
});
