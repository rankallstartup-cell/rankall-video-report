import { describe, it, expect, afterEach } from 'vitest';
import { isInternalAutomationRequest } from '../apiAuth';

function req(headers: Record<string, string>) {
  return new Request('https://x.test/api/content/haro-response', { method: 'POST', headers });
}

const ORIGINAL = process.env.CRON_SECRET;
afterEach(() => { process.env.CRON_SECRET = ORIGINAL; });

describe('isInternalAutomationRequest', () => {
  it('fails closed when CRON_SECRET is unset', () => {
    delete process.env.CRON_SECRET;
    expect(isInternalAutomationRequest(req({ 'x-cron-secret': 'rankall-cron-2026-secure' }))).toBe(false);
    expect(isInternalAutomationRequest(req({ authorization: 'Bearer undefined' }))).toBe(false);
  });
  it('never accepts the old hardcoded literal', () => {
    process.env.CRON_SECRET = 'a-long-random-rotated-secret';
    expect(isInternalAutomationRequest(req({ 'x-cron-secret': 'rankall-cron-2026-secure' }))).toBe(false);
  });
  it('accepts Bearer or the legacy header carrying the env secret', () => {
    process.env.CRON_SECRET = 'a-long-random-rotated-secret';
    expect(isInternalAutomationRequest(req({ authorization: 'Bearer a-long-random-rotated-secret' }))).toBe(true);
    expect(isInternalAutomationRequest(req({ 'x-cron-secret': 'a-long-random-rotated-secret' }))).toBe(true);
    expect(isInternalAutomationRequest(req({ 'x-cron-secret': 'wrong' }))).toBe(false);
  });
});
