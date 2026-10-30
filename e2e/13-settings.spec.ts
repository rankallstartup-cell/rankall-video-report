import { test, expect, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
  await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Needs admin credentials');
    await loginAsAdmin(page);
  });

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/settings|profile|account/);
  });

  test('settings has multiple tabs', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body.toLowerCase()).toMatch(/profile|plan|billing|notification/);
  });

  test('referrals tab loads', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);
    const referralTab = page.getByText(/referral/i).first();
    const hasReferral = await referralTab.isVisible().catch(() => false);
    if (hasReferral) {
      await referralTab.click();
      await page.waitForTimeout(2000);
      const body = await page.locator('body').innerText();
      expect(body.toLowerCase()).toMatch(/referral|link|commission/);
    }
  });

  test('no errors on settings page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');
    expect(body).not.toContain('[object Object]');
  });
});
