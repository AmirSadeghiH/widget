const { test, expect } = require('@playwright/test');
const { THEMES, boot, idle, rawSend, assertNoOverflow } = require('./helpers.cjs');
const errors = new WeakMap();
test.beforeEach(async ({ page }) => { const list = []; errors.set(page, list); page.on('pageerror', e => list.push(e.message)); });
test.afterEach(async ({ page }) => { expect(errors.get(page) || [], 'no unhandled runtime errors').toEqual([]); });

for (const theme of THEMES) {
  test(`${theme} — welcome actions are visible, no microphone even if enabled by legacy config`, async ({ page }) => {
    await boot(page, theme, 'light', { enableVoiceInput: true });
    const visible = await page.evaluate(() => {
      const w = _aiWidget;
      const transcript = w.messages.getBoundingClientRect();
      return [...w.root.querySelectorAll('.asw-hero-grid .asw-suggestion')].map(card => {
        const box = card.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height, first: transcript.top, last: transcript.bottom };
      });
    });
    expect(visible).toHaveLength(4);
    for (const card of visible) {
      expect(card.height).toBeGreaterThanOrEqual(44);
      expect(card.top).toBeGreaterThanOrEqual(card.first);
      expect(card.bottom).toBeLessThanOrEqual(card.last + 1);
    }
    await expect(page.locator('[id*="mic"], .asw-mic')).toHaveCount(0);
    await page.locator('#asw-input').fill('قابل ارسال');
    await expect(page.locator('#asw-send')).toBeEnabled();
  });
}

test('preview never reads, overwrites or deletes real conversation storage', async ({ page }) => {
  const real = { local: { asw_history_127: 'unrelated', 'asw_history_127.0.0.1': 'real-history', 'asw_conversation_127.0.0.1': JSON.stringify({ id: 'real-customer', token: 'real-customer-token' }) }, session: { asw_conversation_id: 'real-customer', asw_conversation_token: 'real-customer-token', asw_blocked: '1', asw_teaser_dismissed: 'real' } };
  await page.addInitScript(seed => { for (const [k,v] of Object.entries(seed.local)) localStorage.setItem(k,v); for (const [k,v] of Object.entries(seed.session)) sessionStorage.setItem(k,v); }, real);
  await boot(page, 'classic', 'light', { previewMode: true });
  expect(await page.evaluate(() => _aiWidget.conversationId)).toBe('');
  await page.evaluate(() => { _aiWidget._setBlocked(true); _aiWidget._clearBlocked(); _aiWidget.newConversation(); });
  await rawSend(page, 'پیام نمونه'); await idle(page);
  await page.evaluate(() => { _aiWidget.newConversation(); _aiWidget.close(); _aiWidget.open(); });
  const stored = await page.evaluate(() => ({ local: Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])), session: Object.fromEntries(Object.keys(sessionStorage).map(k => [k, sessionStorage.getItem(k)])) }));
  expect(stored).toEqual(real);
});

test('bounded config bootstrap preserves custom title and can recover from a timeout', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/demo-api/widget-config/', async route => { await gate; await route.fulfill({ json: { title:'عنوان قدیمی', subtitle:'توضیح قدیمی' } }).catch(() => {}); });
  await boot(page, 'linen', 'dark', { configTimeoutMs: 150 });
  release();
  await expect(page.locator('#asw-title')).toHaveText('پشتیبانی آنلاین فروشگاه');
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','offline');
  await rawSend(page,'پاسخ‌گویی دوباره'); await idle(page);
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','online');
});

test('a 5xx config response is not advertised as a healthy service', async ({ page }) => {
  await page.route('**/demo-api/widget-config/', route => route.fulfill({ status: 503, json: { message:'temporarily unavailable' } }));
  await boot(page, 'onyx');
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','unavailable');
  await expect(page.locator('#asw-badge-text')).toHaveText('سرویس موقتاً در دسترس نیست');
  await rawSend(page,'تلاش دوباره'); await idle(page);
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','online');
});

