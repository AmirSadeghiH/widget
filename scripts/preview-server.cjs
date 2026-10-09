#!/usr/bin/env node
/** Local-only theme QA server. /demo-api is a fixture, never a production API.
 * The installable scripts contain no reference to this server or its fixtures.
 * Binds all interfaces and uses relative URLs so Arena's HTTPS preview works.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const conversations = new Map();
let nextId = 1;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': mime['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 64000) throw new Error('Request too large');
  }
  return raw ? JSON.parse(raw) : {};
}
function conversation(id) {
  if (id && conversations.has(id)) return conversations.get(id);
  const value = { id: 'demo-' + nextId++, token: 'demo-token', messages: [], human: { active: false } };
  conversations.set(value.id, value);
  if (conversations.size > 200) conversations.delete(conversations.keys().next().value);
  return value;
}
function answerFor(message) {
  if (/قیمت|محصول/.test(message)) return '**انتخاب درست، با خیال راحت.**\n\nقیمت هر محصول در صفحهٔ آن مشخص است. برای انتخاب بهتر، نام محصول یا نیازتان را بنویسید تا راهنمایی‌تان کنم.';
  if (/ارسال|سفارش/.test(message)) return '**سفارش شما مهم است.**\n\nارسال سفارش‌ها در روزهای کاری انجام می‌شود.\n- ارسال معمولی: ۲ تا ۴ روز کاری\n- پیگیری: از بخش «سفارش‌های من»\n\nاگر شمارهٔ سفارش را دارید، همین‌جا بنویسید.';
  if (/مرجوع|بازگشت/.test(message)) return 'برای مرجوعی، تا **۷ روز پس از دریافت** فرصت دارید. محصول باید سالم و در بسته‌بندی اصلی باشد.\n\nبرای هماهنگی می‌توانید از دکمهٔ ارتباط با پشتیبانی در هدر استفاده کنید.';
  if (/ساعت|تعطیل/.test(message)) return '**ساعات پاسخ‌گویی**\n\nشنبه تا چهارشنبه از ۹ تا ۱۷\nپنجشنبه از ۹ تا ۱۳\n\nدر خارج از این ساعات هم می‌توانید درخواست تماس ثبت کنید.';
  return 'پیام شما دریافت شد. 🌿\n\nاین یک **پاسخ نمونه برای بررسی ویجت** است. در نصب واقعی، پاسخ‌ها از دانش پروژهٔ شما ساخته می‌شوند.\n\nمی‌توانید یک سؤال دیگر بنویسید، حالت روشن و تاریک را تغییر دهید یا فرم تماس را بررسی کنید.';
}
function append(conv, content, role, sender) {
  const item = { id: nextId++, content, role, sender, created_at: new Date().toISOString() };
  conv.messages.push(item);
  conv.messages = conv.messages.slice(-40);
  return item;
}
function openSse(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const timers = new Set();
  const later = (fn, delay) => { const timer = setTimeout(() => { timers.delete(timer); if (!res.destroyed) fn(); }, delay); timers.add(timer); return timer; };
  res.on('close', () => timers.forEach(clearTimeout));
  const emit = (name, data, crlf = false) => { if (!res.destroyed) res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`.replace(/\n/g, crlf ? '\r\n' : '\n')); };
  return { later, emit };
}

async function api(req, res, url) {
  const endpoint = url.pathname.replace('/demo-api/', '');
  if (endpoint === 'widget-config/') return json(res, { live_handoff: { enabled: true, sla_minutes: 3 }, show_teaser: false });
  if (endpoint === 'events/' || endpoint === 'feedback/' || endpoint === 'leads/') { await body(req); return json(res, { ok: true }); }
  if (endpoint === 'history/' || endpoint === 'messages/') {
    const conv = conversations.get(url.searchParams.get('conversation_id'));
    const after = Number(url.searchParams.get('after_id') || 0);
    return json(res, { messages: conv ? conv.messages.filter(item => item.id > after) : [], live_handoff: conv && conv.human, human: conv && conv.human, guard_blocked: false, quota_locked: false });
  }
  if (endpoint === 'handoff/' && req.method === 'POST') {
    const data = await body(req);
    const conv = conversation(data.conversation_id);
    if (data.channel === 'live_agent') conv.human = { active: true, status: 'waiting', sla_minutes: 3 };
    return json(res, { ok: true, human: conv.human });
  }
  if (endpoint === 'handoff/stream/') {
    const conv = conversations.get(url.searchParams.get('conversation_id'));
    const { later, emit } = openSse(req, res);
    if (!conv || !conv.human.active) { emit('closed', { active: false }); return res.end(); }
    emit('connected', conv.human);
    const after = Number(url.searchParams.get('after_id') || 0);
    const old = conv.messages.filter(item => item.sender === 'agent' && item.id > after);
    if (old.length) old.forEach(item => emit('message', item));
    if (conv.human.status === 'waiting') {
      later(() => { conv.human = { active: true, status: 'claimed', operator: 'کارشناس نمونه' }; emit('claimed', conv.human); }, 800);
      later(() => emit('message', append(conv, 'سلام! من کارشناس نمونه هستم. درخواست شما را بررسی می‌کنم؛ چطور می‌توانم کمک کنم؟', 'assistant', 'agent')), 1400);
    }
    later(() => res.end(), 2500);
    return;
  }
  if (endpoint === 'chat/' || endpoint === 'chat/stream/') {
    const data = await body(req);
    const conv = conversation(data.conversation_id);
    append(conv, data.message, 'user', 'user');
    const answer = answerFor(data.message || '');
    const meta = { conversation_id: conv.id, conversation_token: conv.token, message_id: nextId++, citations: [{ title: 'راهنمای فروشگاه — نمونه', url: '#demo-guide' }] };
    if (conv.human.active) Object.assign(meta, { live_agent: true, human: conv.human, delivery_note: 'پیام شما برای کارشناس ارسال شد.' });
    if (endpoint === 'chat/') {
      if (!conv.human.active) append(conv, answer, 'assistant', 'ai');
      return json(res, { answer: conv.human.active ? meta.delivery_note : answer, ...meta });
    }
    const scenario = url.searchParams.get('scenario');
    const { later, emit } = openSse(req, res);
    emit('meta', { conversation_id: conv.id, conversation_token: conv.token });
    if (scenario === 'hang') return;
    if (scenario === 'live' || conv.human.active) {
      if (!conv.human.active) conv.human = { active: true, status: 'waiting', sla_minutes: 3 };
      later(() => { emit('done', { ...meta, live_agent: true, human: conv.human, delivery_note: 'پیام شما برای کارشناس ارسال شد.' }); res.end(); }, 100);
      return;
    }
    if (scenario === 'crlf') {
      const wire = Buffer.from(`event: token\r\ndata: ${JSON.stringify({ t: 'پاسخ آزمایشی فارسی، کامل و بدون قطع شدن.' })}\r\n\r\nevent: done\r\ndata: ${JSON.stringify(meta)}\r\n\r\n`);
      let offset = 0;
      const send = () => {
        if (offset >= wire.length) return res.end();
        res.write(wire.subarray(offset, offset += 7));
        later(send, 4);
      };
      later(send, 50);
      return;
    }
    const parts = scenario === 'broken' ? ['بخشی از پاسخ دریافت شد.'] : answer.match(/.{1,12}|\n/gs) || [answer];
    let index = 0;
    const send = () => {
      if (index < parts.length) {
        emit('token', { t: parts[index++] });
        later(send, scenario === 'slow' ? 400 : 24);
      } else {
        if (scenario !== 'broken') { append(conv, answer, 'assistant', 'ai'); emit('done', meta); }
        res.end();
      }
    };
    later(send, scenario === 'slow' ? 500 : 100);
    return;
  }
  json(res, { ok: false, message: 'Unknown demo endpoint' }, 404);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://preview.invalid');
    if (url.pathname.startsWith('/demo-api/')) return await api(req, res, url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') { res.writeHead(302, { Location: '/widget/_themes_gallery.html' }); return res.end(); }
    // Do not expose .git, source tooling, tests, caches or arbitrary workspace files.
    if (!(pathname.startsWith('/widget/') || pathname === '/widget.js' || pathname === '/tests/fixture.html')) return json(res, { error: 'Not found' }, 404);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || pathname.split('/').some(part => part.startsWith('.'))) return json(res, { error: 'Not found' }, 404);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, { error: 'Not found' }, 404);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    if (!res.headersSent) json(res, { ok: false, message: error.message || 'Demo error' }, 400);
    else res.end();
  }
});
server.listen(port, '0.0.0.0', () => console.log(`Widget theme studio ready on 0.0.0.0:${port} — demo responses only.`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(); server.closeAllConnections(); process.exit(0); });
