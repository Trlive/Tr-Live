import test from 'node:test';
import assert from 'node:assert/strict';
import { API_ACTIONS, COMPONENTS, LIMITS, flagsOf, urlsOf, validateScreen } from '../src/modules/sdui/v2/sdui_v2.schema.js';
import { versionAtLeast } from '../src/modules/sdui/v2/sdui_v2.service.js';

const col = (...children) => ({ type: 'column', children });
const ok = (root) => validateScreen('help', { root });
const bad = (root, re) => assert.throws(() => validateScreen('help', { root }), (e) => re.test(e.message), `geçti: ${JSON.stringify(root)}`);

test('tanınmayan bileşen reddedilir', () => {
  bad({ type: 'webview_full' }, /bilinmeyen bileşen/i);
  bad({ type: 'script' }, /bilinmeyen bileşen/i);
});

test('katalogdaki her bileşen doğrulanabilir', () => {
  for (const type of Object.keys(COMPONENTS)) {
    assert.doesNotThrow(() => validateScreen('help', { root: { type } }), `başarısız: ${type}`);
  }
});

test('katalogda OLMAYAN alanlar düşer, sessizce taşınmaz', () => {
  const out = ok({ type: 'title', text: 'Merhaba', onTapEval: 'alert(1)', style: { color: 'red' } });
  assert.deepEqual(out.root, { type: 'title', text: 'Merhaba' });
});

test('alt bileşen alamayan tür çocuk alırsa reddedilir', () => {
  bad({ type: 'title', text: 'x', children: [{ type: 'title' }] }, /alt bileşen alamaz/i);
});

// ---- Eylemler: asıl güvenlik yüzeyi ----

test('api eylemi SERBEST ADRES almaz, yalnızca izinli ad', () => {
  bad({ type: 'notice', text: 'x', action: { type: 'api', url: 'https://kotu.example/steal' } }, /izinli olmayan işlem/i);
  bad({ type: 'notice', text: 'x', action: { type: 'api', name: 'deleteAllUsers' } }, /izinli olmayan işlem/i);
  const good = ok({ type: 'notice', text: 'x', action: { type: 'api', name: 'markAllRead' } });
  assert.deepEqual(good.root.action, { type: 'api', name: 'markAllRead', arg: null });
  assert.ok(Object.hasOwn(API_ACTIONS, 'markAllRead'));
});

test('openScreen yalnızca izinli ekranları açar — oda ve giriş yok', () => {
  for (const screen of ['room', 'login', 'checkout', 'admin']) {
    bad({ type: 'listItem', title: 'x', action: { type: 'openScreen', screen } }, /açılamaz/i);
  }
  assert.doesNotThrow(() => ok({ type: 'listItem', title: 'x', action: { type: 'openScreen', screen: 'wallet' } }));
});

test('openUrl yalnızca https', () => {
  bad({ type: 'banner', action: { type: 'openUrl', url: 'http://x.example' } }, /https/i);
  bad({ type: 'banner', action: { type: 'openUrl', url: 'javascript:alert(1)' } }, /https/i);
  assert.doesNotThrow(() => ok({ type: 'banner', action: { type: 'openUrl', url: 'https://x.example/a' } }));
});

test('veri kaynağı izinli adlarla sınırlı', () => {
  bad({ type: 'repeater', source: 'users' }, /izinli olmayan veri kaynağı/i);
  assert.doesNotThrow(() => ok({ type: 'repeater', source: 'inbox' }));
});

test('simge ve renk rolü kapalı liste', () => {
  bad({ type: 'notice', text: 'x', icon: 'nuke' }, /bilinmeyen simge/i);
  bad({ type: 'notice', text: 'x', tone: '#ff0000' }, /bilinmeyen renk rolü/i);
});

test('görsel adresi yüklenmiş dosya ya da https olmalı', () => {
  bad({ type: 'image', url: 'file:///etc/passwd' }, /görsel adresi geçersiz/i);
  assert.doesNotThrow(() => ok({ type: 'image', url: 'https://cdn.example/a.png' }));
});