test('message length guard, live character count and draft recovery', async ({ page }) => {
  await boot(page,'md3','dark',{maxMessageLength:300});
  await expect(page.locator('#asw-input')).toHaveAttribute('maxlength','300');
  await page.locator('#asw-input').fill('پ'.repeat(250));
  await expect(page.locator('#asw-input-count')).toBeVisible();
  await expect(page.locator('#asw-send')).toBeEnabled();
  await page.evaluate(() => { _aiWidget.input.value = 'x'.repeat(301); _aiWidget.input.dispatchEvent(new Event('input')); });
  await expect(page.locator('#asw-send')).toBeDisabled();
  expect(await page.evaluate(() => _aiWidget.send())).toBe(false);
  await expect(page.locator('#asw-input')).toHaveValue('x'.repeat(301));
  await page.locator('#asw-input').fill('کوتاه');
  await expect(page.locator('#asw-input-count')).toBeHidden();
  await expect(page.locator('#asw-send')).toBeEnabled();
  await assertNoOverflow(page);
});

test('touch Enter inserts a newline; send and stop are still reachable with the keyboard open', async ({ browser }) => {
  const context=await browser.newContext({hasTouch:true, viewport:{width:390,height:840}, baseURL:'http://127.0.0.1:4173', reducedMotion:'reduce'});
  const page=await context.newPage();
  try {
    await boot(page,'clay','dark',{streamEndpoint:'/demo-api/chat/stream/?scenario=hang'});
    await page.locator('#asw-input').fill('سلام');
    await page.locator('#asw-input').press('Enter');
    await expect(page.locator('#asw-input')).toHaveValue('سلام\n');
    await expect(page.locator('.asw-row.user')).toHaveCount(0);
    await page.locator('#asw-input').pressSequentially('خط دوم');
    await page.setViewportSize({width:390,height:380});
    await page.waitForFunction(()=>_aiWidget.panel.getBoundingClientRect().height<=visualViewport.height+1);
    await assertNoOverflow(page);
    const accepted=page.waitForRequest(r=>r.method()==='POST' && r.url().includes('/chat/stream/'));
    await page.locator('#asw-send').click();
    expect((await accepted).postDataJSON().message).toBe('سلام\nخط دوم');
    await expect(page.locator('#asw-send')).toBeEnabled();
    await page.locator('#asw-input').fill('پیش‌نویس بعدی');
    await page.locator('#asw-send').click(); await idle(page);
    await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس بعدی');
    await assertNoOverflow(page);
    await page.setViewportSize({width:390,height:840});
    await page.waitForFunction(()=>_aiWidget.panel.getBoundingClientRect().height>=visualViewport.height-1);
    await assertNoOverflow(page);
  } finally { await context.close(); }
});

test('live handoff failure is retryable, operator messages have their own identity and one unread badge', async ({ page }) => {
  let releaseFeed;
  const feedGate=new Promise(resolve=>{releaseFeed=resolve;});
  // An unread assertion must not race the fixture's autonomous reply timer:
  // subscribe only after the panel is closed, including catch-up messages.
  await page.route('**/demo-api/handoff/stream/**',async route=>{await feedGate;await route.continue().catch(()=>{});});
  let requests=0;
  await page.route('**/demo-api/handoff/', route => {
    if (++requests === 1) return route.fulfill({status:500,json:{error:'temporary'}});
    return route.continue();
  });
  await boot(page,'glassmo','dark');
  const description=await page.locator('#asw-subtitle').textContent();
  await rawSend(page,'ساعت کاری'); await idle(page);
  await page.locator('.thumbs-down').click();
  await expect(page.locator('.asw-live-cta')).toBeVisible();
  await page.locator('.asw-live-cta').click();
  await expect(page.locator('.asw-live-cta')).toBeEnabled();
  await expect(page.locator('#asw-toast')).toContainText('ناموفق');
  await expect(page.locator('.asw-live-row-note')).toHaveCount(0);
  await page.locator('.asw-live-cta').click();
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','human_waiting');
  await expect(page.locator('#asw-subtitle')).toHaveText(description);
  await page.locator('#asw-close').click();
  releaseFeed();
  await expect(page.locator('#asw-fab-badge')).toHaveText('1');
  await expect(page.locator('.asw-live-row-agent')).toHaveCount(1);
  await expect(page.locator('.asw-live-row-agent .asw-feedback')).toHaveCount(0);
  await page.locator('#asw-fab').click();
  await expect(page.locator('#asw-fab-badge')).toBeHidden();
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','human_active');
  await rawSend(page,'پیام به کارشناس'); await idle(page);
  await expect(page.locator('.asw-row[data-sender="ai"]')).toHaveCount(1);
  await expect(page.locator('.asw-live-row-note').filter({hasText:'پیام شما برای کارشناس ارسال شد.'})).toHaveCount(1);
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','human_active');
  expect(await page.evaluate(()=>_aiWidget.messageCount)).toBe(await page.locator('.asw-row').count());
  expect(requests).toBe(2);
});

