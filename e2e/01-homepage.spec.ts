import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Rankall/);
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('scan form is visible', async ({ page }) => {
    await page.goto('/');
    const searchInput = page
      .locator('input[placeholder*="scan" i]')
      .or(page.locator('input[placeholder*="best" i]'))
      .or(page.locator('input[placeholder*="HVAC" i]'))
      .or(page.locator('input').first());
    await expect(searchInput.first()).toBeVisible();
  });

  test('trust badges visible', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByText('SSL Encrypted')).toBeVisible();
  });

  test('pricing section visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('119').first()).toBeVisible();
  });

  test('no critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto('/');
    await page.waitForTimeout(2000);
    const criticalErrors = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('analytics'),
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
