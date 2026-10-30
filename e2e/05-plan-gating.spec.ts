import { test, expect } from '@playwright/test';

test.describe('Plan Gating', () => {
  test('pricing page shows the plans', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Personal Pro').first()).toBeVisible();
    await expect(page.getByText('Business').first()).toBeVisible();
    await expect(page.getByText('Agency').first()).toBeVisible();
  });

  test('pricing shows founding member prices', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('49').first()).toBeVisible();
    await expect(page.getByText('119').first()).toBeVisible();
    await expect(page.getByText('599').first()).toBeVisible();
  });

  test('pricing shows crossed-out original prices', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('79').or(page.getByText('179')).first()).toBeVisible();
  });

  test('admin sees no upgrade gate after scanning', async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Admin credentials not set');
    test.skip(!process.env.RUN_SCAN_TESTS, 'Skipped in CI unless RUN_SCAN_TESTS=true (real scan = live LLM cost)');
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
    await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
    await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    await page.goto('/');
    await page.locator('input').first().fill(process.env.TEST_SCAN_QUERY || 'best dentist in Chicago IL');
    await page.getByText(/Scan/i).first().click();
    await page.waitForFunction(() => document.body.innerText.includes('/100'), { timeout: 60000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('Upgrade to unlock');
    expect(bodyText).not.toContain('Upgrade to Local Pro');
  });
});
