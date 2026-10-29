import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const prefs = (page: any, locale = 'en-US', encouragement = 'shown') =>
  page.request.post('/api/admin/preferences', {
    data: { locale, encouragement },
    headers: { Origin: 'http://127.0.0.1:4321' },
  });
test.afterEach(async ({ page }) => {
  await prefs(page);
});
for (const width of [320, 360, 390, 768, 1024, 1440, 1920])
  test(`bilingual public and companion layouts at ${width}px`, async ({ page }, info) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    for (const locale of ['en-US', 'es-MX']) {
      await prefs(page, locale);
      for (const path of [
        '/',
        '/workshops',
        '/workshops/paper-garden-preview',
        '/register/preview-paper-1',
        '/about',
        '/faq',
        '/contact',
        '/policies',
        '/registration/not-a-booking',
      ]) {
        const response = await page.goto((locale === 'es-MX' ? '/es' : '') + path);
        expect(response!.status()).toBe(200);
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.locator('body')).not.toContainText('Made with love by your Bro');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          locale + path,
        ).toBe(true);
      }
      for (const path of [
        '/admin/creative',
        '/admin/settings',
        '/admin/activity',
        '/admin/connections',
      ]) {
        await page.goto(path);
        await expect(page.locator('#workspace h1')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('.admin-signature')).toHaveText(
          'Made with love by your Bro · 2026',
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          locale + path,
        ).toBe(true);
        if (width === 390 && path === '/admin/creative') {
          await page.screenshot({
            path: info.outputPath('creative-' + locale + '.png'),
            fullPage: true,
          });
          const axe = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze();
          expect(axe.violations).toEqual([]);
        }
      }
    }
    expect(errors).toEqual([]);
  });
test('Creative Spark saves, dismisses, restores and creates an editable bilingual draft', async ({
  page,
}) => {
  await prefs(page);
  await page.goto('/admin/creative');
  const title = await page.locator('.spark-idea h2').textContent();
  await page.getByRole('button', { name: 'Save idea', exact: true }).click();
  await expect(page.locator('.saved-ideas')).toContainText(title!);
  await page.locator('.spark-idea').getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.locator('.spark-idea h2')).not.toHaveText(title!);
  await page.getByText('Dismissed ideas', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
  await page
    .locator('.spark-idea')
    .getByRole('button', { name: 'Create workshop draft', exact: true })
    .click();
  await page.locator('#spark-draft-price').fill('21.37');
  await page.locator('#spark-draft-capacity').fill('7');
  await page.getByRole('button', { name: 'Prepare editable draft', exact: true }).click();
  await expect(page.getByLabel('Workshop name', { exact: true })).toBeVisible();
  await expect(page.locator('select[name=status]')).toHaveValue('draft');
});
test('personal language preference persists and Spanish content editing shares workshop facts', async ({
  page,
}) => {
  await prefs(page, 'es-MX', 'minimized');
  await page.goto('/admin/settings');
  await expect(page.locator('#locale')).toHaveValue('es-MX');
  await expect(page.locator('#workspace h1')).toHaveText('Preferencias personales');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es-MX');
  await page.goto('/es/workshops/paper-garden-preview');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Jardín de papel — ejemplo de vista previa',
  );
  const en = page.locator('.language-choice').getByRole('link', { name: 'English', exact: true });
  await expect(en).toHaveAttribute('href', '/workshops/paper-garden-preview');
});
test('AI configuration remains honestly disabled and activity has person filters', async ({
  page,
}) => {
  await prefs(page);
  await page.goto('/admin/connections');
  await expect(
    page.getByRole('heading', { name: 'Connection testing is disabled', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('No AI client has been authorized.', { exact: true })).toBeVisible();
  await expect(page.locator('#connection-url')).toHaveCount(0);
  await page.goto('/admin/activity');
  await expect(page.getByLabel('Person', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Cloudflare Access maintains separate sign-in records.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Filter activity', exact: true }).click();
  await expect(page.locator('.activity-list')).toBeVisible();
});

test('Spanish required-field feedback uses the selected admin language', async ({ page }) => {
  await prefs(page, 'es-MX');
  await page.goto('/admin/workshops');
  await page.getByRole('button', { name: '+ Crear taller', exact: true }).click();
  await page.locator('button[type=submit]').click();
  expect(await page.locator('#name').evaluate((e: HTMLInputElement) => e.validationMessage)).toBe(
    'Revisa este campo.',
  );
});
