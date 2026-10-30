import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHash } from 'node:crypto';
import { localStaffRole } from './fixtures/local-role';
const origin = 'http://127.0.0.1:4321';
async function localSQL(request: APIRequestContext, sql: string, params: unknown[] = []) {
  // Wrangler's loopback-only explorer seeds synthetic fixtures. This is never a
  // hosted route or a substitute for Access authentication evidence.
  const r = await request.post(origin + '/cdn-cgi/local/explorer/api/d1/database/local-only/raw', {
    data: { batch: [{ sql, params }] },
  });
  expect(r.ok()).toBe(true);
  const v = await r.json();
  expect(v.success).toBe(true);
  return v;
}
test.afterEach(async ({ page }) => {
  await localStaffRole(page.request, 'owner');
  await page.request.post('/api/admin/preferences', {
    headers: { Origin: origin },
    data: { locale: 'en-US', encouragement: 'shown' },
  });
});
for (const locale of ['en-US', 'es-MX'])
  test(`class communication drafts and owner boundaries in ${locale}`, async ({ page }) => {
    await localStaffRole(page.request, 'owner');
    await page.request.post('/api/admin/preferences', {
      headers: { Origin: origin },
      data: { locale, encouragement: 'shown' },
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/notifications');
    await expect(page.locator('#class-communications h2')).toHaveText(
      locale === 'es-MX' ? 'Avisos y recordatorios de clases' : 'Class updates & reminders',
    );
    const rows = await (await page.request.get('/api/admin/session-communications')).json();
    expect(rows.length).toBeGreaterThan(0);
    await page.locator('#communication-session').selectOption(rows[0].id);
    await expect(page.locator('#communication-form')).toBeVisible();
    await page
      .locator('[name=notice_en]')
      .fill('Synthetic weather instructions. No real schedule change.');
    await page
      .locator('[name=notice_es]')
      .fill('Aviso sintético del clima. No modifica horarios reales.');
    await page.locator('[name=reminder_hours]').selectOption('');
    await page.locator('#communication-form [type=submit]').click();
    await expect(page.locator('#communication-result')).toContainText(
      locale === 'es-MX' ? 'Borradores guardados' : 'Message drafts saved',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.locator('.admin-signature')).toHaveText('Made with love by your Bro · 2026');
    await localStaffRole(page.request, 'godmin');
    await page.reload();
    await page.locator('#communication-session').selectOption(rows[0].id);
    await expect(page.locator('#communication-form')).toBeVisible();
    await expect(page.locator('#queue-class-update')).toHaveCount(0);
    await expect(page.locator('[name=reminder_hours]')).toBeDisabled();
  });
for (const es of [false, true])
  test(`marketing preference GET is inert and explicit opt-out is private (${es ? 'es' : 'en'})`, async ({
    page,
  }) => {
    const token = createHash('sha256')
        .update('synthetic-' + Date.now() + Math.random())
        .digest('hex'),
      hash = createHash('sha256').update(token).digest('hex'),
      emailHash = createHash('sha256')
        .update('synthetic-address-' + token)
        .digest('hex');
    await localSQL(
      page.request,
      'INSERT INTO marketing_unsubscribe_tokens(token_hash,email_hash,expires_at) VALUES(?,?,unixepoch()+3600)',
      [hash, emailHash],
    );
    const path = (es ? '/es' : '') + '/unsubscribe/' + token;
    const response = await page.goto(path);
    expect(response!.headers()['cache-control']).toBe('no-store');
    expect(response!.headers()['referrer-policy']).toBe('no-referrer');
    expect(response!.headers()['x-robots-tag']).toContain('noindex');
    await expect(
      page.getByRole('button', {
        name: es ? 'Suspender mensajes promocionales' : 'Stop promotional messages',
      }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole('button', {
        name: es ? 'Suspender mensajes promocionales' : 'Stop promotional messages',
      })
      .click();
    await expect(page.getByRole('status')).toContainText(es ? 'están suspendidos' : 'are stopped');
    await page.reload();
    await expect(
      page.getByRole('button', {
        name: es ? 'Suspender mensajes promocionales' : 'Stop promotional messages',
      }),
    ).toHaveCount(0);
    expect((await page.request.get('/unsubscribe/' + '0'.repeat(64))).status()).toBe(410);
  });
test('confirmed receipt offers a real private calendar download and rejects expired access', async ({
  page,
}) => {
  await localStaffRole(page.request, 'owner');
  const sessions = await (await page.request.get('/api/admin/sessions')).json(),
    s = sessions.find((s: any) => s.status === 'published' && s.starts_at > Date.now() / 1000);
  expect(s).toBeTruthy();
  const id = 'calendar-' + Date.now(),
    token = createHash('sha256')
      .update(id + Math.random())
      .digest('hex');
  await localSQL(
    page.request,
    `INSERT INTO registrations(id,intent_key,request_hash,receipt_hash,session_id,seats,status,hold_until,total,workshop_name,starts_at,ends_at,timezone,venue_name,venue_address,policy_snapshot,age_min,age_max,locale) SELECT ?,?,?,?,s.id,1,'confirmed',0,s.price,w.name,s.starts_at,s.ends_at,s.timezone,v.name,v.address,'{}',w.age_min,w.age_max,'es-MX' FROM sessions s JOIN workshops w ON w.id=s.workshop_id JOIN venues v ON v.id=s.venue_id WHERE s.id=?`,
    [id, id, id, createHash('sha256').update(token).digest('hex'), s.id],
  );
  await page.context().addCookies([
    {
      name: 'receipt_' + id,
      value: token,
      url: origin + '/api/receipts/' + id,
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await page.goto('/es/registration/' + id);
  const link = page.getByRole('link', { name: 'Agregar al calendario' });
  await expect(link).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await link.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  const calendar = await page.request.get('/api/receipts/' + id + '/calendar.ics');
  expect(calendar.status()).toBe(200);
  expect(calendar.headers()['cache-control']).toBe('no-store');
  const text = await calendar.text();
  expect(text).toContain('BEGIN:VCALENDAR');
  expect(text).not.toContain(token);
  expect(text).not.toContain('guardian');
  await localSQL(
    page.request,
    'UPDATE registrations SET created_at=unixepoch()-604801 WHERE id=?',
    [id],
  );
  expect((await page.request.get('/api/receipts/' + id + '/calendar.ics')).status()).toBe(404);
});
