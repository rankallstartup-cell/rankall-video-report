import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { refundClaimsOrFilter, refundAlreadyClaimed } from '../moneyBack';
import { chargeIdentityKey, emailIdentityKey } from '../paymentIdentity';

describe('refund eligibility uses the same payer key as the refund (F)', () => {
  it('a Link payer (no card fingerprint) who already claimed is ineligible', () => {
    const linkCharge = { payment_method_details: { card: null }, billing_details: { email: 'Payer@Example.com' } };
    const key = chargeIdentityKey(linkCharge);
    expect(key).toBe(emailIdentityKey('payer@example.com'));
    const claims = [{ user_id: 'other-user', card_fingerprint: key }];
    expect(refundAlreadyClaimed(claims, 'new-user', key)).toBe(true);
  });
  it('or() filter quotes the key and falls back to user id only', () => {
    expect(refundClaimsOrFilter('u1', 'email:abc')).toBe('user_id.eq.u1,card_fingerprint.eq."email:abc"');
    expect(refundClaimsOrFilter('u1', null)).toBe('user_id.eq.u1');
  });
  it('both routes use chargeIdentityKey + refundClaimsOrFilter', () => {
    for (const f of ['app/api/billing/refund-eligibility/route.ts', 'app/api/billing/refund/route.ts']) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      expect(src).toContain('chargeIdentityKey(');
      expect(src).toContain('refundClaimsOrFilter(user.id,');
      expect(src).not.toContain('chargeCardFingerprint(');
    }
  });
});
