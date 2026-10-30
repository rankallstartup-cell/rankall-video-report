import { test, expect, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
  await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

test.describe('Admin Pages', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Needs admin credentials');
    await loginAsAdmin(page);
  });

  test('admin dashboard loads', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/admin|scan|platform/);
  });

  test('QA checklist loads', async ({ page }) => {
    await page.goto('/admin/qa-checklist');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/qa|test|check/);
  });

  test('launch readiness loads', async ({ page }) => {
    await page.goto('/admin/launch-readiness');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
  });

  test('plan switcher loads', async ({ page }) => {
    await page.goto('/admin/plan-switcher');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/plan|switch|business|agency/);
  });

  test('data quality dashboard loads', async ({ page }) => {
    await page.goto('/admin/data-quality');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/quality|issue|quarantine/);
  });

  test('scan accuracy page loads', async ({ page }) => {
    await page.goto('/admin/scan-accuracy');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
  });

  test('platform health shows platforms working', async ({ page }) => {
    const res = await page.request.get('/api/admin/health/platforms');
    const json = await res.json();
    expect(json.gemini?.success).toBe(true);
    expect(json.kimi?.success).toBe(true);
    expect(json.timestamp).toBeTruthy();
  });

  test('non-admin cannot access admin pages', async ({ page, context }) => {
    // Clear the session, then try to reach an admin page.
    await context.clearCookies();
    await page.goto('/admin/dashboard');
    await page.waitForTimeout(2000);
    const url = page.url();
    const body = (await page.locator('body').innerText()).toLowerCase();
    const blocked = !url.includes('/admin/dashboard') || /access denied|sign in|log in|unauthor/.test(body);
    expect(blocked).toBe(true);
  });
});
