import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
  test(`public and staff layouts reflow at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const path of [
      '/',
      '/workshops',
      '/workshops/paper-garden-preview',
      '/register/preview-paper-1',
      '/about',
      '/faq',
      '/contact',
      '/policies',
      '/admin/setup#editorial',
      '/admin/workshops',
      '/admin/sessions',
      '/admin/registrations',
      '/admin/notifications',
      '/admin/content',
    ]) {
      await page.goto(path);
      expect(await page.evaluate(() => innerWidth)).toBe(width);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      if (path.startsWith('/admin/'))
        await expect(page.locator('#workspace')).not.toContainText('Loading…');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        path,
      ).toBe(true);
      if ([390, 1440].includes(width) && ['/', '/admin/setup#editorial'].includes(path)) {
        await page.screenshot({
          path: testInfo.outputPath(`${width}-${path === '/' ? 'home' : 'setup'}.png`),
          fullPage: false,
        });
      }
    }
    await page.goto('/admin/setup#editorial');
    await expect(page.getByLabel('Website review notes', { exact: true })).toBeVisible();
    if (width <= 960) {
      const menu = page.getByRole('button', { name: 'Workspace menu', exact: true });
      await menu.press('Enter');
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
    }
    await page
      .getByLabel('Website review notes', { exact: true })
      .fill('Synthetic long review for responsive verification. '.repeat(25));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('keyboard navigation, form validation and 200 percent text remain usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  await menu.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/admin/workshops');
  await page.getByRole('button', { name: '+ Create workshop', exact: true }).click();
  await page.getByRole('button', { name: 'Save workshop ↗', exact: true }).click();
  await expect(page.getByLabel('Workshop name', { exact: true })).toBeFocused();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Workshop name', { exact: true })).toBeVisible();
  expect(
    await page
      .getByLabel('Workshop name', { exact: true })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/setup');
  await page.addStyleTag({ content: 'body { zoom: 2; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('link', { name: 'Continue setup', exact: true })).toBeVisible();
});
