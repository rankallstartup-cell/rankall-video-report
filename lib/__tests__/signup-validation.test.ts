// b8ba / b876 — signup plan resolution + account validation.
import { describe, it, expect } from 'vitest';
import { resolveSignupPlan, validateSignupAccount } from '@/lib/signupValidation';

describe('resolveSignupPlan (b876)', () => {
  it('maps every known ?plan= key', () => {
    expect(resolveSignupPlan('personal_pro')).toEqual({ plan: 'Personal Brand', notice: '' });
    expect(resolveSignupPlan('local_pro')).toEqual({ plan: 'Local Business', notice: '' });
    expect(resolveSignupPlan('business')).toEqual({ plan: 'Local Business', notice: '' });
    expect(resolveSignupPlan('product_pro')).toEqual({ plan: 'Product Pro', notice: '' });
    expect(resolveSignupPlan('agency')).toEqual({ plan: 'Agency', notice: '' });
    expect(resolveSignupPlan('free')).toEqual({ plan: 'Free', notice: '' });
    expect(resolveSignupPlan('PERSONAL_PRO')).toEqual({ plan: 'Personal Brand', notice: '' });
  });

  it('defaults to Local Business with no param', () => {
    expect(resolveSignupPlan(null)).toEqual({ plan: 'Local Business', notice: '' });
    expect(resolveSignupPlan(undefined)).toEqual({ plan: 'Local Business', notice: '' });
  });

  it('clears the plan + warns on an unknown value (never a silent paid default)', () => {
    const r = resolveSignupPlan('enterprise');
    expect(r.plan).toBe('');
    expect(r.notice).toContain("We don't offer");
  });
});

describe('validateSignupAccount (b8ba S3)', () => {
  const good = { name: 'Test User', email: 'test@realmail.com', password: 'password123' };
  it('accepts a valid form', () => {
    expect(validateSignupAccount(good)).toBeNull();
  });
  it('rejects empty / spaces-only fields', () => {
    expect(validateSignupAccount({ ...good, name: '   ' })).toBe('Please fill in all fields.');
    expect(validateSignupAccount({ ...good, email: '' })).toBe('Please fill in all fields.');
  });
  it('rejects malformed emails', () => {
    expect(validateSignupAccount({ ...good, email: 'not-an-email' })).toBe('Please enter a valid email address.');
    expect(validateSignupAccount({ ...good, email: 'a@b' })).toBe('Please enter a valid email address.');
  });
  it('rejects reserved domains that can never receive mail', () => {
    expect(validateSignupAccount({ ...good, email: 'test-nonexistent-xyz-12345@example.com' })).toContain('can’t receive mail');
    expect(validateSignupAccount({ ...good, email: 'a@example.org' })).toContain('can’t receive mail');
    expect(validateSignupAccount({ ...good, email: 'a@foo.invalid' })).toContain('can’t receive mail');
  });
  it('rejects short passwords', () => {
    expect(validateSignupAccount({ ...good, password: 'short' })).toBe('Password must be at least 8 characters.');
  });
});
