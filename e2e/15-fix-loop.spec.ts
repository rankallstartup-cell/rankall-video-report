import { test, expect, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
  await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

test.describe('Auto Fix Loop', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Needs admin credentials');
    await loginAsAdmin(page);
  });

  test('fix page loads with fix content', async ({ page }) => {
    await page.goto('/dashboard/fix');
    await page.waitForTimeout(5000);
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toMatch(/fix|schema|faq/);
    expect(body).not.toContain('undefined');
  });

  test('pending fixes API works', async ({ page }) => {
    const res = await page.request.get('/api/fixes/pending');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.fixes)).toBe(true);
  });

  test('approved fixes API works', async ({ page }) => {
    const res = await page.request.get('/api/fixes/pending?status=approved');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.fixes)).toBe(true);
  });

  test('applied fixes API works', async ({ page }) => {
    const res = await page.request.get('/api/fixes/pending?status=applied');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.fixes)).toBe(true);
  });

  test('pending count API works', async ({ page }) => {
    const res = await page.request.get('/api/fixes/pending-count');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(typeof json.count).toBe('number');
  });

  test('fix review API accepts valid actions', async ({ page }) => {
    // A fake id with a valid action must be rejected as 404 (not found), NOT 400
    // (invalid request) — which proves 'approved' is an accepted action.
    const res = await page.request.post('/api/fixes/review', {
      data: { id: '00000000-0000-0000-0000-000000000000', action: 'approved' },
    });
    expect([200, 404]).toContain(res.status());
  });

  test('score history page loads', async ({ page }) => {
    await page.goto('/dashboard/score-history');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
  });

  test('referrals page loads', async ({ page }) => {
    await page.goto('/referrals');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/referral|earn|commission|link/);
  });
});
