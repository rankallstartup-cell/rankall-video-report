import { test, expect } from '@playwright/test';

test.describe('Admin Access', () => {
  test('non-logged-in user cannot access admin', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await page.waitForTimeout(2000);
    // Either redirected away, or shown an access-denied state.
    const url = page.url();
    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    const blocked = !url.includes('/admin/dashboard') || /access denied|sign in|log in|unauthor/.test(bodyText);
    expect(blocked).toBe(true);
  });

  test('admin qa checklist loads', async ({ page }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Admin credentials not set');
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
    await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
    await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    await page.goto('/admin/qa-checklist');
    await expect(page.getByText(/QA|Health Check|Checklist/i).first()).toBeVisible({ timeout: 10000 });
  });
});
