import { test, expect, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
  await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Admin password not set');
    await loginAsAdmin(page);
  });

  test('dashboard loads without errors', async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('undefined');
  });

  test('sidebar navigation visible', async ({ page }) => {
    await expect(page.getByText('MY BUSINESS').or(page.getByText('Overview')).first()).toBeVisible();
  });

  test('no upgrade gate for admin', async ({ page }) => {
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Upgrade to Local Pro');
    expect(bodyText).not.toContain('Upgrade to unlock');
  });

  test('fix engine page loads', async ({ page }) => {
    await page.goto('/dashboard/fix');
    await expect(page).toHaveURL(/fix/);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('undefined');
  });

  test('admin pages accessible', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/admin/);
    await expect(
      page.getByText(/Admin Dashboard/i).or(page.getByText(/Platform Health/i)).first(),
    ).toBeVisible({ timeout: 10000 });
  });
});
