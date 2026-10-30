import { test, expect } from '@playwright/test';
import { uxTeam } from './fixtures/admin-records';

for (const locale of ['en-US', 'es-MX'])
  test(`Team access explains pending provider authorization in ${locale}`, async ({ page }) => {
    const preferences = await (await page.request.get('/api/admin/preferences')).json();
    await page.request.post('/api/admin/preferences', {
      headers: { Origin: 'http://127.0.0.1:4321' },
      data: { ...preferences, locale },
    });
    let saves = 0;
    await page.route('**/api/admin/team', async (route) => {
      if (route.request().method() === 'GET')
        return route.fulfill({ json: [{ ...uxTeam[1], identity_bound: 0 }] });
      saves++;
      return route.fulfill({ json: { saved: true } });
    });
    try {
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/admin/team');
        await expect(page.locator('[data-team-access-notice]')).toContainText(
          locale === 'es-MX' ? 'no envía una invitación' : 'does not send an invitation',
        );
        await expect(page.locator('[data-record-id]:visible')).toContainText(
          locale === 'es-MX'
            ? 'En espera del inicio de sesión verificado'
            : 'Awaiting verified sign-in',
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page
          .getByRole('button', {
            name: locale === 'es-MX' ? 'Editar acceso' : 'Edit access',
            exact: true,
          })
          .click();
        await expect(page.locator('[data-team-access-notice]')).toContainText(
          locale === 'es-MX' ? 'no se envían invitaciones' : 'no invitation email is sent',
        );
        await expect(page.locator('input[name=active]')).toHaveAccessibleName(
          locale === 'es-MX'
            ? 'Habilitar el acceso a la aplicación.'
            : 'Enable application access.',
        );
        await page.locator('button[type=submit]').click();
        await expect(page.getByRole('status')).toContainText('Cloudflare Access');
        await expect(page.locator('[data-team-access-notice]')).toBeVisible();
      }
      expect(saves).toBe(2);
    } finally {
      await page.request.post('/api/admin/preferences', {
        headers: { Origin: 'http://127.0.0.1:4321' },
        data: preferences,
      });
    }
  });
