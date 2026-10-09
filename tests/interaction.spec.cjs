const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { THEMES, boot, idle, rawSend, assertNoOverflow } = require('./helpers.cjs');
const errors = new WeakMap();
test.beforeEach(async ({ page }) => { const list = []; errors.set(page, list); page.on('pageerror', e => list.push(e.message)); });
test.afterEach(async ({ page }) => { expect(errors.get(page) || [], 'no unhandled runtime errors').toEqual([]); });

for (const theme of THEMES) {
  test(`${theme} — IME, multiline input, sending and next-message draft`, async ({ page }) => {
    await boot(page, theme);
    await page.locator('#asw-input').fill('   \n  ');
    await expect(page.locator('#asw-send')).toBeDisabled();
    await page.evaluate(() => {
      const input = _aiWidget.input;
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.value = 'متن با کیبورد فارسی';
      input.dispatchEvent(new InputEvent('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true }));
    });
    await expect(page.locator('.asw-row.user')).toHaveCount(0);
    await expect(page.locator('#asw-input')).toHaveValue('متن با کیبورد فارسی');
    await page.evaluate(() => _aiWidget.input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    await page.locator('#asw-input').press('End');
    await page.locator('#asw-input').press('Shift+Enter');
    await page.locator('#asw-input').pressSequentially('خط دوم');
    const sent = page.waitForRequest(r => /\/demo-api\/chat\/stream\//.test(r.url()) && r.method() === 'POST');
    await page.locator('#asw-input').press('Enter');
    expect((await sent).postDataJSON().message).toBe('متن با کیبورد فارسی\nخط دوم');
    await expect(page.locator('#asw-input')).toBeEnabled();
    await expect(page.locator('#asw-send')).toHaveAttribute('aria-label', 'توقف پاسخ');
    await expect(page.locator('#asw-send')).toBeEnabled();
    await page.locator('#asw-input').fill('پیش‌نویس پیام بعدی');
    await idle(page);
    await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس پیام بعدی');
    await expect(page.locator('#asw-send')).toBeEnabled();
    await expect(page.locator('.asw-hero')).toHaveCount(0);
    await expect(page.locator('.asw-row.user')).toHaveCount(1);
    await expect(page.locator('.asw-row.user .asw-msg-avatar')).toHaveCount(0);
    await expect(page.locator('.asw-row.bot .asw-fb-btn')).toHaveCount(3);
    await page.locator('#asw-input').fill('English draft 123');
    expect(await page.locator('#asw-input').evaluate(el => getComputedStyle(el).direction)).toBe('ltr');
    await page.locator('#asw-input').fill('پیش‌نویس فارسی ۱۲۳');
    expect(await page.locator('#asw-input').evaluate(el => getComputedStyle(el).direction)).toBe('rtl');
    await assertNoOverflow(page);
  });

  test(`${theme} — offline, lock and human status never lose draft or subtitle`, async ({ page, context }) => {
    await boot(page, theme, 'dark');
    const subtitle = await page.locator('#asw-subtitle').textContent();
    await page.evaluate(() => AISupportLive.applyMode(_aiWidget, 'waiting', {}));
    await expect(page.locator('#asw-input')).toHaveAttribute('placeholder', 'پیام خود را برای کارشناس بنویسید…');
    await expect(page.locator('#asw-messages')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#asw-input').fill('پیش‌نویس حفظ می‌شود');
    await context.setOffline(true);
    await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state', 'offline');
    await expect(page.locator('#asw-netstatus')).toBeVisible();
    await expect(page.locator('#asw-send')).toBeDisabled();
    expect(await page.evaluate(() => _aiWidget.send())).toBe(false);
    await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس حفظ می‌شود');
    await page.evaluate(() => { _aiWidget._setBlocked(true, 'سرویس موقتاً غیرفعال است'); _aiWidget.setLoading(true); _aiWidget.setLoading(false); });
    await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state', 'locked');
    await expect(page.locator('#asw-input')).toBeDisabled();
    await expect(page.locator('#asw-send')).toBeDisabled();
    expect(await page.evaluate(() => _aiWidget.sendText('پیام غیرمجاز'))).toBe(false);
    await expect(page.locator('.asw-row.user')).toHaveCount(0);
    await context.setOffline(false);
    await page.evaluate(() => { _aiWidget._clearBlocked(); AISupportLive.applyMode(_aiWidget, 'human', {}); });
    await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state', 'human_active');
    await expect(page.locator('#asw-input')).toBeEnabled();
    await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس حفظ می‌شود');
    await expect(page.locator('#asw-subtitle')).toHaveText(subtitle);
    await page.evaluate(() => AISupportLive.applyMode(_aiWidget, 'ai', {}));
    await expect(page.locator('#asw-input')).toHaveAttribute('placeholder', 'پیام خود را بنویسید…');
    await page.locator('#asw-close').click();
    await expect(page.locator('#asw-panel')).toHaveAttribute('inert', '');
    await page.locator('#asw-fab').click();
    await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس حفظ می‌شود');
  });

  test(`${theme} — contact focus, Persian numbers and truthful failure recovery`, async ({ page }) => {
    let requests = 0, lastBody;
    await page.route('**/demo-api/leads/', async route => {
      lastBody = route.request().postDataJSON();
      await route.fulfill({ status: ++requests === 1 ? 500 : 200, contentType: 'application/json', body: JSON.stringify(requests === 1 ? { message: 'ثبت درخواست ناموفق بود.' } : { ok: true }) });
    });
    await boot(page, theme, 'dark');
    await page.locator('#asw-contact').click();
    const sheet = page.locator('#asw-sheet');
    await expect(sheet).toBeVisible();
    expect(await page.evaluate(() => _aiWidget.shadow.activeElement.id)).toBe('asw-sheet-close');
    expect(await page.evaluate(() => _aiWidget.footer.inert)).toBe(true);
    await page.locator('.asw-form-submit').click();
    await expect(sheet.locator('input[name="name"]')).toHaveAttribute('aria-invalid', 'true');
    expect(await page.evaluate(() => _aiWidget.shadow.activeElement.name)).toBe('name');
    await sheet.locator('input[name="name"]').fill('سارا محمدی');
    await sheet.locator('input[name="phone"]').fill('۰۹۱۲۳۴۵۶۷۸۹');
    await sheet.locator('textarea[name="note"]').fill('درخواست راهنمایی');
    await page.locator('.asw-form-submit').click();
    await expect(page.locator('.asw-form-err')).toHaveText('ثبت درخواست ناموفق بود.');
    await expect(page.locator('.asw-form-success')).toHaveCount(0);
    await expect(sheet.locator('input[name="name"]')).toHaveValue('سارا محمدی');
    await expect(page.locator('.asw-form-submit')).toBeEnabled();
    expect(lastBody.phone).toBe('09123456789');
    await page.locator('.asw-form-submit').focus();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => _aiWidget.shadow.activeElement.id)).toBe('asw-sheet-close');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.locator('#asw-panel')).toBeVisible();
    await page.locator('#asw-contact').click();
    await expect(sheet.locator('input[name="name"]')).toHaveValue('سارا محمدی');
    await page.locator('.asw-form-submit').click();
    await expect(page.locator('.asw-form-success')).toBeVisible();
    await expect(page.locator('.asw-fs-close')).toBeFocused();
    await page.locator('.asw-fs-close').click();
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(() => _aiWidget.footer.inert)).toBe(false);
    expect(requests).toBe(2);
  });
}

test('stop before tokens is cancellation, not timeout; next draft is preserved', async ({ page }) => {
  await boot(page, 'classic', 'light', { streamEndpoint: '/demo-api/chat/stream/?scenario=hang' });
  await rawSend(page, 'یک سؤال');
  await expect(page.locator('#asw-send')).toBeEnabled();
  await page.locator('#asw-input').fill('سؤال بعدی');
  await page.locator('#asw-send').click();
  await idle(page);
  await expect(page.locator('#asw-input')).toHaveValue('سؤال بعدی');
  await expect(page.locator('.asw-error-bubble')).toHaveCount(0);
  await expect(page.locator('.streaming')).toHaveCount(0);
  await expect(page.locator('#asw-toast')).toContainText('متوقف شد');
});

test('stop after tokens keeps a clean partial answer without late DOM paints', async ({ page }) => {
  await boot(page, 'onyx', 'dark', { streamEndpoint: '/demo-api/chat/stream/?scenario=slow' });
  await rawSend(page, 'پیام آزمایشی');
  await expect(page.locator('.streaming')).not.toHaveText('');
  await page.locator('#asw-input').fill('پیش‌نویس بعدی');
  await page.locator('#asw-send').click();
  await idle(page);
  await expect(page.locator('.streaming')).toHaveCount(0);
  await expect(page.locator('.asw-stream-note')).toHaveText('پاسخ‌دهی متوقف شد');
  await expect(page.locator('.asw-error-bubble')).toHaveCount(0);
  const text = await page.locator('.asw-row.bot .asw-bubble').textContent();
  await page.waitForTimeout(250);
  await expect(page.locator('.asw-row.bot .asw-bubble')).toHaveText(text);
  await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس بعدی');
});

test('JSON requests have a working stop control and preserve the API contract', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requestBody, requestHeaders;
  await page.route('**/demo-api/chat/', async route => {
    requestBody = route.request().postDataJSON(); requestHeaders = route.request().headers();
    await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: 'پاسخ نباید بعد از لغو نمایش داده شود', conversation_id: 'stale-conv', conversation_token: 'stale-token' }) }).catch(() => {});
  });
  await boot(page, 'minimal', 'dark', { enableStreaming: false, widgetPublicKey: 'demo-public-key' });
  await rawSend(page, '  متن پیام  ');
  await expect(page.locator('#asw-send')).toHaveAttribute('aria-label', 'توقف پاسخ');
  await expect(page.locator('#asw-send')).toBeEnabled();
  await page.locator('#asw-send').click();
  release();
  await idle(page);
  expect(requestBody.message).toBe('متن پیام');
  expect(Object.keys(requestBody).sort()).toEqual(['conversation_id','conversation_token','message','page_url']);
  expect(requestHeaders['x-widget-key']).toBe('demo-public-key');
  await expect(page.locator('.asw-row.bot')).toHaveCount(0);
  expect(await page.evaluate(() => _aiWidget.conversationId)).toBe('');
});

