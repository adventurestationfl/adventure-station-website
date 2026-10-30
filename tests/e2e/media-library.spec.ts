import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { localStaffRole } from './fixtures/local-role';
const origin = 'http://127.0.0.1:4321';
test.afterEach(async ({ page }) => {
  await localStaffRole(page.request, 'owner');
  await page.request.post('/api/admin/preferences', {
    headers: { Origin: origin },
    data: { locale: 'en-US', encouragement: 'shown' },
  });
});
for (const locale of ['en-US', 'es-MX'])
  for (const width of [320, 390, 768, 1440])
    test(`media uploads, reuse, focus and trash in ${locale} at ${width}px`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await localStaffRole(page.request, 'owner');
      await page.request.post('/api/admin/preferences', {
        headers: { Origin: origin },
        data: { locale, encouragement: 'shown' },
      });
      const spanish = locale === 'es-MX',
        tag = `Media-${Date.now()}-${width}-${info.project.name}`;
      await page.goto('/admin/media');
      await expect(page.locator('#workspace h1')).toHaveText(
        spanish ? 'Biblioteca de imágenes' : 'Media Library',
      );
      await page.locator('#library-upload').click();
      await page
        .locator('#media-files')
        .setInputFiles(['public/brand/art-480.webp', 'public/brand/logo-96.webp']);
      for (const i of [0, 1]) {
        const row = page.locator(`[data-upload-index="${i}"]`);
        await row.locator('[name=title]').fill(tag + '-' + i);
        await row.locator('[name=alt]').fill('Synthetic original brand artwork ' + i);
        await row.locator('[name=alt_es]').fill('Ilustración original de marca para prueba ' + i);
      }
      await page.locator('[data-adjust="0"]').click();
      await page.locator('#crop-ratio').selectOption('1:1');
      await page.locator('#crop-rotation').selectOption('90');
      await page.locator('#media-adjust [type=submit]').click();
      await page.locator('#upload-rights').selectOption('owner_created');
      await page.locator('#upload-publish').check();
      await page.locator('#upload-non-identifying').check();
      await page.locator('#media-upload [type=submit]').click();
      await expect(page.locator('dialog[open]')).toHaveCount(0);
      await page.locator('#library-query').fill(tag);
      await page.locator('#library-search [type=submit]').click();
      await expect(page.locator('#library-records [data-media-id]')).toHaveCount(2);
      const image = page.locator('#library-records [data-media-id]').first(),
        id = await image.getAttribute('data-media-id');
      await image.click();
      await page.locator('#media-caption').fill('Synthetic paper-and-rainbow artwork');
      await page.locator('#media-focal-x').fill('75');
      await page.locator('#media-details [type=submit]').click();
      await expect(page.locator('#media-detail-status')).toContainText(
        spanish ? 'guardados' : 'saved',
      );
      await expect(page.locator('.media-focal-preview')).toHaveCSS('object-position', '75% 50%');
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator(`[data-media-id="${id}"]`)).toBeFocused();
      await page.locator(`[data-media-id="${id}"]`).click();
      await page.locator('#media-trash').click();
      await page.locator('#library-trash').click();
      await expect(page.locator(`[data-restore="${id}"]`)).toBeVisible();
      await page.locator(`[data-restore="${id}"]`).click();
      await expect(page.locator(`[data-restore="${id}"]`)).toHaveCount(0);
      await page.locator('#library-trash').click();
      await expect(page.locator(`#library-records [data-media-id="${id}"]`)).toBeVisible();
      await page.screenshot({
        path: `local-artifacts/operations-evidence/media-after-${locale}-${width}-${info.project.name}.png`,
        fullPage: true,
      });
      await page.goto('/admin/workshops');
      await page.locator('[data-action=new-workshop]').click();
      await page.locator('[name=name]').fill('Unsaved synthetic workshop');
      const trigger = page.locator('[data-media-field=media_id] [data-choose-media]');
      let slowInitialLoad = true;
      await page.route('**/api/admin/media?limit=60*', async (route) => {
        if (slowInitialLoad) {
          slowInitialLoad = false;
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
        await route.continue();
      });
      await trigger.click();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.locator('#picker-query').fill(tag);
      await page.locator('#picker-search [type=submit]').click();
      await expect(page.locator(`dialog [data-media-id="${id}"]`)).toBeVisible();
      await page.locator(`dialog [data-media-id="${id}"]`).click();
      await page.locator('#picker-use').click();
      await expect(page.locator('[name=name]')).toHaveValue('Unsaved synthetic workshop');
      await expect(page.locator('input[name=media_id]')).toHaveValue(id!);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(page.locator('.admin-signature')).toHaveText(
        'Made with love by your Bro · 2026',
      );
    });
