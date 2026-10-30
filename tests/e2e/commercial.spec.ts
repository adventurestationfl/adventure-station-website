import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { localStaffRole } from './fixtures/local-role';
import { wallClock } from '../../src/lib/time';
const origin = 'http://127.0.0.1:4321';
const promoFields = [
  'name',
  'title',
  'title_es',
  'description',
  'description_es',
  'material_terms',
  'material_terms_es',
  'cta',
  'cta_es',
  'destination',
  'media_id',
  'workshop_id',
  'session_id',
  'coupon_id',
  'placement',
  'starts_at',
  'ends_at',
  'state',
  'priority',
  'revision',
];
const couponFields = [
  'name',
  'code',
  'automatic',
  'kind',
  'amount',
  'terms',
  'terms_es',
  'starts_at',
  'ends_at',
  'workshop_id',
  'session_id',
  'max_uses',
  'per_email_limit',
  'state',
  'revision',
];
let tag = '';
const preferences = (page: Page, locale = 'en-US') =>
  page.request.post('/api/admin/preferences', {
    headers: { Origin: origin },
    data: { locale, encouragement: 'shown' },
  });
test.afterEach(async ({ page }) => {
  await localStaffRole(page.request, 'owner');
  for (const [kind, fields] of [
    ['promotions', promoFields],
    ['coupons', couponFields],
  ] as const) {
    const response = await page.request.get('/api/admin/' + kind);
    if (!response.ok()) continue;
    const rows = await response.json();
    for (const r of rows.filter((r: any) => tag && r.name.startsWith(tag))) {
      const data = Object.fromEntries(
        fields.map((f) => [f, f === 'state' ? 'archived' : f === 'automatic' ? !!r[f] : r[f]]),
      );
      await page.request.post('/api/admin/' + kind + '/' + r.id, {
        headers: { Origin: origin },
        data,
      });
    }
  }
  await preferences(page);
  tag = '';
});
for (const locale of ['en-US', 'es-MX'])
  for (const width of [320, 390, 768, 1440])
    test(`owner manages scheduled promotions and coupons in ${locale} at ${width}px`, async ({
      page,
    }, info) => {
      test.setTimeout(90000);
      tag = 'SyntheticE2E-' + Date.now() + '-' + info.project.name + '-';
      await localStaffRole(page.request, 'owner');
      await preferences(page, locale);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const es = locale === 'es-MX',
        starts = wallClock(Math.floor(Date.now() / 1000) - 3600, 'America/Chicago'),
        ends = wallClock(Math.floor(Date.now() / 1000) + 86400, 'America/Chicago');
      await page.goto('/admin/coupons');
      await expect(page.locator('#workspace h1')).toHaveText(
        es ? 'Cupones y ofertas' : 'Coupons & offers',
      );
      await page.locator('[data-commercial-action=new]').click();
      await page.locator('[name=name]').fill(tag + 'coupon');
      await page.locator('[name=code]').fill('T' + Date.now().toString(36) + width);
      await page.locator('[name=amount]').fill('10');
      await page.locator('[name=max_uses]').fill('3');
      await page.locator('[name=terms]').fill('Synthetic test only. No real discount or class.');
      await page
        .locator('[name=terms_es]')
        .fill('Prueba sintética. No es un descuento ni una clase real.');
      await page.locator('[name=starts_at]').fill(starts);
      await page.locator('[name=ends_at]').fill(ends);
      await page.locator('[name=state]').selectOption('active');
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page.locator('#commercial-editor [type=submit]').click();
      await expect(page.locator('#workspace h1')).toHaveText(
        es ? 'Cupones y ofertas' : 'Coupons & offers',
      );
      const coupons = await (await page.request.get('/api/admin/coupons')).json(),
        coupon = coupons.find((c: any) => c.name === tag + 'coupon');
      expect(coupon.amount).toBe(1000);
      expect(coupon.state).toBe('active');
      await page.goto('/admin/promotions');
      await page.locator('[data-commercial-action=new]').click();
      await page.locator('[name=name]').fill(tag + 'promotion');
      await page.locator('[name=title]').fill('Synthetic wonder and playful discovery');
      await page.locator('[name=title_es]').fill('Descubrimientos y juego creativo de prueba');
      await page
        .locator('[name=description]')
        .fill('Synthetic promotion for browser validation. Not a real offering.');
      await page
        .locator('[name=description_es]')
        .fill('Promoción sintética para pruebas. No es una actividad real.');
      await page.locator('[name=material_terms]').fill('Synthetic test only; no booking or money.');
      await page
        .locator('[name=material_terms_es]')
        .fill('Solo prueba sintética; sin reservas ni pagos.');
      await page.locator('[name=cta]').fill('Explore preview examples');
      await page.locator('[name=cta_es]').fill('Explorar ejemplos de prueba');
      await page.locator('[name=destination]').selectOption('/workshops');
      await page.locator('[name=coupon_id]').selectOption(coupon.id);
      await page.locator('[name=starts_at]').fill(starts);
      await page.locator('[name=ends_at]').fill(ends);
      await expect(page.locator('#promotion-preview-copy')).toContainText(
        es ? 'Descubrimientos' : 'Synthetic wonder',
      );
      await page.locator('[name=state]').selectOption('published');
      await page.locator('#commercial-editor [type=submit]').click();
      await expect(page.locator('#workspace h1')).toHaveText(es ? 'Promociones' : 'Promotions');
      await page.screenshot({
        path: `local-artifacts/operations-evidence/promotions-${locale}-${width}-${info.project.name}.png`,
        fullPage: true,
      });
      await page.goto(es ? '/es/' : '/');
      await expect(page.locator('.promotion-feature h2')).toHaveText(
        es
          ? 'Descubrimientos y juego creativo de prueba'
          : 'Synthetic wonder and playful discovery',
      );
      expect((await page.request.get(es ? '/es/' : '/')).headers()['cache-control']).toBe(
        'no-store',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.goto('/admin/coupons');
      await page.locator(`[data-commercial-action=edit][data-id="${coupon.id}"]`).click();
      await page.locator('[name=state]').selectOption('paused');
      await page.locator('#commercial-editor [type=submit]').click();
      await expect(page.locator('#workspace h1')).toHaveText(
        es ? 'Cupones y ofertas' : 'Coupons & offers',
      );
      await page.goto(es ? '/es/' : '/');
      await expect(page.locator('.studio-promotion')).toHaveCount(0);
      const closed = await page.request.post('/api/registration-quote', {
        headers: { Origin: origin },
        data: {
          session_id: 'preview-paper-1',
          seats: 1,
          guardian_email: 'synthetic@example.invalid',
          locale,
          coupon_code: coupon.code,
        },
      });
      // Repeated viewport runs may exhaust the unchanged registration abuse
      // budget. Both responses keep checkout closed; neither bypasses a gate.
      expect([429, 503]).toContain(closed.status());
    });
test('new commercial routes enforce instructor denial and owner-only activation', async ({
  page,
}) => {
  await localStaffRole(page.request, 'owner');
  await preferences(page);
  await page.goto('/admin/coupons');
  const rows = await (await page.request.get('/api/admin/coupons')).json();
  for (const role of ['manager', 'godmin', 'instructor'] as const) {
    await localStaffRole(page.request, role);
    if (role === 'instructor') {
      expect((await page.request.get('/admin/coupons')).status()).toBe(403);
      expect((await page.request.get('/api/admin/promotions')).status()).toBe(403);
      await page.goto('/admin/sessions');
      await expect(page.locator('#staff-menu a[href="/admin/coupons"]')).toHaveCount(0);
    } else {
      const response = await page.request.post('/api/admin/coupons', {
        headers: { Origin: origin },
        data: {
          name: 'Synthetic forbidden activation',
          code: 'FORBIDDEN' + Date.now().toString(36),
          automatic: false,
          kind: 'fixed',
          amount: 100,
          terms: 'Synthetic',
          terms_es: 'Prueba',
          starts_at: Math.floor(Date.now() / 1000) - 60,
          ends_at: Math.floor(Date.now() / 1000) + 3600,
          workshop_id: null,
          session_id: null,
          max_uses: null,
          per_email_limit: null,
          state: 'active',
        },
      });
      expect(response.status()).toBe(403);
    }
  }
  await localStaffRole(page.request, 'owner');
  expect((await (await page.request.get('/api/admin/coupons')).json()).length).toBe(rows.length);
});
