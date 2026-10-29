import { chromium, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
// Deliberately opt in: this creates labeled synthetic records on the existing preview.
if (!process.argv.includes('--run'))
  throw new Error(
    'Use --run after signing in through the official cloudflared Access client. This command mutates synthetic preview content.',
  );
const origin = 'https://adventure-station-preview.adventurestationfl.workers.dev';
const dir = 'local-artifacts/hosted-acceptance';
mkdirSync(dir, { recursive: true });
const ledgerPath = dir + '/ledger.json';
const state = existsSync(ledgerPath)
  ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
  : { tag: 'acceptance-' + Date.now(), complete: [], results: [] };
const save = () => writeFileSync(ledgerPath, JSON.stringify(state, null, 2));
// Keep client failures from printing captured stdout, which may contain a credential.
let token;
try {
  token = execFileSync(
    'local-artifacts/acceptance-tools/cloudflared.exe',
    ['access', 'token', '--app', origin + '/admin'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 },
  ).trim();
} catch {
  throw new Error(
    'The Access client could not supply a session. Complete normal authorized CLI login first.',
  );
}
if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token))
  throw new Error('The Access client returned an unexpected response. No request was made.');
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
await context.addCookies([
  {
    name: 'CF_Authorization',
    value: token,
    url: origin,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    expires: claims.exp,
  },
]);
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.name));
async function api(path, method = 'GET', data, expected = 200) {
  const response = await context.request.fetch(origin + '/api/admin/' + path, {
    method,
    data,
    headers: method === 'GET' ? {} : { Origin: origin },
    maxRedirects: 0,
  });
  expect(response.status(), method + ' ' + path).toBe(expected);
  return response.headers()['content-type']?.includes('application/json') ? response.json() : null;
}
async function go(section) {
  await page.goto(origin + '/admin/' + section);
  await expect(page.locator('#workspace h1')).toBeVisible();
}
async function shot(name) {
  await page.screenshot({
    path: dir + '/' + name + '.png',
    fullPage: false,
    animations: 'disabled',
  });
}
async function step(name, fn) {
  if (state.complete.includes(name)) return;
  console.log('Running: ' + name);
  try {
    await fn();
    state.complete.push(name);
    state.results.push({ name, passed: true, at: new Date().toISOString() });
    save();
    console.log('Passed: ' + name);
  } catch (error) {
    state.results.push({ name, passed: false, at: new Date().toISOString() });
    save();
    writeFileSync(dir + '/failure-private.txt', String(error.stack ?? error));
    await shot('failure');
    throw new Error('Hosted step failed: ' + name);
  }
}
const me = await api('me');
if (!['owner', 'godmin'].includes(me.role))
  throw new Error('An existing verified Owner/Godmin session is required.');
if (state.role && state.role !== me.role)
  throw new Error('Do not combine different identities in the same evidence ledger.');
if (state.staffId && state.staffId !== me.id)
  throw new Error('Do not combine different identities in the same evidence ledger.');
