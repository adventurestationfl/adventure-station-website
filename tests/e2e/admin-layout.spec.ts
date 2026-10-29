import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockRecords, longEmail } from './fixtures/admin-records';
import { localStaffRole } from './fixtures/local-role';
const origin = 'http://127.0.0.1:4321';
const prefs = (page: any, locale = 'en-US') =>
  page.request.post(origin + '/api/admin/preferences', {
    headers: { Origin: origin },
    data: { locale, encouragement: 'shown' },
  });
const noOverflow = async (page: any) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const visibleRecords = (page: any) => page.locator('[data-record-id]').filter({ visible: true });
test.afterEach(async ({ page }) => {
  await localStaffRole(page.request, 'owner');
  await prefs(page);
});
for (const width of [320, 360, 390, 428, 600, 768, 960, 1024, 1440, 1920])
  test(`admin records, contained roster and drawer reflow at ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await mockRecords(page, { spanishContent: true });
    for (const locale of ['en-US', 'es-MX']) {
      await prefs(page, locale);
      for (const section of ['sessions', 'registrations', 'team']) {
        await page.goto('/admin/' + section);
        await expect(page.locator('#workspace h1')).toBeVisible();
        await expect(visibleRecords(page)).toHaveCount(section === 'sessions' ? 4 : 3);
        await noOverflow(page);
        const host = page.locator('[data-record-view]'),
          isList = await host.evaluate(
            (e) =>
              e.clientWidth <
              Number(e.querySelector('table')!.getAttribute('data-record-threshold')),
          );
        if (isList) {
          await expect(
            page.getByRole('list', {
              name:
                locale === 'es-MX'
                  ? section === 'sessions'
                    ? 'Registros de fechas de clase'
                    : section === 'team'
                      ? 'Integrantes del equipo'
                      : 'Registros de inscripción'
                  : section === 'sessions'
                    ? 'Class date records'
                    : section === 'team'
                      ? 'Team member records'
                      : 'Registration records',
              exact: true,
            }),
          ).toBeVisible();
          await expect(page.locator('[data-record-table]')).toBeHidden();
        } else {
          await expect(page.locator('[data-record-table]')).toBeVisible();
          expect(await page.locator('th[scope=col]').count()).toBeGreaterThan(0);
        }
        const primary = visibleRecords(page).first().getByRole('button').first();
        await primary.focus();
        await expect(primary).toBeFocused();
        expect((await primary.boundingBox())!.width).toBeGreaterThanOrEqual(44);
        const wordWidths = await page
          .locator('.status:visible,.record-actions .btn:visible')
          .evaluateAll((nodes) => nodes.map((e) => e.getBoundingClientRect().width));
        expect(wordWidths.every((w) => w >= 40)).toBe(true);
        await expect(page.locator('.admin-signature')).toHaveText(
          'Made with love by your Bro · 2026',
        );
      }
      await page.goto('/admin/sessions');
      await page
        .getByRole('button', {
          name: locale === 'es-MX' ? 'Asistencia' : 'Attendance',
          exact: true,
        })
        .first()
        .click();
      const region = page.getByRole('region', {
        name: locale === 'es-MX' ? 'Tabla de asistencia' : 'Attendance table',
        exact: true,
      });
      await expect(region).toBeVisible();
      await noOverflow(page);
      const first = region.getByRole('checkbox').first();
      const before = await first.boundingBox();
      expect(before!.x + before!.width).toBeLessThanOrEqual(width);
      await first.check();
      await expect(first).toBeChecked();
      const scroll = await region.evaluate((e) => ({
        overflow: e.scrollWidth > e.clientWidth + 1,
        width: e.clientWidth,
      }));
      if (scroll.overflow) {
        await expect(region).toHaveAttribute('tabindex', '0');
        await region.focus();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => region.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
        await region.evaluate((e) => {
          e.scrollLeft = e.scrollWidth;
        });
        await expect.poll(() => region.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
        const after = await first.boundingBox();
        expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
      }
      await noOverflow(page);
      if (width <= 960) {
        const menu = page.getByRole('button', {
          name: locale === 'es-MX' ? 'Menú de trabajo' : 'Workspace menu',
          exact: true,
        });
        await menu.click();
        const drawer = page.getByRole('dialog', {
          name: locale === 'es-MX' ? 'Menú de trabajo' : 'Workspace menu',
          exact: true,
        });
        await expect(drawer).toBeVisible();
        await expect(page.locator('[data-close-navigation]')).toBeFocused();
        expect(await page.locator('#staff-menu:visible').count()).toBe(1);
        await expect(drawer.locator('[aria-current=page]')).toHaveAttribute(
          'href',
          '/admin/sessions',
        );
        await page.keyboard.press('Escape');
        await expect(drawer).not.toBeVisible();
        await expect(menu).toBeFocused();
      } else {
        await expect(page.locator('.sidebar')).toBeVisible();
        await expect(page.locator('.sidebar [aria-current=page]')).toHaveAttribute(
          'href',
          '/admin/sessions',
        );
      }
    }
    expect(errors).toEqual([]);
  });
test('registration filtering and resizing retain a single set of controls and data', async ({
  page,
}) => {
  await prefs(page);
  await mockRecords(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/registrations');
  await expect(visibleRecords(page)).toHaveCount(3);
  const actions = await page.locator('[data-action]:visible').count();
  await page.getByLabel('Find a registration', { exact: true }).fill(longEmail);
  await expect(visibleRecords(page)).toHaveCount(3);
  const focusedAction = page.getByRole('button', { name: 'Review booking', exact: true }).first();
  await focusedAction.focus();
  for (const width of [320, 1024, 390, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(visibleRecords(page)).toHaveCount(3);
    expect(await page.locator('[data-action]:visible').count()).toBe(actions);
    expect(await page.locator('[data-action]').count()).toBe(actions);
    await expect(focusedAction).toBeFocused();
    await expect(page.getByLabel('Find a registration', { exact: true })).toHaveValue(longEmail);
    await noOverflow(page);
  }
  await page
    .getByLabel('Find a registration', { exact: true })
    .fill('no-matching-synthetic-family');
  await expect(visibleRecords(page)).toHaveCount(0);
  await expect(
    page.getByText('No registrations match this search.', { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(visibleRecords(page)).toHaveCount(0);
  await page.getByLabel('Find a registration', { exact: true }).fill('');
  await expect(visibleRecords(page)).toHaveCount(3);
});
test('attendance survives resize and sends one update per interaction', async ({ page }) => {
  await prefs(page);
  const fixture = await mockRecords(page);
  await page.goto('/admin/sessions');
  await page.getByRole('button', { name: 'Attendance', exact: true }).first().click();
  const box = page.getByRole('checkbox', {
    name: 'Attended — Synthetic participant 1',
    exact: true,
  });
  await box.check();
  await expect.poll(() => fixture.writes.length).toBe(1);
  for (const width of [320, 960, 1920, 390]) {
    await page.setViewportSize({ width, height: 600 });
    await expect(box).toBeChecked();
    await expect(page.getByRole('checkbox')).toHaveCount(5);
  }
  await box.uncheck();
  await expect.poll(() => fixture.writes.length).toBe(2);
  expect(fixture.writes.map((w) => w.attended)).toEqual([true, false]);
});
test('drawer is modal, traps focus, dismisses on overlay and closes on navigation', async ({
  page,
}) => {
  await prefs(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/registrations');
  const trigger = page.getByRole('button', { name: 'Workspace menu', exact: true }),
    drawer = page.getByRole('dialog', { name: 'Workspace menu', exact: true }),
    close = page.getByRole('button', { name: 'Close navigation', exact: true });
  await trigger.click();
  await expect(close).toBeFocused();
  await drawer.getByRole('link', { name: 'Sign out', exact: false }).focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('link', { name: 'Sign out', exact: false })).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('navigation-open')),
  ).toBe(true);
  await page.locator('#registration-search').evaluate((e: HTMLInputElement) => e.focus());
  expect(await drawer.evaluate((e) => e.contains(document.activeElement))).toBe(true);
  await page.mouse.click(382, 400);
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await drawer.getByRole('link', { name: 'Workshops', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/workshops$/);
  await expect(drawer).not.toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(drawer).not.toBeVisible();
  await expect(page.locator('.sidebar #staff-menu')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.classList.contains('navigation-open')),
  ).toBe(false);
});
test('empty records and long unbroken identifiers do not overflow', async ({ page }) => {
  await prefs(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await mockRecords(page, { empty: true });
  for (const section of ['registrations', 'sessions', 'team']) {
    await page.goto('/admin/' + section);
    await expect(page.locator('#workspace h1')).toBeVisible();
    await noOverflow(page);
    await expect(page.locator('[data-action]:visible').first()).toBeVisible();
  }
  await page.unroute('**/api/admin/**');
  await page.route('**/api/admin/registrations', (r) =>
    r.fulfill({
      json: [
        {
          id: 'unbroken-id-' + 'a'.repeat(80),
          workshop_name: 'W'.repeat(120),
          guardian_name: 'G'.repeat(100),
          guardian_email: 'e'.repeat(160) + '@example.invalid',
          starts_at: 4097098800,
          ends_at: 4097104200,
          timezone: 'America/Chicago',
          seats: 3,
          cancelled_seats: 0,
          total: 7500,
          paid: 7500,
          refunded: 0,
          status: 'confirmed',
          needs_attention: 0,
          payment_issues: [],
        },
      ],
    }),
  );
  await page.goto('/admin/registrations');
  await expect(visibleRecords(page)).toHaveCount(1);
  await noOverflow(page);
});
test('navigation and server permissions agree for owner, manager, instructor and Godmin', async ({
  page,
}) => {
  for (const role of ['owner', 'manager', 'instructor', 'godmin'] as const) {
    await localStaffRole(page.request, role);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/settings');
    await expect(page.locator('#admin-main')).toHaveAttribute('data-role', role);
    const links = await page
      .locator('#staff-menu a')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')));
    expect(links.includes('/admin/privacy')).toBe(role === 'owner');
    expect(links.includes('/admin/team')).toBe(['owner', 'godmin'].includes(role));
    expect(links.includes('/admin/connections')).toBe(role === 'godmin');
    expect(links.includes('/admin/registrations')).toBe(role !== 'instructor');
    if (role === 'instructor') {
      expect(links).toEqual(['/admin/sessions']);
      expect((await page.request.get('/api/admin/team')).status()).toBe(403);
      expect((await page.request.get('/api/admin/registrations')).status()).toBe(403);
      await mockRecords(page, { instructor: true });
      await page.goto('/admin/sessions');
      await page.getByRole('button', { name: 'Attendance', exact: true }).first().click();
      await expect(page.locator('#workspace')).not.toContainText(longEmail);
      await expect(
        page.getByRole('columnheader', { name: 'Guardian contact', exact: true }),
      ).toHaveCount(0);
      await page.unroute('**/api/admin/**');
    }
    if (role === 'godmin') {
      expect(links).toContain('/admin/setup#integrations');
      await page.goto('/admin/setup#integrations');
      await expect(page.locator('#setup-form input').first()).toBeDisabled();
      expect(
        (
          await page.request.post('/api/admin/registrations/ux-registration-0/refund', {
            headers: { Origin: origin },
            data: {},
          })
        ).status(),
      ).toBe(403);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/settings');
    await page.getByRole('button', { name: 'Workspace menu', exact: true }).click();
    expect(
      await page
        .locator('#staff-menu a')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href'))),
    ).toEqual(links);
    await expect(
      page.getByRole('dialog').getByRole('link', { name: 'Preferences & language', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  }
});
test('English/Spanish records, drawer and landscape pass targeted accessibility checks', async ({
  page,
}) => {
  await mockRecords(page, { spanishContent: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locale of ['en-US', 'es-MX']) {
    await prefs(page, locale);
    for (const size of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(size);
      for (const section of ['registrations', 'sessions', 'team', 'activity']) {
        await page.goto('/admin/' + section);
        await expect(page.locator('#workspace h1')).toBeVisible();
        await noOverflow(page);
        expect(
          (
            await new AxeBuilder({ page })
              .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
              .analyze()
          ).violations,
        ).toEqual([]);
      }
      await page
        .getByRole('button', {
          name: locale === 'es-MX' ? 'Menú de trabajo' : 'Workspace menu',
          exact: true,
        })
        .click();
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
      await page
        .getByRole('dialog')
        .getByRole('link', {
          name: locale === 'es-MX' ? 'Preferencias e idioma' : 'Preferences & language',
          exact: true,
        })
        .focus();
      await expect(
        page.getByRole('dialog').getByRole('link', {
          name: locale === 'es-MX' ? 'Preferencias e idioma' : 'Preferences & language',
          exact: true,
        }),
      ).toBeInViewport();
      await page.keyboard.press('Escape');
    }
  }
});
