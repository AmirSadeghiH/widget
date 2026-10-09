const { test, expect } = require('@playwright/test');
const { THEMES } = require('./helpers.cjs');
const errors=new WeakMap();
test.beforeEach(async({page})=>{const list=[];errors.set(page,list);page.on('pageerror',error=>list.push(error.message));});
test.afterEach(async({page})=>{expect(errors.get(page)||[],'no demo runtime errors').toEqual([]);});
async function studio(page){await page.goto('/');await page.waitForFunction(()=>__studioReady);}
async function frameReady(page){const expected=await page.locator('#preview').getAttribute('src');const frame=await page.locator('#preview').elementHandle().then(el=>el.contentFrame());await frame.waitForURL(expected,{waitUntil:'domcontentloaded'});await frame.waitForFunction(()=>window.__demoReady);await expect(frame.locator('#asw-panel')).toBeVisible();return frame;}

test('studio boots all eleven distinct standalone bundles, light and dark',async({page})=>{
  await studio(page);await expect(page.locator('.theme-btn')).toHaveCount(11);
  for(const theme of THEMES){
    await page.locator(`[data-theme="${theme}"]`).click();let frame=await frameReady(page);
    expect(await frame.evaluate(()=>_aiWidget.previewMode)).toBe(true);
    expect(await frame.evaluate(()=>_aiWidget.titleEl.textContent)).toBe('پشتیبانی آنلاین فروشگاه');
    await page.locator('[data-mode="dark"]').click();frame=await frameReady(page);
    expect(await frame.evaluate(()=>_aiWidget.root.classList.contains('dark'))).toBe(true);
    await page.locator('[data-mode="light"]').click();frame=await frameReady(page);
    expect(await frame.evaluate(()=>_aiWidget.root.classList.contains('dark'))).toBe(false);
  }
});

test('device presets change the iframe viewport, not just a parent decoration',async({page})=>{
  await studio(page);
  for(const width of [320,360,390,430,768,1024]){
    await page.locator('#viewport').selectOption(String(width));const frame=await frameReady(page);
    expect(await frame.evaluate(()=>innerWidth)).toBe(width);
  }
  await page.locator('#overview-toggle').click();await expect(page.locator('#overview iframe')).toHaveCount(11);
  const frames=await page.locator('#overview iframe').elementHandles();
  for(const element of frames){const frame=await element.contentFrame();await frame.waitForLoadState('domcontentloaded');expect(await frame.evaluate(()=>innerWidth)).toBe(1024);}
});

test('scenarios are interactive, retain full header copy and have no microphone',async({page})=>{
  await studio(page);
  for(const state of ['answer','citations','waiting','agent','thinking','error','offline','locked','contact','multiline','long-header','welcome']){
    await page.locator('#state').selectOption(state);const frame=await frameReady(page);
    expect(await frame.evaluate(()=>!!_aiWidget.root.querySelector('[id*="mic"],.asw-mic'))).toBe(false);
    if(state==='thinking'){await page.locator('#preview').scrollIntoViewIfNeeded();await frame.locator('#asw-send').click();expect(await frame.evaluate(()=>_aiWidget.isLoading)).toBe(false);}
    if(state==='contact')await expect(frame.locator('#asw-sheet')).toBeVisible();
    if(state==='offline')await expect(frame.locator('#asw-send')).toBeDisabled();
    if(state==='locked')await expect(frame.locator('#asw-input')).toBeDisabled();
    if(state==='long-header')await expect(frame.locator('#asw-title')).toContainText('محصولات دیجیتال');
  }
  await page.locator('#state').selectOption('empty');
  const frame=await page.locator('#preview').elementHandle().then(el=>el.contentFrame());await frame.waitForURL(await page.locator('#preview').getAttribute('src'));await frame.waitForFunction(()=>__demoReady);
  await expect(frame.locator('#asw-panel')).toBeHidden();await page.locator('#preview').scrollIntoViewIfNeeded();await frame.locator('#asw-fab').click();await expect(frame.locator('#asw-panel')).toBeVisible();
});

test('shareable studio configuration survives reload and invalid theme names are safe',async({page})=>{
  await page.goto('/widget/_themes_gallery.html?theme=md3&mode=dark&width=320&act=contact&primary=%23fde047');await page.waitForFunction(()=>__studioReady);
  let frame=await frameReady(page);expect(await frame.evaluate(()=>innerWidth)).toBe(320);await expect(frame.locator('#asw-sheet')).toBeVisible();
  await page.reload();await page.waitForFunction(()=>__studioReady);frame=await frameReady(page);expect(await frame.evaluate(()=>_aiWidget.root.classList.contains('dark'))).toBe(true);
  await page.goto('/widget/_themes_gallery.html?theme=__proto__&mode=invalid');await page.waitForFunction(()=>__studioReady);await frameReady(page);
  await expect(page.locator('[data-theme="classic"]')).toHaveAttribute('aria-pressed','true');
});

test('studio fits a narrow host while the preview keeps its selected width',async({page})=>{
  await page.setViewportSize({width:375,height:812});await studio(page);const frame=await frameReady(page);
  expect(await frame.evaluate(()=>innerWidth)).toBe(390);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('quick check waits for readiness, fonts and checks all twenty-two variants',async({page})=>{
  await page.goto('/widget/_themes_check.html');await page.waitForFunction(()=>window.__done,{},{timeout:25000});
  const results=await page.evaluate(()=>__results);
  expect(results).toHaveLength(22);
  expect(results.filter(result=>!result.passed)).toEqual([]);
});