test('human JSON acknowledgements never appear as AI answers or decrement an unrelated row', async ({ page }) => {
  await page.route('**/demo-api/handoff/stream/**', route=>route.fulfill({contentType:'text/event-stream',body:'event: connected\ndata: {"active":true,"status":"waiting"}\n\n'}));
  await page.route('**/demo-api/chat/', route=>route.fulfill({json:{answer:'پیام شما برای کارشناس ارسال شد.',conversation_id:'demo-human',conversation_token:'demo-human-token',live_agent:true,human:{active:true,status:'waiting'}}}));
  await boot(page,'skuermo','dark',{enableStreaming:false});
  await rawSend(page,'پیام به کارشناس'); await idle(page);
  await expect(page.locator('.asw-row.user')).toHaveCount(1);
  await expect(page.locator('.asw-live-row-note')).toHaveCount(1);
  await expect(page.locator('.asw-row[data-sender="ai"]')).toHaveCount(0);
  await expect(page.locator('.asw-feedback')).toHaveCount(0);
  expect(await page.evaluate(()=>_aiWidget.messageCount)).toBe(2);
  await expect(page.locator('.asw-disclaim')).toContainText('پس از اتصال کارشناس');
  await page.evaluate(()=>_aiWidget.newConversation());
  await expect(page.locator('.asw-disclaim')).toContainText('پاسخ‌های این دستیار');
});

test('operator SSE accepts CRLF, multiline JSON and EOF; reconnect does not duplicate messages', async ({ page }) => {
  const message={id:9999,sender:'agent',content:'پاسخ فارسی کارشناس'};
  const wire='event: connected\r\ndata: {"active":true,"status":"claimed"}\r\n\r\n'+
    'event: message\r\ndata: {"id":9999,\r\ndata: "sender":"agent","content":"پاسخ فارسی کارشناس"}\r\n\r\n'+
    'event: message\r\ndata: '+JSON.stringify(message);
  await page.route('**/demo-api/handoff/stream/**', route=>route.fulfill({contentType:'text/event-stream',body:wire}));
  await boot(page,'atomic');
  await page.evaluate(()=>{ _aiWidget.conversationId='demo-feed'; _aiWidget.conversationToken='demo-feed-token'; _aiWidget._chatStarted=true; _aiWidget.collapseHero(); _aiWidget.live.restore({active:true,status:'claimed'},0,''); });
  await expect(page.locator('.asw-live-row-agent')).toHaveCount(1);
  await expect(page.locator('.asw-live-row-agent .asw-bubble')).toHaveText('پاسخ فارسی کارشناس');
  await expect(page.locator('.asw-disclaim')).toHaveText('این گفتگو با پشتیبانی انسانی ادامه دارد.');
  await page.waitForTimeout(700);
  await expect(page.locator('.asw-live-row-agent')).toHaveCount(1);
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','human_active');
});

