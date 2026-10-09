const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const themes = JSON.parse(read('widget/themes/manifest.json'));
const core = read('widget/design-core.css').trimEnd();
const ui = read('widget/ui-shell.js').trimEnd();
const live = read('widget/live-handoff.js').trimEnd();

for (const [name, theme] of Object.entries(themes)) {
  test(`${name}: standalone syntax, shared behaviour, font and no microphone`, () => {
    const file = name === 'classic' ? 'widget.js' : `widget-${name}.js`;
    const source = read('widget/' + file);
    assert.doesNotThrow(() => new vm.Script(source, { filename: file }));
    assert.ok(source.includes(ui), 'shared UI shell is embedded verbatim');
    assert.ok(source.includes(live), 'live protocol is embedded verbatim');
    assert.ok(source.includes(core), 'structural CSS is embedded verbatim');
    assert.ok(source.includes(read(`widget/themes/${name}.css`).trimEnd()));
    assert.ok(source.includes(`"name": "${name}"`));
    assert.ok(source.includes('data:font/woff2;base64,'));
    assert.ok(source.includes('SIL OPEN FONT LICENSE Version 1.1'));
    assert.doesNotMatch(source, /\(\?<[=!]/, 'no Safari-incompatible lookbehind literals');
    assert.ok(source.includes(`theme "${theme.label}"`));
    assert.doesNotMatch(source, /SpeechRecognition|webkitSpeechRecognition|asw-mic|asw-wave|ICONS\.mic|initVoice\(/);
    assert.doesNotMatch(source, /@import|cdn\.jsdelivr|@asw-|__ASW_THEME/);
    assert.doesNotMatch(source, /demo-api/);
  });
}

test('Classic root entry point remains byte-identical', () => {
  assert.equal(read('widget.js'), read('widget/widget.js'));
});

test('Eleven complete, independent skins; no unsafe CSS template literals', () => {
  assert.equal(Object.keys(themes).length, 11);
  const recipes = new Set();
  for (const name of Object.keys(themes)) {
    const css = read(`widget/themes/${name}.css`);
    assert.ok(css.includes('.asw.dark{'));
    assert.ok(css.includes('.asw-hero'));
    assert.ok(css.includes('--asw-header-bg:'));
    assert.doesNotMatch(css + core, /`|\$\{/);
    recipes.add(css.replace(/#[0-9a-f]+|rgba?\([^)]*\)/gi, 'COLOR'));
  }
  assert.equal(recipes.size, 11, 'identities differ in more than colour');
  assert.doesNotMatch(core, /asw-title\{[^}]*text-overflow:ellipsis|asw-subtitle\{[^}]*white-space:nowrap/);
});

test('UI state is honest, deterministic and does not replace customer copy', () => {
  const window = { navigator: { onLine: true } };
  vm.runInNewContext(ui, { window });
  const api = window.AISupportUI;
  let mode = 'ai';
  const widget = { options: { subtitle: 'توضیح کامل مشتری', inputPlaceholder: 'پیام شما' }, root: { getAttribute: () => mode } };
  assert.equal(api.computeState(widget), 'online');
  widget._configReady = false; assert.equal(api.computeState(widget), 'unavailable');
  widget._configReady = true;
  widget._initializing = true; assert.equal(api.computeState(widget), 'init');
  widget._initializing = false; widget.isLoading = true; assert.equal(api.computeState(widget), 'thinking');
  mode = 'waiting'; assert.equal(api.computeState(widget), 'human_waiting');
  mode = 'human'; assert.equal(api.computeState(widget), 'human_active');
  window.navigator.onLine = false; assert.equal(api.computeState(widget), 'offline');
  widget._blocked = true; assert.equal(api.computeState(widget), 'locked');
  assert.equal(api.subtitleFor(widget), 'توضیح کامل مشتری');
  assert.equal(api.placeholderFor(widget, 'locked'), api.TEXT.lockedPlaceholder);
  widget._blocked = false; mode = 'ai';
  assert.equal(api.placeholderFor(widget, 'thinking'), 'پیام شما', 'next-message draft stays meaningful during a response');
});

test('Shared runtime uses guarded send, IME protection and true request cancellation', () => {
  const runtime = read('scripts/widget-runtime.js');
  assert.match(runtime, /e\.isComposing/);
  assert.match(runtime, /e\.keyCode === 229/);
  assert.match(runtime, /if \(!this\.sendText\(message\)\) return false/);
  assert.match(runtime, /requestId === self\._requestId/);
  assert.match(runtime, /this\.panel\.inert = true/);
  assert.match(runtime, /controller\.signal/);
  assert.match(runtime, /visualViewport/);
  assert.match(runtime, /if \(!res\.ok\) throw new Error/);
});
