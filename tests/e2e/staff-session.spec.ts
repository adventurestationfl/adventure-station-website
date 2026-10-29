import { test, expect } from '@playwright/test';

for (const locale of ['en-US', 'es-MX'])
  test(`ended staff session preserves unsaved fields and offers sign-in in ${locale}`, async ({
    page,
  }) => {
    const preferences = await (await page.request.get('/api/admin/preferences')).json();
    await page.request.post('/api/admin/preferences', {
      headers: { Origin: 'http://127.0.0.1:4321' },
      data: { ...preferences, locale },
    });
    let writes = 0;
    try {
      await page.goto('/admin/workshops');
      await page.locator('[data-action=new-workshop]').click();
      const draftName = 'Synthetic unsaved session draft';
      await page.locator('input[name=name]').fill(draftName);
      await page.locator('input[name=slug]').fill('synthetic-unsaved-session-draft');
      await page.route('**/api/admin/workshops', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        writes++;
        expect(route.request().headers()['x-requested-with']).toBe('XMLHttpRequest');
        return route.fulfill({ status: 401, contentType: 'text/html', body: 'Unauthorized' });
      });
      await page.locator('button[type=submit]').click();
      await expect(page.getByRole('status')).toContainText(
        locale === 'es-MX' ? 'Tu sesión terminó.' : 'Your sign-in has ended.',
      );
      await expect(page.locator('#admin-session-help')).toBeVisible();
      const signIn = page.locator('#admin-session-help a');
      await expect(signIn).toHaveAttribute('href', '/admin/settings');
      await expect(signIn).toHaveAttribute('target', '_blank');
      await expect(signIn).toHaveAccessibleName(
        locale === 'es-MX' ? 'Volver a iniciar sesión ↗' : 'Sign in again ↗',
      );
      await expect(page.locator('input[name=name]')).toHaveValue(draftName);
      await expect(page.locator('button[type=submit]')).toBeEnabled();
      expect(writes).toBe(1);
      // A normal authorization denial stays distinct from an ended Access session.
      await page.unroute('**/api/admin/workshops');
      await page.route('**/api/admin/workshops', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        writes++;
        return route.fulfill({
          status: 403,
          json: { error: 'Your role does not allow this action.' },
        });
      });
      await page.reload();
      await page.locator('[data-action=new-workshop]').click();
      await page.locator('input[name=name]').fill(draftName);
      await page.locator('input[name=slug]').fill('synthetic-unsaved-session-draft');
      await page.locator('button[type=submit]').click();
      await expect(page.getByRole('status')).toContainText(
        locale === 'es-MX' ? 'Tu rol no permite' : 'Your role does not allow',
      );
      await expect(page.locator('#admin-session-help')).toBeHidden();
      expect(writes).toBe(2);
    } finally {
      await page.request.post('/api/admin/preferences', {
        headers: { Origin: 'http://127.0.0.1:4321' },
        data: preferences,
      });
    }
  });
