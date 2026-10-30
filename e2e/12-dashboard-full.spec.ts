import { test, expect, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
  await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

test.describe('Dashboard Full', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Needs admin credentials');
    await loginAsAdmin(page);
  });

  test('overview page loads', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('NaN');
    expect(body.length).toBeGreaterThan(200);
  });

  test('AI platforms page loads', async ({ page }) => {
    await page.goto('/dashboard/platforms');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/chatgpt|gemini|perplexity|platform/);
  });

  test('fix engine loads', async ({ page }) => {
    await page.goto('/dashboard/fix');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/fix|schema|faq/);
  });

  test('trust layer loads', async ({ page }) => {
    await page.goto('/dashboard/trust');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/trust|signal/);
  });

  test('competitor intel loads', async ({ page }) => {
    await page.goto('/dashboard/competitor');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
  });

  test('score history loads', async ({ page }) => {
    await page.goto('/dashboard/score-history');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
  });

  test('AI inbox loads', async ({ page }) => {
    await page.goto('/dashboard/ai-inbox');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
  });

  test('simulator loads', async ({ page }) => {
    await page.goto('/dashboard/simulator');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
  });

  test('billing page loads', async ({ page }) => {
    await page.goto('/dashboard/billing');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
    expect(body.toLowerCase()).toMatch(/billing|plan|subscription/);
  });

  test('ROI calculator loads', async ({ page }) => {
    await page.goto('/dashboard/roi');
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('undefined');
  });

  test('no upgrade gates on any dashboard page for admin', async ({ page }) => {
    const pages = ['/dashboard', '/dashboard/fix', '/dashboard/trust', '/dashboard/competitor', '/dashboard/ai-inbox'];
    for (const url of pages) {
      await page.goto(url);
      await page.waitForTimeout(2000);
      const body = await page.locator('body').innerText();
      expect(body).not.toContain('Upgrade to Local Pro');
      expect(body).not.toContain('Upgrade to unlock');
    }
  });

  test('sidebar shows correct nav groups', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/MY BUSINESS|Overview/i);
    expect(body).toMatch(/IMPROVE|Fix Engine/i);
    expect(body).toMatch(/ACCOUNT|Billing/i);
  });
});