test('new conversation confirmation cancels stale work and keeps the service lock', async ({ page }) => {
  await boot(page, 'clay', 'light', { streamEndpoint: '/demo-api/chat/stream/?scenario=slow' });
  await rawSend(page, 'گفتگوی قبلی');
  await page.locator('#asw-input').fill('پیش‌نویس قبلی');
  await page.locator('#asw-clear-history').click();
  await expect(page.locator('#asw-confirm')).toBeVisible();
  await expect(page.locator('#asw-confirm-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس قبلی');
  await page.locator('#asw-clear-history').click();
  await page.locator('#asw-confirm-reset').click();
  await expect(page.locator('.asw-hero')).toBeVisible();
  await expect(page.locator('.asw-row')).toHaveCount(0);
  await expect(page.locator('#asw-input')).toHaveValue('');
  await page.waitForTimeout(750);
  await expect(page.locator('.asw-row')).toHaveCount(0);
  expect(await page.evaluate(() => _aiWidget.conversationId)).toBe('');
  await page.evaluate(() => { _aiWidget._setBlocked(true); _aiWidget.newConversation(); });
  await expect(page.locator('#asw-input')).toBeDisabled();
});

test('CRLF, split UTF-8 and completion metadata are rendered exactly once', async ({ page }) => {
  await boot(page, 'atomic', 'dark', { streamEndpoint: '/demo-api/chat/stream/?scenario=crlf' });
  await rawSend(page, 'سؤال'); await idle(page);
  await expect(page.locator('.asw-row.bot .asw-bubble')).toHaveText('پاسخ آزمایشی فارسی، کامل و بدون قطع شدن.');
  await expect(page.locator('.asw-row.bot')).toHaveCount(1);
  await expect(page.locator('.asw-feedback')).toHaveCount(1);
  await expect(page.locator('.asw-citations')).toHaveCount(1);
  await expect(page.locator('.streaming')).toHaveCount(0);
});

test('incomplete stream keeps partial text and offers the correct retry', async ({ page }) => {
  await boot(page, 'linen', 'light', { streamEndpoint: '/demo-api/chat/stream/?scenario=broken' });
  await rawSend(page, 'سؤال اصلی'); await idle(page);
  await expect(page.locator('.asw-stream-note')).toHaveText('پاسخ کامل دریافت نشد');
  await expect(page.locator('.asw-retry')).toHaveCount(1);
  await expect(page.locator('.streaming')).toHaveCount(0);
  await expect(page.locator('#asw-input')).toBeEnabled();
});

test('timeout is recoverable and does not erase the next draft', async ({ page }) => {
  await boot(page, 'md3', 'dark', { streamEndpoint: '/demo-api/chat/stream/?scenario=hang', timeoutMs: 250 });
  await rawSend(page, 'سؤال');
  await page.locator('#asw-input').fill('پیش‌نویس بعدی');
  await idle(page);
  await expect(page.locator('.asw-error-bubble')).toContainText('طول کشید');
  await expect(page.locator('.asw-retry')).toBeVisible();
  await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس بعدی');
});

test('closing while a reply arrives never steals focus and notifies once', async ({ page }) => {
  await boot(page);
  await rawSend(page, 'ساعت کاری');
  await page.locator('#asw-close').click();
  await idle(page);
  await expect(page.locator('#asw-fab')).toBeFocused();
  await expect(page.locator('#asw-fab-badge')).toHaveText('1');
  await expect(page.locator('#asw-panel')).toHaveAttribute('aria-hidden', 'true');
  await page.locator('#asw-fab').click();
  await expect(page.locator('#asw-fab-badge')).toBeHidden();
});

test('quota response keeps composer locked after request completion in every theme', async ({ page }) => {
  await page.route('**/demo-api/chat/stream/', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ answer: 'سهمیهٔ سرویس تمام شده است.', quota_locked: true, quota_message: 'سهمیهٔ سرویس تمام شده است.' }) }));
  for (const theme of THEMES) {
    await boot(page, theme);
    await rawSend(page, 'پیام'); await idle(page);
    await expect(page.locator('#asw-input')).toBeDisabled();
    await expect(page.locator('#asw-send')).toBeDisabled();
    await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state', 'locked');
    await expect(page.locator('.asw-error-bubble')).toHaveCount(0);
    await expect(page.locator('.asw-feedback')).toHaveCount(0);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  }
});

