import { test, expect } from '@playwright/test';

const SCAN_ID = process.env.TEST_SCAN_ID || 'f843844a-9b55-4a66-b954-d99ea2daea6b';

test.describe('Score Consistency', () => {
  test('version endpoint healthy', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/version`);
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.commit).not.toBe('unknown');
  });

  test('report page score is a valid number', async ({ page }) => {
    await page.goto(`/report/${SCAN_ID}`);
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
    const body = await page.locator('body').innerText();

    const scoreMatch = body.match(/(\d+)\/100/);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThan(101);
    }

    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');
    // Old hardcoded values that Phase 4.1 replaced with real derived numbers.
    expect(body).not.toContain('89% confidence');
    expect(body).not.toContain('+23 points');
  });

  test('report does not show the raw query as the business name', async ({ page }) => {
    await page.goto(`/report/${SCAN_ID}`);
    await page.waitForTimeout(5000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('"best dentist in');
    expect(body).not.toContain('name: "best');
  });

  test('pricing page shows correct founding member prices', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toContain('49');
    expect(body).toContain('119');
    expect(body).toContain('599');
    expect(body).toContain('79');
    expect(body).toContain('179');
    expect(body.toLowerCase()).toMatch(/september|sept|founding|countdown/);
  });
});
