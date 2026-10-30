import { test, expect } from '@playwright/test';

const QUERY = process.env.TEST_SCAN_QUERY || 'best dentist in Chicago IL';

async function runScan(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.locator('input').first().fill(QUERY);
  await page.getByText(/Scan/i).first().click();
  await page.waitForFunction(
    () => {
      const body = document.body.innerText;
      return body.includes('Score') || body.includes('/100') || body.includes('platforms');
    },
    { timeout: 60000 },
  );
}

const SCAN_SKIP = 'Skipped in CI unless RUN_SCAN_TESTS=true (real scan = live LLM cost)';

test.describe('Scan Flow', () => {
  test('can run a scan and see results', async ({ page }) => {
    test.skip(!process.env.RUN_SCAN_TESTS, SCAN_SKIP);
    await runScan(page);
    await expect(page.getByText(/\/100/).first()).toBeVisible({ timeout: 60000 });
  });

  test('scan shows content (competitor / results)', async ({ page }) => {
    test.skip(!process.env.RUN_SCAN_TESTS, SCAN_SKIP);
    await runScan(page);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(100);
  });

  test('scan does not show raw errors', async ({ page }) => {
    test.skip(!process.env.RUN_SCAN_TESTS, SCAN_SKIP);
    await runScan(page);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('NaN');
    expect(bodyText).not.toContain('Error:');
  });

  test('mobile scan input works without overflow', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile only test');
    await page.goto('/');
    await expect(page.locator('input').first()).toBeVisible();
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });
});