// ---- Sınırlar: telefonu kilitleyen düzen kaydedilemesin ----

test('çok derin ağaç reddedilir', () => {
  let node = { type: 'column', children: [] };
  const root = node;
  for (let i = 0; i < LIMITS.depth + 2; i++) { const next = { type: 'column', children: [] }; node.children.push(next); node = next; }
  bad(root, /çok derin/i);
});

test('çok fazla düğüm reddedilir', () => {
  const kids = Array.from({ length: LIMITS.children }, () => ({ type: 'title', text: 'x' }));
  const root = { type: 'column', children: Array.from({ length: 10 }, () => ({ type: 'column', children: kids })) };
  bad(root, /çok büyük/i);
});

test('tek düğümde çok fazla çocuk reddedilir', () => {
  bad(col(...Array.from({ length: LIMITS.children + 1 }, () => ({ type: 'title' }))), /alt bileşen/i);
});

test('uzun metin reddedilir', () => {
  bad({ type: 'description', text: 'a'.repeat(LIMITS.text + 1) }, /en fazla/i);
});

// ---- Form ----

test('form alan adları tekil olmalı', () => {
  bad(col({ type: 'textInput', name: 'eposta' }, { type: 'textInput', name: 'eposta' }), /birden fazla kez/i);
});

test('form alan adı biçimi zorunlu', () => {
  bad({ type: 'textInput', name: '1; DROP TABLE' }, /alan adı/i);
  assert.doesNotThrow(() => ok({ type: 'textInput', name: 'telefon_no' }));
});

// ---- Sürüm ve bayrak ----

test('minApp biçimi doğrulanır ve korunur', () => {
  bad({ type: 'title', minApp: 'son' }, /1\.2\.3/);
  assert.equal(ok({ type: 'title', minApp: '2.148.0' }).root.minApp, '2.148.0');
});

test('flag ve url toplama', () => {
  const root = col(
    { type: 'banner', flag: 'yeni_etkinlik', action: { type: 'openUrl', url: 'https://a.example/1' } },
    { type: 'notice', text: 'x', flag: 'yeni_etkinlik' },
    { type: 'card', title: 'y', action: { type: 'openUrl', url: 'https://b.example/2' } },
  );
  const out = ok(root);
  assert.deepEqual(flagsOf(out.root), ['yeni_etkinlik']);
  assert.deepEqual(urlsOf(out.root).sort(), ['https://a.example/1', 'https://b.example/2']);
});

test('normalleştirme kararlı: aynı içerik aynı çıktı', () => {
  const a = validateScreen('help', { root: { type: 'title', text: ' Merhaba ', fazlalik: 1 } });
  const b = validateScreen('help', { root: { type: 'title', fazlalik: 9, text: 'Merhaba' } });
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'sürüm özeti yalnızca gerçek değişiklikte değişmeli');
});

test('ekran adı doğrulanır', () => {
  assert.throws(() => validateScreen('Help!', { root: col() }), /Ekran adı/i);
  assert.throws(() => validateScreen('help', { tabs: [] }), /kök bileşen/i);
});

// ---- Sürüm karşılaştırma ----

test('versionAtLeast', () => {
  assert.equal(versionAtLeast('2.147.0', '2.147.0'), true);
  assert.equal(versionAtLeast('2.148.0', '2.147.9'), true);
  assert.equal(versionAtLeast('2.146.9', '2.147.0'), false);
  assert.equal(versionAtLeast('2.147.0', null), true, 'eşik yoksa herkes geçer');
  assert.equal(versionAtLeast('', '1.0.0'), false, 'sürüm bildirmeyen eski uygulama geçemez');
  assert.equal(versionAtLeast('10.0.0', '9.99.99'), true, 'sayısal karşılaştırma, metin değil');
});