test('live polling honours explicit active state and ignores a late response after reset', async ({ page }) => {
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/demo-api/messages/**',async route=>{ await gate; await route.fulfill({json:{messages:[{id:1,sender:'agent',content:'پاسخ قدیمی نباید نمایش داده شود'}],human:{active:true,status:'claimed'}}}).catch(()=>{}); });
  await boot(page,'neu','dark');
  await page.evaluate(()=>{ window.__feedEvents=[]; window.__feed=AISupportLive.liveSession({streamUrl:'',pollUrl:'/demo-api/messages/',conversationId:'demo-poll',token:'demo',pollInterval:100,onEvent:(event,data)=>__feedEvents.push({event,data})}); });
  await page.evaluate(()=>__feed.stop());
  release();
  await page.waitForTimeout(200);
  expect(await page.evaluate(()=>__feedEvents)).toEqual([]);
  await page.unroute('**/demo-api/messages/**');
  await page.route('**/demo-api/messages/**', route=>route.fulfill({json:{messages:[],live_handoff:{active:true,status:'waiting'}}}));
  await page.evaluate(()=>{ window.__feedEvents=[]; window.__feed=AISupportLive.liveSession({streamUrl:'',pollUrl:'/demo-api/messages/',conversationId:'demo-poll',token:'demo',pollInterval:100,onEvent:(event,data)=>__feedEvents.push({event,data})}); });
  await page.waitForFunction(()=>__feedEvents.length>0);
  expect(await page.evaluate(()=>__feedEvents.some(item=>item.event==='closed'))).toBe(false);
  await page.evaluate(()=>__feed.stop());
});

test('unsupported SSE falls back once to JSON while preserving the question', async ({ page }) => {
  const requests=[];
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/chat/'))requests.push({url:r.url(),body:r.postDataJSON()});});
  await page.route('**/demo-api/chat/stream/', route=>route.fulfill({status:405,body:''}));
  await boot(page,'minimal'); await rawSend(page,'پرسش ثابت'); await idle(page);
  expect(requests).toHaveLength(2);
  expect(requests.map(r=>r.body.message)).toEqual(['پرسش ثابت','پرسش ثابت']);
  await expect(page.locator('.asw-row.user')).toHaveCount(1);
  await expect(page.locator('.asw-row.bot')).toHaveCount(1);
});

test('retries keep their own original question and do not consume a typed next draft', async ({ page }) => {
  let requests=0;
  const bodies=[];
  await page.route('**/demo-api/chat/stream/', async route=>{
    bodies.push(route.request().postDataJSON());
    await route.fulfill(++requests===1?{status:500,json:{message:'خطای موقت'}}:{json:{answer:'پاسخ تلاش دوم',message_id:101}});
  });
  await boot(page,'fluen','dark'); await rawSend(page,'سؤال اصلی'); await idle(page);
  await page.locator('#asw-input').fill('پیش‌نویس متفاوت');
  await page.locator('.asw-retry').click(); await idle(page);
  expect(bodies.map(r=>r.message)).toEqual(['سؤال اصلی','سؤال اصلی']);
  await expect(page.locator('.asw-error-bubble')).toHaveCount(0);
  await expect(page.locator('#asw-input')).toHaveValue('پیش‌نویس متفاوت');
  await expect(page.locator('.asw-row.bot .asw-bubble')).toHaveText('پاسخ تلاش دوم');
});

test('credit visibility never hides customer resources and malformed logos have a fallback', async ({ page }) => {
  await boot(page,'glassmo','light',{showPoweredBy:false,faqUrl:'#guide',privacyUrl:'#privacy',supportEmail:'support@example.com',logoUrl:'/widget/missing-image.png',iconType:'custom',customIconUrl:'/widget/missing-icon.png'});
  await expect(page.locator('#asw-credit')).toBeHidden();
  await expect(page.locator('#asw-resources a')).toHaveCount(3);
  await expect(page.locator('#asw-powered')).toBeVisible();
  await expect(page.locator('#asw-avatar img, .asw-hero-orb img, .asw-fab-custom-icon')).toHaveCount(0);
  await expect(page.locator('.asw-fab-icon-main svg')).toHaveCount(1);
  await assertNoOverflow(page);
});

test('auto mode follows the OS only until the visitor chooses an explicit mode', async ({ page }) => {
  await page.emulateMedia({colorScheme:'dark'});
  await boot(page,'md3','auto');
  expect(await page.evaluate(()=>_aiWidget.root.classList.contains('dark'))).toBe(true);
  await page.emulateMedia({colorScheme:'light'});
  await expect(page.locator('.asw-root')).not.toHaveClass(/dark/);
  await page.locator('#asw-theme-toggle').click();
  await page.emulateMedia({colorScheme:'dark'});
  await page.emulateMedia({colorScheme:'light'});
  await expect(page.locator('.asw-root')).toHaveClass(/dark/);
});

