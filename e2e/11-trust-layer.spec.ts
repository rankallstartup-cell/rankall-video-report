import { test, expect, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
  await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

test.describe('Trust Layer', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Admin password not set');
    await loginAsAdmin(page);
  });

  test('trust layer page loads', async ({ page }) => {
    await page.goto('/dashboard/trust');
    await expect(page).toHaveURL(/trust/);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('undefined');
  });

  test('trust layer shows signals', async ({ page }) => {
    await page.goto('/dashboard/trust');
    await page.waitForTimeout(2000);
    await expect(page.getByText(/Trust|signal|score/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('trust layer links to fix tools', async ({ page }) => {
    await page.goto('/dashboard/trust');
    await page.waitForTimeout(2000);
    const fixLink = page.getByRole('link', { name: /fix/i }).or(page.getByText(/Fix/i));
    await expect(fixLink.first()).toBeVisible({ timeout: 10000 });
  });
});
