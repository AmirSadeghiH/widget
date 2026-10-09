const { expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const THEMES = Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, '../widget/themes/manifest.json'))));

async function boot(page, theme = 'classic', mode = 'light', options = {}) {
  await page.addInitScript(config => { window.__testOptions = config; }, options);
  await page.goto(`/tests/fixture.html?theme=${theme}&mode=${mode}`);
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#asw-panel')).toBeVisible();
}
async function idle(page) { await page.waitForFunction(() => !window._aiWidget.isLoading); }
async function rawSend(page, text) {
  await page.locator('#asw-input').fill(text);
  await page.locator('#asw-send').click();
}
async function assertNoOverflow(page) {
  const result = await page.evaluate(() => {
    const w = window._aiWidget;
    const panel = w.panel.getBoundingClientRect();
    const footer = w.footer.getBoundingClientRect();
    const input = w.input.getBoundingClientRect();
    const send = w.sendBtn.getBoundingClientRect();
    const header = w.root.querySelector('.asw-header').getBoundingClientRect();
    const controls = [...w.root.querySelectorAll('.asw-header-btn')].filter(el => !el.hidden).map(el => ({ id: el.id, box: el.getBoundingClientRect().toJSON() }));
    return { panel: panel.toJSON(), footer: footer.toJSON(), input: input.toJSON(), send: send.toJSON(), header: header.toJSON(), controls,
      width: innerWidth, height: visualViewport ? visualViewport.height : innerHeight,
      overflow: w.panel.scrollWidth > w.panel.clientWidth + 1,
      messagesOverflow: w.messages.scrollWidth > w.messages.clientWidth + 1,
      mic: !!w.root.querySelector('[id*="mic"],.asw-mic'),
      titleStyle: getComputedStyle(w.titleEl).whiteSpace,
      subtitleStyle: getComputedStyle(w.subtitleEl).whiteSpace,
      inputMax: parseFloat(getComputedStyle(w.input).maxHeight) };
  });
  expect(result.mic).toBe(false);
  expect(result.overflow).toBe(false);
  expect(result.messagesOverflow).toBe(false);
  expect(result.panel.left).toBeGreaterThanOrEqual(-1);
  expect(result.panel.right).toBeLessThanOrEqual(result.width + 1);
  expect(result.panel.top).toBeGreaterThanOrEqual(-1);
  expect(result.panel.bottom).toBeLessThanOrEqual(result.height + 1);
  expect(result.input.width).toBeGreaterThanOrEqual(115);
  expect(result.input.height).toBeGreaterThanOrEqual(43);
  expect(result.input.height).toBeLessThanOrEqual(result.inputMax + 1);
  expect(result.send.right).toBeLessThanOrEqual(result.input.left + 1);
  expect(result.send.width).toBeGreaterThanOrEqual(44);
  expect(result.send.bottom).toBeLessThanOrEqual(result.footer.bottom + 1);
  expect(result.input.top).toBeGreaterThanOrEqual(result.footer.top);
  expect(result.footer.bottom).toBeLessThanOrEqual(result.panel.bottom + 1);
  expect(result.titleStyle).toBe('normal');
  expect(result.subtitleStyle).toBe('normal');
  for (const control of result.controls) {
    expect(control.box.width, control.id).toBeGreaterThanOrEqual(44);
    expect(control.box.height, control.id).toBeGreaterThanOrEqual(44);
    expect(control.box.left, control.id).toBeGreaterThanOrEqual(result.header.left - 1);
    expect(control.box.right, control.id).toBeLessThanOrEqual(result.header.right + 1);
  }
}

async function contrastReadings(page) {
  return page.evaluate(() => {
    const w = window._aiWidget;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const rgba = value => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
    const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] / 255 + bg[i] * (1 - fg[3] / 255));
    const lum = color => color.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126,.7152,.0722][i], 0);
    const ratio = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);
    const root = getComputedStyle(w.root);
    const bg = rgba(root.getPropertyValue('--asw-bg'));
    const wrap = over(rgba(getComputedStyle(w.inputWrap).backgroundColor), bg);
    const header = getComputedStyle(w.root.querySelector('.asw-header'));
    const colors = (header.backgroundImage.match(/rgba?\([^)]*\)|color\([^)]*\)/g) || []).map(rgba);
    const headerBgs = colors.length ? colors.map(c => over(c, bg)) : [over(rgba(header.backgroundColor), bg)];
    const fg = rgba(getComputedStyle(w.titleEl).color);
    return {
      header: Math.min(...headerBgs.map(color => ratio(fg, color))),
      description: Math.min(...headerBgs.map(color => ratio(rgba(getComputedStyle(w.subtitleEl).color), color))),
      input: ratio(rgba(getComputedStyle(w.input).color), wrap),
      placeholder: ratio(rgba(getComputedStyle(w.input, '::placeholder').color), wrap),
      muted: ratio(rgba(root.getPropertyValue('--asw-text-muted')), bg),
      brand: ratio(rgba(root.getPropertyValue('--asw-on-brand')), rgba(root.getPropertyValue('--asw-primary'))),
      secondary: ratio(rgba(root.getPropertyValue('--asw-on-gradient')), rgba(root.getPropertyValue('--asw-secondary')))
    };
  });
}
module.exports = { THEMES, boot, idle, rawSend, assertNoOverflow, contrastReadings };
