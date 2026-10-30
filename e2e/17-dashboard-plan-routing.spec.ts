import { test, expect, type Page } from '@playwright/test';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
  await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
  await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

async function switchPlan(page: Page, planButtonText: RegExp) {
  await page.goto('/admin/plan-switcher');
  await page.waitForSelector('text=Plan Switcher', { timeout: 10000 });

  page.on('dialog', dialog => dialog.accept());

  const btn = page.locator('button', { hasText: planButtonText });
  await btn.click();

  await page.waitForTimeout(2000);
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
}

test.describe('Dashboard plan routing — admin plan switcher', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Admin password not set');
    await loginAsAdmin(page);
  });

  test('Local Business plan shows business dashboard, no agency redirect', async ({ page }) => {
    await switchPlan(page, /Local Business/);

    await expect(page).toHaveURL(/\/dashboard$/);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Total Clients');
    expect(body).not.toContain('Add new client');
    expect(body).toContain('Testing as: Local Business');
  });

  test('Personal Brand plan shows personal brand dashboard, no agency redirect', async ({ page }) => {
    await switchPlan(page, /Personal Brand/);

    await expect(page).toHaveURL(/\/dashboard$/);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Total Clients');
    expect(body).not.toContain('Add new client');
    expect(body).toContain('Testing as: Personal Brand');
  });

  test('Agency plan shows agency dashboard and redirects', async ({ page }) => {
    await switchPlan(page, /Agency · \$499/);

    await expect(page).toHaveURL(/\/dashboard\/agency/);
    expect(await page.locator('body').innerText()).toContain('Testing as: Agency');
  });

  test.afterAll(async ({ browser }) => {
    if (!process.env.TEST_ADMIN_PASSWORD) return;
    const page = await browser.newPage();
    await loginAsAdmin(page);
    await switchPlan(page, /Local Business/);
    await page.close();
  });
});
