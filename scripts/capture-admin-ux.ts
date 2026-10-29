import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { mockRecords } from '../tests/e2e/fixtures/admin-records.ts';
const phase = process.argv[2] ?? 'before';
if (!['before', 'after'].includes(phase)) throw new Error('Use before or after');
const base = 'http://127.0.0.1:4321',
  folder = 'local-artifacts/admin-ux-review/' + phase;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await mockRecords(page);
const manifest = [];
try {
  for (const locale of ['en-US', 'es-MX']) {
    await page.request.post(base + '/api/admin/preferences', {
      headers: { Origin: base },
      data: { locale, encouragement: 'shown' },
    });
    for (const width of [390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const view of ['sessions', 'registrations', 'team', 'attendance', 'navigation']) {
        await page.goto(
          base +
            '/admin/' +
            (view === 'attendance' ? 'sessions' : view === 'navigation' ? 'registrations' : view),
        );
        await page.locator('#workspace h1').waitFor();
        if (view === 'attendance') {
          await page
            .getByRole('button', {
              name: locale === 'es-MX' ? 'Asistencia' : 'Attendance',
              exact: true,
            })
            .first()
            .click();
          await page.locator('[data-attendance]').first().waitFor();
        }
        if (view === 'navigation' && width <= 960) {
          await page
            .getByRole('button', {
              name: locale === 'es-MX' ? 'Menú de trabajo' : 'Workspace menu',
              exact: true,
            })
            .click();
        }
        await page.screenshot({
          path: folder + '/' + locale + '-' + width + '-' + view + '.png',
          fullPage: false,
          animations: 'disabled',
        });
        manifest.push({ phase, locale, width, view, fixture: 'presentation-only synthetic data' });
      }
    }
  }
} finally {
  await page.request.post(base + '/api/admin/preferences', {
    headers: { Origin: base },
    data: { locale: 'en-US', encouragement: 'shown' },
  });
  await browser.close();
}
await writeFile(folder + '/manifest.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ phase, screenshots: manifest.length, folder }));
