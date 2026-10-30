import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
// Isolated DOM contract tests use the actual bundled registration script and
// deterministic fake HTTP responses. They do not open registration gates or
// claim a successful hosted/provider checkout.
const code = (
  await build({
    entryPoints: ['src/scripts/register.ts'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
  })
).outputFiles[0].text;
for (const locale of ['en-US', 'es-MX'])
  test(`registration client requires review and invalidates changed price inputs (${locale})`, async ({
    page,
  }) => {
    let quoted = 0,
      submitted: any;
    await page.route('**/__pricing-contract', (route) =>
      route.fulfill({
        contentType: 'text/html',
        headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self'" },
        body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><form id="registration-form" data-session="synthetic" data-age-min="4" data-age-max="10" data-policy-version="synthetic"><select id="quantity" name="seats"><option>1</option><option>2</option></select><div id="participants"></div><input name="guardian_name" value="Synthetic"><input name="guardian_email" type="email" value="synthetic@example.invalid"><input name="guardian_phone" value="5550000000"><input id="coupon-code" name="coupon_code"><input type="checkbox" name="guardian_attestation" checked><input type="checkbox" name="policy_agreement" checked><div id="registration-pricing"></div><button id="review-offer" type="button">Review</button><button type="submit">Review total</button><div id="form-message"></div></form><script src="/__pricing-contract.js"></script></html>`,
      }),
    );
    await page.route('**/__pricing-contract.js', (route) =>
      route.fulfill({ contentType: 'application/javascript', body: code }),
    );
    await page.route('**/api/registration-quote', (route) => {
      quoted++;
      return route.fulfill({
        json: {
          unit_price: 2500,
          subtotal: 5000,
          discount: 1001,
          total: 3999,
          currency: 'USD',
          coupon: {
            code: 'SYNTHETIC',
            terms: 'Synthetic terms.',
            terms_es: 'Condiciones de prueba.',
          },
        },
      });
    });
    await page.route('**/api/registrations', async (route) => {
      submitted = route.request().postDataJSON();
      await route.fulfill({
        status: 503,
        json: { error: 'Synthetic checkout transport deliberately unavailable.' },
      });
    });
    await page.goto('/__pricing-contract');
    await page.locator('[name=first_name]').fill('Synthetic child');
    await page.locator('[name=age]').fill('6');
    await page.locator('#review-offer').click();
    await expect(page.locator('#registration-pricing')).toContainText(
      locale === 'es-MX' ? 'Condiciones de prueba.' : 'Synthetic terms.',
    );
    expect(quoted).toBe(1);
    await page.locator('#coupon-code').fill('SYNTHETIC');
    await expect(page.locator('[type=submit]')).toHaveText(
      locale === 'es-MX' ? 'Revisar total' : 'Review total',
    );
    await page.locator('[type=submit]').click();
    await expect(page.locator('[type=submit]')).toContainText(
      locale === 'es-MX' ? 'pago' : 'checkout',
    );
    expect(submitted).toBeUndefined();
    await page.locator('[type=submit]').click();
    await expect.poll(() => submitted?.expected_total).toBe(3999);
    expect(submitted.coupon_code).toBe('SYNTHETIC');
    expect(submitted.participants[0].first_name).toBe('Synthetic child');
  });