state.staffId = me.id;
state.role = me.role;
state.tokenExpiresAt = new Date(claims.exp * 1000).toISOString();
const preferences = await api('preferences');
state.originalPreferences ??= preferences;
save();
await api('preferences', 'POST', { ...preferences, locale: 'en-US' });
try {
  await step('signed identity and existing permission gates', async () => {
    await go('settings');
    await expect(page.locator('#admin-main')).toHaveAttribute('data-role', me.role);
    await expect(page.locator('.admin-signature')).toHaveText('Made with love by your Bro · 2026');
    if (me.role === 'godmin') {
      await api('setup', 'POST', {}, 403);
      await api('privacy-review', 'GET', undefined, 403);
      await api('registrations/synthetic-absent/refund', 'POST', {}, 403);
      await api('team/' + me.id + '/godmin', 'POST', { grant: true, confirm: true }, 403);
    }
    const bad = await context.request.post(origin + '/api/admin/workshops', {
      headers: { Origin: 'https://untrusted.example' },
      data: {},
      maxRedirects: 0,
    });
    expect(bad.status()).toBe(403);
    await shot('signed-settings-desktop');
  });
  await step('create and edit English workshop draft through hosted UI', async () => {
    state.slug = state.tag;
    state.workshopName = 'Synthetic hosted acceptance — colors and creative patterns';
    save();
    await go('workshops');
    await page.getByRole('button', { name: '+ Create workshop', exact: true }).click();
    await page.getByLabel('Workshop name', { exact: true }).fill(state.workshopName);
    await page.getByLabel('Page address', { exact: true }).fill(state.slug);
    await page
      .getByLabel('Short description', { exact: true })
      .fill('Synthetic hosted test only. No real class, travel, registration or payment.');
    await page
      .getByLabel('Full description', { exact: true })
      .fill('An isolated operational acceptance fixture. This does not advertise a real workshop.');
    await page.getByRole('button', { name: 'Save workshop ↗', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Workshop saved');
    const workshop = (await api('workshops')).find((w) => w.slug === state.slug);
    expect(workshop.status).toBe('draft');
    state.workshopId = workshop.id;
    save();
    await go('workshops?edit=' + state.workshopId);
    await page
      .getByLabel('Full description', { exact: true })
      .fill('Edited English synthetic description. No real workshop, bookings or money movement.');
    await page.getByRole('button', { name: 'Save workshop ↗', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Workshop saved');
  });
  await step('edit Spanish workshop copy through hosted UI', async () => {
    await go('workshops?edit=' + state.workshopId);
    await page.locator('[data-action=translate-workshop]').click();
    await expect(page.locator('#translation-editor')).toBeVisible();
    const copy = {
      name: 'Prueba sintética — colores y patrones creativos',
      summary: 'Prueba operativa únicamente. No es un taller real ni acepta inscripciones.',
      description:
        'Descripción en español para verificar el contenido alojado. No hay clases, viajes ni pagos reales.',
      category: 'Prueba sintética',
      materials: 'Materiales ficticios para pruebas.',
      instructions: 'No asistir a ninguna sede; prueba técnica únicamente.',
    };
    for (const [key, value] of Object.entries(copy))
      await page.locator('#translation-editor [name=' + key + ']').fill(value);
    await page.getByRole('button', { name: 'Save Spanish content ↗', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Spanish content saved');
    const t = await api('translations/workshop/' + state.workshopId);
    expect(t.value.description).toBe(copy.description);
    expect(t.source.id).toBe(state.workshopId);
    await shot('spanish-workshop-editor');
  });
  await step(
    'configure unverified synthetic venue and multiple draft dates through hosted UI',
    async () => {
      await go('venues');
      await page.getByRole('button', { name: '+ Add venue', exact: true }).click();
      state.venueName = 'Synthetic venue ' + state.tag + ' — do not travel';
      save();
      await page.getByLabel('Venue name', { exact: true }).fill(state.venueName);
      await page.getByLabel('Venue capacity', { exact: true }).fill('14');
      await page
        .getByLabel('Accessibility information', { exact: true })
        .fill('Synthetic notes only; actual accessibility and permission remain unverified.');
      await page.getByRole('button', { name: 'Save venue ↗', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Venue saved');
      state.venueId = (await api('venues')).find((v) => v.name === state.venueName).id;
      save();
      await go('sessions');
      await page.getByRole('button', { name: '+ Add a date', exact: true }).click();
      await page.getByLabel('Workshop', { exact: true }).selectOption(state.workshopId);
      await page.getByLabel('Start date & time', { exact: true }).fill('2030-11-01T13:00');
      await page.getByLabel('End time', { exact: true }).fill('14:00');
      await page.getByLabel('More dates (optional)', { exact: true }).fill('2030-11-08');
      await page.getByLabel('Business timezone', { exact: true }).selectOption('America/Chicago');
      await page.getByLabel('Venue', { exact: true }).selectOption(state.venueId);
      await page.getByLabel('Places in this class', { exact: true }).fill('8');
      await page.getByRole('button', { name: 'Save class date ↗', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('2 class dates saved');
      const dates = (await api('sessions')).filter((s) => s.workshop_id === state.workshopId);
      expect(dates).toHaveLength(2);
      expect(dates.every((s) => s.status === 'draft' && s.capacity === 8 && s.price === 2500)).toBe(
        true,
      );
      state.sessionIds = dates.map((s) => s.id);
      save();
      const venue = (await api('venues')).find((v) => v.id === state.venueId);
      expect(venue.verified).toBe(0);
      expect(venue.permission_confirmed).toBe(0);
    },
  );
  await step('upload non-identifying owned artwork through real hosted media UI', async () => {
    await go('media');
    await page
      .getByLabel('Choose image', { exact: true })
      .setInputFiles('public/brand/art-480.webp');
    state.mediaAlt =
      'Synthetic hosted acceptance: permitted Adventure Station artwork ' + state.tag;
    save();
    await page.getByLabel('Describe the image', { exact: true }).fill(state.mediaAlt);
    await page
      .getByLabel(
        'I have permission to publish this image, including any required photo permissions.',
        { exact: true },
      )
      .check();
    await page.getByLabel('This image does not identify a child.', { exact: true }).check();
    await page.getByRole('button', { name: 'Upload image ↗', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Image uploaded');
    state.mediaId = (await api('media')).find((m) => m.alt === state.mediaAlt).id;
    save();
    state.mediaReadback = [];
    for (const width of [1600, 960, 480]) {
      const response = await context.request.get(
        origin + '/media/' + state.mediaId + '?w=' + width,
      );
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/jpeg');
      const bytes = await response.body();
      state.mediaReadback.push({
        width,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      });
    }
    await shot('hosted-media-upload');
    save();
  });
  await step('publish synthetic workshop image and inspect both public locales', async () => {
    await go('workshops?edit=' + state.workshopId);
    await page.getByLabel('Workshop image', { exact: true }).selectOption(state.mediaId);
    await page.getByLabel('Workshop status', { exact: true }).selectOption('published');
    await page.getByRole('button', { name: 'Save workshop ↗', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Workshop saved');
    const translation = await api('translations/workshop/' + state.workshopId);
    await api('translations/workshop/' + state.workshopId, 'POST', {
      value: translation.value,
      revision: translation.revision,
      sourceRevision: translation.sourceRevision,
      approved: false,
    });
    for (const prefix of ['', '/es']) {
      await page.goto(origin + prefix + '/workshops');
      await expect(
        page.locator('a[href="' + prefix + '/workshops/' + state.slug + '"]'),
      ).toBeVisible();
      await page.goto(origin + prefix + '/workshops/' + state.slug);
      await expect(page.locator('h1')).toContainText(
        prefix ? 'Prueba sintética' : 'Synthetic hosted',
      );
      await expect(page.locator('img[src*="' + state.mediaId + '"]').first()).toBeVisible();
      // Draft class dates are deliberately absent from public pages; their price is not advertised.
      await expect(page.locator('[href*="/register/"]')).toHaveCount(0);
      await shot(prefix ? 'public-workshop-spanish' : 'public-workshop-english');
    }
    const w = (await api('workshops')).find((w) => w.id === state.workshopId);
    expect(w.price).toBe(2500);
    expect(w.capacity).toBe(12);
  });
  await step('readiness gates, empty registrations and attendance', async () => {
    const setup = await api('setup');
    expect(setup.registrationAllowed).toBe(false);
    expect(setup.readiness.production).toBe(false);
    await api(
      'sessions/batch',
      'POST',
      {
        sessions: [
          {
            workshop_id: state.workshopId,
            starts_at: 1919786400,
            ends_at: 1919790000,
            timezone: 'America/Chicago',
            venue_id: state.venueId,
            capacity: 8,
            price: 2500,
            instructor_id: null,
            status: 'published',
          },
        ],
      },
      400,
    );
    const registration = await context.request.post(origin + '/api/registrations', {
      headers: { Origin: origin, 'Idempotency-Key': 'acceptance-closed-' + randomUUID() },
      data: {},
      maxRedirects: 0,
    });
    expect(registration.status()).toBe(503);
    expect(await api('registrations')).toHaveLength(0);
    expect(await api('sessions/' + state.sessionIds[0] + '/roster')).toHaveLength(0);
    await go('sessions');
    await page
      .locator('[data-record-id="' + state.sessionIds[0] + '"]:visible')
      .getByRole('button', { name: 'Attendance', exact: true })
      .click();
    await expect(page.getByText('No confirmed participants yet.', { exact: true })).toBeVisible();
    await shot('hosted-empty-attendance');
  });
  await step('Creative Spark save dismiss restore and editable draft', async () => {
    await go('creative');
    const title = await page.locator('.spark-idea h2').textContent();
    await page.getByRole('button', { name: 'Save idea', exact: true }).click();
    await expect(page.locator('.saved-ideas')).toContainText(title);
    await page.locator('.spark-idea').getByRole('button', { name: 'Dismiss', exact: true }).click();
    await expect(page.locator('.spark-idea h2')).not.toHaveText(title);
    await page.getByText('Dismissed ideas', { exact: true }).click();
    await page.getByRole('button', { name: 'Restore', exact: true }).first().click();
    const draftsBefore = new Set((await api('workshops')).map((w) => w.id));
    await page
      .locator('.spark-idea')
      .getByRole('button', { name: 'Create workshop draft', exact: true })
      .click();
    await expect(page.getByLabel('Workshop name', { exact: true })).toBeVisible();
    await expect(page.locator('select[name=status]')).toHaveValue('draft');
    const draft = (await api('workshops')).find((w) => !draftsBefore.has(w.id));
    if (draft) state.sparkDraftId = draft.id;
    save();
    await shot('hosted-creative-draft');
  });
  await step('bilingual mobile drawer records forms and individual preferences', async () => {
    for (const locale of ['en-US', 'es-MX']) {
      await api('preferences', 'POST', { ...preferences, locale });
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await go('sessions');
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await expect(page.locator('.admin-signature')).toHaveText(
          'Made with love by your Bro · 2026',
        );
        if (width <= 960) {
          const trigger = page.locator('.admin-menu-toggle');
          await trigger.click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(trigger).toBeFocused();
          await expect(page.getByRole('dialog')).not.toBeVisible();
        }
        if (width === 390) await shot('hosted-sessions-' + locale + '-mobile');
      }
      await go('settings');
      await expect(page.locator('#locale')).toHaveValue(locale);
      await page.reload();
      await expect(page.locator('#locale')).toHaveValue(locale);
    }
    await api('preferences', 'POST', { ...preferences, locale: 'en-US' });
  });
  await step('publish and restore non-policy website content through hosted UI', async () => {
    const original = await api('content'),
      spanish = await api('translations/site/site');
    writeFileSync(
      dir + '/content-before-private.json',
      JSON.stringify({ original, spanish }, null, 2),
    );
    const marker = 'Synthetic operational acceptance check — no real bookings or payments.';
    const protectedKeys = [
      'policiesApproved',
      'refundPolicy',
      'supervisionPolicy',
      'pickupPolicy',
      'privacyPolicy',
      'timezone',
      'locality',
      'retentionDays',
    ];
    let changed = false;
    try {
      await go('content');
      await page.getByLabel('Promotional heading', { exact: true }).fill(marker);
      changed = true;
      await page.getByRole('button', { name: 'Publish website changes ↗', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Website changes published');
      const saved = await api('content');
      for (const key of protectedKeys) expect(saved[key]).toEqual(original[key]);
      expect(saved.promotion).toBe(marker);
      await page.goto(origin + '/');
      await expect(page.locator('body')).toContainText(marker);
      await shot('hosted-promotional-publication');
    } finally {
      if (changed) {
        const current = await api('content');
        // A failed request may not have published. Never overwrite an unrelated concurrent edit.
        expect([marker, original.promotion]).toContain(current.promotion);
        if (current.promotion === marker)
          await api('content', 'POST', { ...current, promotion: original.promotion });
        const currentTranslation = await api('translations/site/site');
        await api('translations/site/site', 'POST', {
          value: spanish.value,
          revision: currentTranslation.revision,
          sourceRevision: currentTranslation.sourceRevision,
          approved: spanish.approved,
        });
        const restored = await api('content');
        for (const [key, value] of Object.entries(original))
          if (key !== 'revision') expect(restored[key]).toEqual(value);
      }
    }
  });
  await step('Activity History records the authenticated staff attribution', async () => {
    const activity = await api('activity?category=workshop&actor=' + encodeURIComponent(me.id));
    expect(
      activity.events.some(
        (e) =>
          e.entity_id === state.workshopId && e.actor === me.id && e.action === 'workshop.saved',
      ),
    ).toBe(true);
    await go('activity');
    await expect(page.locator('.activity-list')).toContainText('Workshop updated');
    await shot('hosted-activity-history');
  });
  expect(errors).toEqual([]);
  state.completedAt = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      role: me.role,
      completedSteps: state.complete.length,
      resources: {
        workshop: state.workshopId,
        venue: state.venueId,
        media: state.mediaId,
        sessions: state.sessionIds,
      },
      pageErrors: errors.length,
    }),
  );
} finally {
  try {
    await api('preferences', 'POST', state.originalPreferences);
  } finally {
    await browser.close();
  }
}