test('stream endpoint returning JSON does not send a duplicate fallback POST', async ({ page }) => {
  let posts = 0;
  page.on('request', r => { if (r.method() === 'POST' && /\/chat\//.test(r.url())) posts++; });
  await page.route('**/demo-api/chat/stream/', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ answer: 'پاسخ JSON روی مسیر استریم', message_id: 101 }) }));
  await boot(page); await rawSend(page, 'سؤال'); await idle(page);
  expect(posts).toBe(1);
  await expect(page.locator('.asw-row.bot .asw-bubble')).toHaveText('پاسخ JSON روی مسیر استریم');
});

test('failed feedback and unsupported clipboard are recoverable', async ({ page }) => {
  await page.route('**/demo-api/feedback/', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }));
  await boot(page);
  await page.evaluate(() => { _aiWidget._lastUserMessage = 'سؤال'; _aiWidget.handleAnswerResult('**پاسخ کامل** برای کپی', { message_id: 101 }); Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); });
  await page.locator('.fb-copy').click();
  await expect(page.locator('.fb-copy')).toHaveClass(/copied/);
  await page.locator('.thumbs-up').click();
  await expect(page.locator('.thumbs-up')).toBeEnabled();
  await expect(page.locator('.thumbs-up')).toHaveAttribute('aria-pressed', 'false');
});

