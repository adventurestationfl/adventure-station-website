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
  for (const width of [320, 390, 1440])
    test(`fresh research briefs stay simple, bilingual and honestly qualified (${locale}, ${width}px)`, async ({
      page,
    }, info) => {
      await localStaffRole(page.request, 'owner');
      await page.request.post('/api/admin/preferences', {
        headers: { Origin: origin },
        data: { locale, encouragement: 'shown' },
      });
      const current = new Date().toISOString(),
        id = 'synthetic-source-' + Date.now();
      const summary = {
        sourceReferences: [
          {
            sourceId: 'nasa',
            kind: 'editorial',
            url: 'https://www.nasa.gov/synthetic-local-water-reference',
            title: 'Synthetic water investigation reference',
            retrievedAt: current,
            publishedAt: current,
            evidence: 'topic-context',
            geography: 'United States editorial context; no Florida demand measurement',
          },
        ],
      };
      // A clearly synthetic local source fixture, never external trend evidence.
      const fixture = await page.request.post(
        origin + '/cdn-cgi/local/explorer/api/d1/database/local-only/raw',
        {
          data: {
            batch: [
              {
                sql: "INSERT INTO spark_runs(id,kind,status,lease_until,month,provider,summary,completed_at) VALUES(?,'discovery','completed',0,?,'source:nasa',?,unixepoch())",
                params: [id, current.slice(0, 7), JSON.stringify(summary)],
              },
            ],
          },
        },
      );
      expect(fixture.ok()).toBe(true);
      expect((await fixture.json()).success).toBe(true);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/creative');
      await expect(page.locator('.spark-opportunities h2')).toHaveText(
        locale === 'es-MX' ? 'Nuevas oportunidades' : 'Fresh opportunities',
      );
      await expect(page.locator('.spark-opportunities')).toContainText(
        locale === 'es-MX' ? 'no talleres listos' : 'not ready-made workshops',
      );
      await expect(page.locator('.spark-opportunities h3')).toContainText(
        locale === 'es-MX' ? 'Agua' : 'Water',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect(page.locator('#spark-config-open')).not.toBeVisible();
      await page.locator('#spark-how > summary').click();
      await page.locator('#spark-config-open').click();
      await expect(page.locator('#spark-config')).toContainText(
        locale === 'es-MX' ? 'no es gasto verificado' : 'not verified spending',
      );
      await expect(page.locator('#spark-cap')).toHaveValue('0');
      await page.locator('#spark-how > summary').click();
      await page.locator('.spark-opportunities summary').first().click();
      await expect(page.locator('.spark-opportunities textarea').first()).toContainText(
        locale === 'es-MX' ? 'actividad original' : 'original',
      );
      await expect(page.locator('.spark-opportunities a').first()).toHaveAttribute(
        'rel',
        'noopener noreferrer',
      );
      await expect(page.locator('.admin-signature')).toHaveText(
        'Made with love by your Bro · 2026',
      );
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(audit.violations).toEqual([]);
      await page.locator('.spark-library-more > summary').click();
      await expect(
        page.locator('.spark-library [data-preview-idea="explore-sponge-water-transfer"]'),
      ).toBeVisible();
      await page.locator('.spark-library-more > summary').click();
      await page.locator('.spark-opportunities').screenshot({
        path: `local-artifacts/operations-evidence/spark-opportunities-${locale}-${width}-${info.project.name}.png`,
        scale: 'css',
      });
      await page.screenshot({
        path: `local-artifacts/operations-evidence/spark-discovery-${locale}-${width}-${info.project.name}.png`,
        fullPage: true,
      });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `local-artifacts/operations-evidence/spark-discovery-${locale}-${width}-${info.project.name}-viewport.png`,
        fullPage: false,
        scale: 'css',
      });
      await page.request.post('/api/admin/preferences', {
        headers: { Origin: origin },
        data: { locale: 'en-US', encouragement: 'shown' },
      });
    });
