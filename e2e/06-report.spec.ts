import { test, expect } from '@playwright/test';

// A known scan id used for read-only report checks.
const SCAN_ID = process.env.TEST_SCAN_ID || 'f843844a-9b55-4a66-b954-d99ea2daea6b';

test.describe('Report Page', () => {
  test('report loads with a valid scan ID', async ({ page }) => {
    await page.goto(`/report/${SCAN_ID}`);
    // Wait for the report to finish loading (up to 15s) rather than a fixed 3s.
    await page
      .waitForFunction(
        () => {
          const text = document.body.innerText;
          return !text.includes('Loading report') && text.length > 500;
        },
        { timeout: 15000 },
      )
      .catch(() => {});
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(500);
    expect(bodyText).not.toContain('undefined');
    expect(bodyText).not.toContain('NaN');
  });

  test('report shows an executive summary section', async ({ page }) => {
    await page.goto(`/report/${SCAN_ID}`);
    await page.waitForTimeout(3000);
    await expect(page.getByText(/situation|glance|summary/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('report shows a fix section', async ({ page }) => {
    await page.goto(`/report/${SCAN_ID}`);
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Fix/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('invalid scan ID shows an error/not-found state', async ({ page }) => {
    await page.goto('/report/invalid-scan-id-123');
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/not found|expired|invalid|error/);
  });
});
