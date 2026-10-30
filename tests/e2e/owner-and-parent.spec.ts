import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('owner setup is persistent, accessible on mobile, and separates external checks', async ({
  page,
}, testInfo) => {
  await page.goto('/admin/setup');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Get Adventure Station ready');
  await expect(page.getByText('Developer setup needed', { exact: true })).toHaveCount(5);
  await page.getByText('Website personalization', { exact: true }).click();
  await page
    .getByLabel('Website review notes', { exact: true })
    .fill(`E2E editorial review ${testInfo.project.name} — test only`);
  await page.getByLabel('I have reviewed the website content.', { exact: true }).check();
  await page.getByLabel('Keep the dashboard setup section minimized.', { exact: true }).check();
  await page.getByRole('button', { name: 'Save setup progress ↗', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Setup progress saved');
  await page.reload();
  await expect(page.getByLabel('Website review notes', { exact: true })).toHaveValue(
    `E2E editorial review ${testInfo.project.name} — test only`,
  );
  await expect(
    page.getByLabel('Keep the dashboard setup section minimized.', { exact: true }),
  ).toBeChecked();
  await expect(page.getByText('Developer setup needed', { exact: true })).toHaveCount(5);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('owner-setup.png'), fullPage: true });
});
test('owner cancels one selected child without cancelling the other two places', async ({
  page,
}, testInfo) => {
  await page.goto('/admin/registrations');
  const row = page
    .locator('[data-record-id]')
    .filter({ visible: true })
    .filter({ hasText: `E2E guardian ${testInfo.project.name}` });
  await row.getByRole('button', { name: 'Review booking', exact: true }).click();
  await page.getByLabel('Test child A', { exact: true }).check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Cancel selected places', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Selected places cancelled');
  await expect(page.getByLabel('Test child A — cancelled', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Test child B', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Test child C', { exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back to registrations', exact: true }).click();
  await expect(
    page
      .locator('[data-record-id]')
      .filter({ visible: true })
      .filter({ hasText: `E2E guardian ${testInfo.project.name}` }),
  ).toContainText('2 active');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('owner finds notification follow-up and privacy reviews without technical settings', async ({
  page,
}) => {
  await page.goto('/admin/notifications');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Messages to families');
  await expect(
    page.getByText('Development release: customer sending is disabled.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Check notification updates', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Notification checks complete');
  await page.goto('/admin/privacy');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy review');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('parents can explore the responsive site and its accessible navigation', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Big discoveries start with little adventures.',
  );
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  }
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Workshops', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('adventure');
  await page.goto('/faq');
  await expect(page.getByText('[OWNER:', { exact: false })).toHaveCount(0);
  await expect(page.getByText('48 hours', { exact: false })).toHaveCount(0);
  await page.getByText('What ages are the workshops for?', { exact: true }).click();
  await expect(
    page.getByText('Check each workshop for its recommended age range.', { exact: true }),
  ).toBeVisible();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('public.png'), fullPage: true });
});
test('owner can save a workshop, publish it, and archive it without code', async ({
  page,
}, testInfo) => {
  const slug = `e2e-${testInfo.project.name}-${Date.now()}`,
    name = `E2E creative activity ${testInfo.project.name} — test only ${slug}`;
  await page.goto('/admin/workshops');
  await page.getByRole('button', { name: '+ Create workshop', exact: true }).click();
  await page.getByLabel('Workshop name', { exact: true }).fill(name);
  await page.getByLabel('Page address', { exact: true }).fill(slug);
  await page.getByLabel('Price per child ($)', { exact: true }).fill('21.37');
  await page
    .getByLabel('Short description', { exact: true })
    .fill('Test-only activity for automated checks.');
  await page
    .getByLabel('Full description', { exact: true })
    .fill('This is an isolated test record, not a real advertised workshop.');
  await page.getByLabel('Workshop status', { exact: true }).selectOption('published');
  await page.getByRole('button', { name: 'Save workshop ↗', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Workshop saved');
  await page.goto(`/workshops/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E creative activity');
  await page.goto('/admin/workshops');
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Workshop status', { exact: true }).selectOption('archived');
  await page.getByRole('button', { name: 'Save workshop ↗', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Workshop saved');
  await page.goto(`/workshops/${slug}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('wandered off');
});
test('owner can schedule multiple draft dates with defaults and independent overrides', async ({
  page,
}, testInfo) => {
  const venue = `E2E venue ${testInfo.project.name} — not a real location`;
  await page.goto('/admin/venues');
  await page.getByRole('button', { name: '+ Add venue', exact: true }).click();
  await page.getByLabel('Venue name', { exact: true }).fill(venue);
  await page.getByRole('button', { name: 'Save venue ↗', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Venue saved');
  await page.goto('/admin/workshops');
  const card = page
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: 'Seasonal crafts & art', exact: true }) });
  await card.getByRole('button', { name: 'Add date ↗', exact: true }).click();
  await expect(page.getByLabel('Places in this class', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('Price per child ($)', { exact: true })).toHaveValue('25');
  await page.getByLabel('Start date & time', { exact: true }).fill('2099-11-01T13:00');
  await page.getByLabel('End time', { exact: true }).fill('14:00');
  await page.getByLabel('More dates (optional)', { exact: true }).fill('2099-11-08');
  await page.getByLabel('Business timezone', { exact: true }).selectOption('America/New_York');
  await page
    .getByLabel('Venue', { exact: true })
    .selectOption({ label: `${venue} — needs verification` });
  await page.getByLabel('Places in this class', { exact: true }).fill('8');
  await page.getByLabel('Price per child ($)', { exact: true }).fill('30');
  await page.getByRole('button', { name: 'Save class date ↗', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('2 class dates saved');
  await page.goto('/workshops');
  await expect(page.getByText('2099')).toHaveCount(0);
});
test('owner can upload an optimized image and edit public text with history', async ({ page }) => {
  await page.goto('/admin/media');
  await page.getByRole('button', { name: 'Add images', exact: true }).click();
  await page.locator('#media-files').setInputFiles('public/brand/art-480.webp');
  await page
    .getByLabel('English image description', { exact: true })
    .fill('E2E original artwork test image');
  await page
    .getByLabel('Spanish image description', { exact: true })
    .fill('Ilustración original para prueba E2E');
  await page.locator('#upload-rights').selectOption('owner_created');
  await page
    .getByLabel('I confirm permission to use these images publicly.', { exact: true })
    .check();
  await page.getByLabel('These images do not identify a child.', { exact: true }).check();
  await page.getByRole('button', { name: 'Upload images', exact: true }).click();
  await expect(page.locator('#admin-message')).toContainText('Images uploaded');
  await page.goto('/admin/content');
  await expect(page.getByLabel('Florida city / locality', { exact: true })).toHaveValue(
    'Freeport, Florida',
  );
  await expect(page.getByLabel('Business timezone', { exact: true })).toHaveValue(
    'America/Chicago',
  );
  await expect(
    page.getByRole('button', { name: 'Load recommended policy drafts', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Promotional heading', { exact: true })
    .fill('Make room for a little creativity.');
  await page.getByRole('button', { name: 'Publish website changes ↗', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Website changes published');
  await expect(page.getByRole('button', { name: 'Restore into form' }).first()).toBeVisible();
});
