import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
for (const locale of ['en-US', 'es-MX']) {
  test(`Wonder positioning and shared activity topics in ${locale}`, async ({ page }, info) => {
    const path = locale === 'es-MX' ? '/es' : '';
    await page.goto(path + '/');
    await expect(page.locator('.brand small').first()).toHaveText('Wonder · Create · Play');
    await expect(page.locator('#adventure-pillars')).toHaveText(
      locale === 'es-MX' ? 'Tres maneras de empezar una aventura' : 'Three ways into an adventure',
    );
    await expect(page.locator('body')).not.toContainText('indoor playground');
    const base = (await (await page.request.get('/api/admin/workshops')).json()).find(
      (w: any) => w.id === 'e2e-workshop',
    );
    const slug = `topics-${info.project.name}-${locale.toLowerCase()}-${Date.now()}`;
    const name = 'Synthetic multi-topic activity ' + slug;
    const response = await page.request.post('/api/admin/workshops', {
      headers: { Origin: 'http://127.0.0.1:4321' },
      data: {
        ...base,
        id: undefined,
        slug,
        name,
        status: 'published',
        price: 2137,
        activity_tags: ['sensory', 'games'],
        revision: undefined,
      },
    });
    expect(response.status()).toBe(200);
    await page.goto(path + '/workshops?topic=sensory');
    await expect(page.locator('.workshop-card').filter({ hasText: name })).toBeVisible();
    await page.goto(path + '/workshops?topic=experiments');
    await expect(page.locator('.workshop-card').filter({ hasText: name })).toHaveCount(0);
  });
  test(`Spark refinements preserve originals and no-credential gates in ${locale}`, async ({
    page,
  }, info) => {
    const prefs = await (await page.request.get('/api/admin/preferences')).json();
    await page.request.post('/api/admin/preferences', {
      headers: { Origin: 'http://127.0.0.1:4321' },
      data: { ...prefs, locale },
    });
    try {
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/admin/creative');
        await expect(page.locator('#workspace h1')).toHaveText(
          locale === 'es-MX' ? 'Chispa creativa' : 'Creative Spark',
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(page.locator('.admin-signature')).toHaveText(
          'Made with love by your Bro · 2026',
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const before = await (await page.request.get('/api/admin/companion')).json(),
        id = before.idea.id;
      await page.locator('[data-spark=refine]').click();
      const title = `Synthetic refined ${info.project.name} ${locale} ${Date.now()}`;
      await page.locator('#spark-en-title').fill(title);
      const spanishTitle = 'Idea sintética adaptada ' + Date.now();
      await page.locator('#spark-es-title').fill(spanishTitle);
      await page.locator('#spark-refine-form button[type=submit]').click();
      await expect(page.getByRole('status')).toContainText(
        locale === 'es-MX' ? 'Nueva versión guardada' : 'New idea version saved',
      );
      await expect(page.locator('.spark-idea h2')).toHaveText(
        locale === 'es-MX' ? spanishTitle : title,
      );
      const after = await (await page.request.get('/api/admin/companion')).json();
      expect(after.library.find((i: any) => i.id === id).variants).toEqual(before.idea.variants);
      await page.locator('[data-spark=draft]').click();
      await expect(page.locator('#spark-draft-price')).toBeEmpty();
      await expect(page.locator('#spark-draft-capacity')).toBeEmpty();
      let cancelRefreshes = 0;
      const onCancelRequest = (request: import('@playwright/test').Request) => {
        if (new URL(request.url()).pathname === '/api/admin/companion') cancelRefreshes++;
      };
      page.on('request', onCancelRequest);
      await page.locator('[data-spark=cancel]').click();
      expect(cancelRefreshes).toBe(0);
      page.off('request', onCancelRequest);
      await page.locator('#spark-how > summary').click();
      await page.locator('#spark-config-open').click();
      await expect(page.locator('#spark-config')).toContainText(
        locale === 'es-MX' ? 'no está activada' : 'not activated',
      );
      await expect(page.locator('#spark-cap')).toHaveValue('0');
      await page.screenshot({
        path: info.outputPath(`spark-${locale}-mobile.png`),
        fullPage: true,
      });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await page.request.post('/api/admin/preferences', {
        headers: { Origin: 'http://127.0.0.1:4321' },
        data: prefs,
      });
    }
  });
}