test('contact dialog and validation messages pass accessibility checks', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await boot(page, 'skuermo', 'dark');
  await page.locator('#asw-contact').click();
  await page.locator('.asw-form-submit').click();
  const results = await new AxeBuilder({ page }).include('#ai-support-widget-host').withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  expect(results.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
});

test('rich messages scroll internally and reject executable URLs and HTML', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 820 });
  await boot(page, 'glassmo', 'dark');
  await page.evaluate(() => {
    _aiWidget._chatStarted = true; _aiWidget.collapseHero();
    _aiWidget.handleAnswerResult('**جدول و کد**\n\n| عنوان طولانی ستون اول | ستون دوم |\n|---|---|\n| داده بسیار بسیار طولانی | ۱۲۳۴ |\n\n```js\nconst x = "' + 'x'.repeat(200) + '";\n```\n\n[لینک خطرناک](javascript:alert(1))\n<img src=x onerror=alert(1)>', { citations: [{ title: 'منبع', url: 'javascript:alert(1)' }], rule_actions: [{ type: 'suggest_link', payload: 'javascript:alert(1)' }] });
  });
  await assertNoOverflow(page);
  await expect(page.locator('.asw-bubble img')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await page.locator('.asw-code-block').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
});

test('destroy stops global listeners and restores page scrolling; remount is safe', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 820 });
  await boot(page);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.evaluate(() => _aiWidget.destroy());
  await expect(page.locator('#ai-support-widget-host')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
  await page.evaluate(async () => { window._aiWidget = new AISupportWidget({ apiEndpoint:'/demo-api/chat/', showTeaser:false }); await _aiWidget.ready; _aiWidget.open(); });
  await expect(page.locator('#asw-panel')).toBeVisible();
  await page.evaluate(() => { dispatchEvent(new Event('resize')); _aiWidget.destroy(); dispatchEvent(new Event('offline')); });
});