test('reduced motion and high contrast keep controls visible and functional', async ({ page }) => {
  await boot(page,'neu','dark',{enableAnimations:true});
  expect(await page.locator('.asw-hero').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.emulateMedia({forcedColors:'active'});
  await page.locator('#asw-input').fill('یک پیام قابل ارسال');
  await expect(page.locator('#asw-send')).toBeEnabled();
  await assertNoOverflow(page);
  await page.locator('#asw-contact').click();
  await expect(page.locator('#asw-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#asw-sheet')).toBeHidden();
});

test('done-only identities persist and post-completion SSE frames cannot append late text',async({page})=>{
  const wire='event: token\ndata: {"t":"پاسخ صحیح"}\n\n'+
    'event: done\ndata: {"conversation_id":"demo-done","conversation_token":"demo-done-token","message_id":101}\n\n'+
    'event: token\ndata: {"t":"متن دیررس نباید نمایش داده شود"}\n\n';
  await page.route('**/demo-api/chat/stream/',route=>route.fulfill({contentType:'text/event-stream',body:wire}));
  await boot(page); await rawSend(page,'سؤال'); await idle(page);
  await expect(page.locator('.asw-row.bot .asw-bubble')).toHaveText('پاسخ صحیح');
  expect(await page.evaluate(()=>({id:_aiWidget.conversationId,token:_aiWidget.conversationToken}))).toEqual({id:'demo-done',token:'demo-done-token'});
});

test('a logical 200 rejection is not falsely reported as saved feedback or handoff',async({page})=>{
  await page.route('**/demo-api/feedback/',route=>route.fulfill({json:{ok:false}}));
  await page.route('**/demo-api/handoff/',route=>route.fulfill({json:{ok:false,error:'temporary'}}));
  await boot(page); await rawSend(page,'سؤال'); await idle(page);
  await page.locator('.thumbs-up').click();
  await expect(page.locator('.thumbs-up')).toBeEnabled();
  await expect(page.locator('.thumbs-up')).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(()=>_aiWidget.live.request('سؤال'))).toBe(false);
  await expect(page.locator('.asw-live-row-note')).toHaveCount(0);
  await expect(page.locator('.asw-root')).toHaveAttribute('data-ui-state','online');
});

test('the contact close control stays reachable while the form scrolls',async({page})=>{
  await page.setViewportSize({width:320,height:600});
  await boot(page,'clay','dark');await page.locator('#asw-contact').click();
  const box=await page.evaluate(()=>{const card=_aiWidget.root.querySelector('.asw-sheet-card');card.scrollTop=card.scrollHeight;return{card:card.getBoundingClientRect().toJSON(),close:_aiWidget.sheetClose.getBoundingClientRect().toJSON()};});
  expect(box.close.top).toBeGreaterThanOrEqual(box.card.top);
  expect(box.close.bottom).toBeLessThanOrEqual(box.card.bottom);
  await page.locator('#asw-sheet-close').click();await expect(page.locator('#asw-sheet')).toBeHidden();
});

test('IME Escape cancels composition rather than closing the conversation',async({page})=>{
  await boot(page);
  await page.evaluate(()=>_aiWidget.input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true})));
  await expect(page.locator('#asw-panel')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.locator('#asw-panel')).toBeHidden();
});

test('contact Enter submits once, freezes the submitted fields and restores them on failure',async({page})=>{
  let release,requests=0;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/demo-api/leads/',async route=>{requests++;await gate;await route.fulfill({status:500,json:{message:'دوباره تلاش کنید'}});});
  await boot(page,'md3');await page.locator('#asw-contact').click();
  await page.locator('#asw-sheet input[name="name"]').fill('سارا محمدی');
  await page.locator('#asw-sheet input[name="phone"]').fill('09123456789');
  await page.locator('#asw-sheet input[name="phone"]').press('Enter');
  await expect(page.locator('.asw-form-submit')).toBeDisabled();
  await expect(page.locator('#asw-sheet input[name="name"]')).toBeDisabled();
  await expect(page.locator('.asw-form')).toHaveAttribute('aria-busy','true');
  release();await expect(page.locator('.asw-form-submit')).toBeEnabled();
  await expect(page.locator('#asw-sheet input[name="name"]')).toBeEnabled();
  await expect(page.locator('#asw-sheet input[name="name"]')).toHaveValue('سارا محمدی');
  expect(requests).toBe(1);
});

