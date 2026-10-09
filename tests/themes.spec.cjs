const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { THEMES, boot, assertNoOverflow, contrastReadings } = require('./helpers.cjs');
const errors = new WeakMap();
test.beforeEach(async ({ page }) => { const list = []; errors.set(page, list); page.on('pageerror', e => list.push(e.message)); });
test.afterEach(async ({ page }) => { expect(errors.get(page) || [], 'no unhandled runtime errors').toEqual([]); });

for (const theme of THEMES) {
  for (const mode of ['light', 'dark']) {
    for (const width of [320, 360, 390, 430, 768, 1024]) {
      test(`${theme} ${mode} — geometry and full header at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 820 });
        await boot(page, theme, mode);
        await assertNoOverflow(page);
        expect(await page.evaluate(() => _aiWidget.root.classList.contains('dark'))).toBe(mode === 'dark');
        await page.evaluate(() => _aiWidget.applyConfig({
          title: 'مرکز پشتیبانی و مشاورهٔ تخصصی فروشگاه محصولات دیجیتال',
          subtitle: 'برای انتخاب محصول، پیگیری سفارش و پاسخ به تمام پرسش‌های خریدتان همراه شما هستیم.'
        }));
        await assertNoOverflow(page);
        const copy = await page.evaluate(() => ({
          title: _aiWidget.titleEl.textContent, description: _aiWidget.subtitleEl.textContent,
          titleClipped: _aiWidget.titleEl.scrollHeight > _aiWidget.titleEl.clientHeight + 1,
          descriptionClipped: _aiWidget.subtitleEl.scrollHeight > _aiWidget.subtitleEl.clientHeight + 1
        }));
        expect(copy.title).toContain('محصولات دیجیتال');
        expect(copy.description).toContain('همراه شما هستیم');
        expect(copy.titleClipped).toBe(false);
        expect(copy.descriptionClipped).toBe(false);
        await page.locator('#asw-input').fill('پیش‌نویس فارسی\nEnglish line\n' + 'این یک پیام چندخطی است.\n'.repeat(15));
        await assertNoOverflow(page);
        await page.locator('#asw-input').fill('');
        await expect(page.locator('#asw-send')).toBeDisabled();
        await assertNoOverflow(page);
      });
    }
    test(`${theme} ${mode} — readable text, keyboard labels and WCAG scan`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 840 });
      await boot(page, theme, mode);
      const readings = await contrastReadings(page);
      for (const [label, ratio] of Object.entries(readings)) expect(ratio, `${theme}/${mode} ${label}`).toBeGreaterThanOrEqual(4.5);
      const results = await new AxeBuilder({ page }).include('#ai-support-widget-host').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
      expect(results.violations.map(v => ({ id: v.id, description: v.description, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
      const description = await page.locator('#asw-subtitle').textContent();
      await page.locator('#asw-theme-toggle').click();
      expect(await page.evaluate(() => _aiWidget.root.classList.contains('dark'))).toBe(mode !== 'dark');
      await expect(page.locator('#asw-subtitle')).toHaveText(description);
      const toggled = await contrastReadings(page);
      for (const [label, ratio] of Object.entries(toggled)) expect(ratio, `after toggle ${label}`).toBeGreaterThanOrEqual(4.5);
    });
  }
}

test('root Classic alias works as an installable standalone entry point', async ({ page }) => {
  await page.goto('/tests/fixture.html?root=1');
  await page.waitForFunction(() => window.__ready);
  expect(await page.evaluate(() => window.AISupportWidget.version)).toBe('7.0.0');
  await assertNoOverflow(page);
});

for (const theme of THEMES) {
  test(`${theme} — unusual customer colours remain readable in both modes`, async ({ page }) => {
    await boot(page, theme);
    for (const mode of ['light','dark']) {
      for (const [primaryColor, secondaryColor] of [['#ffffff','#000000'], ['#fde047','#fb7185'], ['rgb(0, 200, 230)','hsl(230, 90%, 65%)'], ['not-a-color','url(javascript:alert(1))']]) {
        await page.evaluate(config => _aiWidget.applyConfig(config), { primaryColor, secondaryColor, darkMode: mode });
        const readings = await contrastReadings(page);
        for (const [label, ratio] of Object.entries(readings)) expect(ratio, `${theme} ${mode} ${primaryColor} ${label}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
}

// These checks intentionally measure different compositions, not palette hashes.
test('eleven theme compositions retain unique visual signatures', async ({ page }) => {
  const signatures = [];
  for (const theme of THEMES) {
    await boot(page, theme);
    signatures.push(await page.evaluate(() => {
      const get = selector => getComputedStyle(_aiWidget.root.querySelector(selector));
      const header = get('.asw-header'), orb = get('.asw-hero-orb-wrap'), hero = get('.asw-hero'), grid = get('.asw-hero-grid'), input = get('.asw-input-wrap');
      return [header.margin, header.borderRadius, header.borderInlineStartWidth, orb.display, orb.width, orb.borderRadius, hero.display, hero.textAlign, grid.gridTemplateColumns, input.borderRadius, input.borderBottomWidth].join('|');
    }));
  }
  expect(new Set(signatures).size).toBe(11);
});
