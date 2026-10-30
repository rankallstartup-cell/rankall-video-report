import { test, expect } from '@playwright/test';

test.describe('Mobile Layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('homepage has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('pricing page readable on mobile', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Business').first()).toBeVisible();
    await expect(page.getByText('119').first()).toBeVisible();
  });

  test('scan input visible + tappable on mobile', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input').first();
    await expect(input).toBeVisible();
    const box = await input.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(36);
  });
});
