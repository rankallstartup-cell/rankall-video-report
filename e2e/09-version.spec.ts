import { test, expect } from '@playwright/test';

test.describe('System Health', () => {
  test('version endpoint returns a commit', async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/version`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.commit).toBeTruthy();
    expect(json.commit).not.toBe('unknown');
    expect(json.env).toBe('production');
  });

  test('platform health check passes', async ({ page, request, baseURL }) => {
    test.skip(!process.env.TEST_ADMIN_PASSWORD, 'Admin credentials not set');
    // Authenticate through the UI so the admin cookie is set on the context.
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(process.env.TEST_ADMIN_EMAIL || 'rankallstartup@gmail.com');
    await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || '');
    await page.locator('button[type="submit"]').or(page.getByText(/sign in/i)).first().click();
    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    const res = await request.get(`${baseURL}/api/admin/health/platforms`);
    const json = await res.json();
    expect(json.kimi?.success).toBe(true);
  });
});
