import { test, expect } from '@playwright/test';

test('Spanish workshop and venue creation preserve API identifiers and saved values', async ({
  page,
}, testInfo) => {
  const preferences = await (await page.request.get('/api/admin/preferences')).json();
  await page.request.post('/api/admin/preferences', {
    headers: { Origin: 'http://127.0.0.1:4321' },
    data: { ...preferences, locale: 'es-MX' },
  });
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `Prueba de guardado en español ${suffix}`;
  const venue = `Sede sintética sin verificar ${suffix}`;
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') writes.push(new URL(request.url()).pathname);
  });
  try {
    await page.goto('/admin/workshops');
    await page.locator('[data-action=new-workshop]').click();
    await page.locator('input[name=price]').fill('21.37');
    await page.locator('input[name=name]').fill(name);
    await page.locator('input[name=slug]').fill(`es-write-${suffix}`);
    await page
      .locator('textarea[name=description]')
      .fill('Borrador sintético; sin publicación ni inscripciones.');
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('status')).toContainText('Taller guardado');
    const records = await (await page.request.get('/api/admin/workshops')).json();
    const saved = records.find((record: any) => record.name === name);
    expect(saved.status).toBe('draft');
    await page.goto('/admin/workshops?edit=' + saved.id);
    await expect(page.getByRole('heading', { name: 'Editar taller', exact: true })).toBeVisible();
    await page
      .locator('textarea[name=description]')
      .fill('Descripción editada y guardada en modo español.');
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('status')).toContainText('Taller guardado');
    await page.goto('/admin/venues');
    await page.locator('[data-action=new-venue]').click();
    await page.locator('input[name=name]').fill(venue);
    await page.locator('button[type=submit]').click();
    await expect(page.getByRole('status')).toContainText('Sede guardada');
    expect(writes).toContain('/api/admin/workshops');
    expect(writes).toContain('/api/admin/workshops/' + saved.id);
    expect(writes).toContain('/api/admin/venues');
    expect(writes.some((path) => /talleres|sedes/.test(path))).toBe(false);
    const venues = await (await page.request.get('/api/admin/venues')).json();
    expect(venues.find((record: any) => record.name === venue).verified).toBe(0);
  } finally {
    await page.request.post('/api/admin/preferences', {
      headers: { Origin: 'http://127.0.0.1:4321' },
      data: preferences,
    });
  }
});