test('the contact live action explains prerequisites and follows offline and lock states',async({page,context})=>{
  await boot(page);await page.locator('#asw-contact').click();
  await expect(page.locator('[data-live-contact] i')).toHaveText('ابتدا یک پیام در گفتگو ارسال کنید');
  await page.locator('[data-live-contact]').click();
  await expect(page.locator('#asw-sheet')).toBeHidden();await expect(page.locator('#asw-input')).toBeFocused();
  await expect(page.locator('#asw-toast')).toContainText('ابتدا یک پیام');
  await page.locator('#asw-contact').click();await context.setOffline(true);
  await expect(page.locator('[data-live-contact]')).toBeDisabled();
  await context.setOffline(false);await page.evaluate(()=>_aiWidget._setBlocked(true));
  await expect(page.locator('[data-live-contact]')).toBeDisabled();
});

test('reload restores the server conversation and the next message uses the same identity',async({page})=>{
  await boot(page);await rawSend(page,'سؤال قبلی');await idle(page);
  const identity=await page.evaluate(()=>({id:_aiWidget.conversationId,token:_aiWidget.conversationToken}));
  await page.reload();await page.waitForFunction(()=>window.__ready);
  await expect(page.locator('.asw-hero')).toHaveCount(0);await expect(page.locator('.asw-row')).toHaveCount(2);
  expect(await page.evaluate(()=>({id:_aiWidget.conversationId,token:_aiWidget.conversationToken}))).toEqual(identity);
  const sent=page.waitForRequest(r=>r.method()==='POST'&&r.url().includes('/chat/stream/'));
  await rawSend(page,'ادامهٔ گفتگو');const request=await sent;
  expect(request.postDataJSON().conversation_id).toBe(identity.id);expect(request.headers()['x-conversation-token']).toBe(identity.token);
  await idle(page);await expect(page.locator('.asw-row')).toHaveCount(4);
});

test('reset during delayed history restore cannot lock or repaint the new conversation',async({page})=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.addInitScript(()=>{window.__testOptions={configTimeoutMs:2000};localStorage.setItem('asw_conversation_127.0.0.1',JSON.stringify({id:'demo-old',token:'demo-old-token'}));});
  const history=page.waitForRequest(r=>r.url().includes('/demo-api/history/'));
  await page.route('**/demo-api/history/**',async route=>{await gate;await route.fulfill({json:{quota_locked:true,messages:[{role:'assistant',sender:'ai',content:'تاریخچهٔ قدیمی'}]}}).catch(()=>{});});
  await page.goto('/tests/fixture.html');await history;
  await page.evaluate(()=>{_aiWidget.open();_aiWidget.newConversation();});release();await page.waitForFunction(()=>__ready);
  await expect(page.locator('.asw-row')).toHaveCount(0);await expect(page.locator('.asw-hero')).toBeVisible();
  await expect(page.locator('#asw-input')).toBeEnabled();expect(await page.evaluate(()=>_aiWidget.conversationId)).toBe('');
});

test('remote message length and full customer title and description are honoured',async({page})=>{
  await page.route('**/demo-api/widget-config/',route=>route.fulfill({json:{title:'عنوان کامل مشتری',subtitle:'توضیح کوتاه و کامل مشتری',max_message_length:300,enable_voice_input:true}}));
  await boot(page,'classic','light',{title:null,subtitle:null});
  await expect(page.locator('#asw-title')).toHaveText('عنوان کامل مشتری');await expect(page.locator('#asw-subtitle')).toHaveText('توضیح کوتاه و کامل مشتری');
  await expect(page.locator('#asw-input')).toHaveAttribute('maxlength','300');await expect(page.locator('[id*="mic"]')).toHaveCount(0);
  await page.evaluate(async()=>{_aiWidget.destroy();window._aiWidget=new AISupportWidget({apiEndpoint:'/demo-api/chat/',title:undefined,subtitle:undefined});await _aiWidget.ready;_aiWidget.open();});
  await expect(page.locator('#asw-title')).toHaveText('عنوان کامل مشتری');
});
