import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('invalid login stays on login page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('invalid@test.com');
    await page.locator('input[type="password"]').fill('wrongpassword123');
    await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
    await page.waitForTimeout(3000);
    // Invalid credentials must NOT reach the dashboard; the user stays on /login
    // (Supabase may show a toast or nothing, so we assert on the URL, not text).
    expect(page.url()).not.toContain('/dashboard');
    expect(page.url()).toMatch(/login|auth|signin/);
  });

  test('admin can log in and see dashboard', async ({ page }) => {
    test.skip(
      !process.env.TEST_ADMIN_EMAIL || !process.env.TEST_ADMIN_PASSWORD,
      'Admin credentials not set',
    );
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL!);
    await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD!);
    await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    await expect(page).toHaveURL(/dashboard/);
  });
});
