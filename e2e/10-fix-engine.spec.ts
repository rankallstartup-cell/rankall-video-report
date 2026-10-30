import { test, expect, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
  await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

test.describe('Fix Engine', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Admin password not set');
    await loginAsAdmin(page);
  });

  test('fix engine page loads without errors', async ({ page }) => {
    await page.goto('/dashboard/fix');
    await expect(page).toHaveURL(/fix/);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('NaN');
  });

  test('fix engine shows fix tools', async ({ page }) => {
    await page.goto('/dashboard/fix');
    await expect(page.getByText(/Fix Engine/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('generated content is not raw or malformed', async ({ page }) => {
    await page.goto('/dashboard/fix');
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    // Never surface the internal search-query-as-name bug or template leftovers.
    expect(bodyText).not.toContain('YOUR_BUSINESS_NAME best');
    expect(bodyText).not.toContain('undefined');
  });

  // Real scan → generation → review; costs live LLM calls, so gate it.
  test('a fresh scan produces reviewable fixes', async ({ page }) => {
    test.skip(!process.env.RUN_SCAN_TESTS, 'Skipped in CI unless RUN_SCAN_TESTS=true (real scan = live LLM cost)');
    await page.goto('/');
    await page.locator('input').first().fill(process.env.TEST_SCAN_QUERY || 'best dentist in Chicago IL');
    await page.getByText(/Scan/i).first().click();
    await page.waitForFunction(() => document.body.innerText.includes('/100'), { timeout: 60000 });
    // Give the post-scan auto-generation a moment, then check the fix page.
    await page.waitForTimeout(20000);
    await page.goto('/dashboard/fix');
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('undefined');
  });
});
