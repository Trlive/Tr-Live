import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateLayout, TAB_TARGETS, OPEN_SCREENS } from '../sdui.schema.js';

const ok = (p) => validateLayout('home', p);

// SDUI, sunucuya uygulamanın arayüzünü değiştirme yetkisi verir. Bu testler o yetkinin
// sınırlarını koruyor: sunucu yeni yetenek üretemez, uygulamayı kullanılamaz hale getiremez.

test('boş düzen geçerli', () => {
  assert.deepEqual(ok({}), { tabs: [], sections: [] });
});

test('sekme sırası ve gizleme', () => {
  const r = ok({ tabs: [{ target: 'profile' }, { target: 'voice', hidden: true }, { target: 'feed', label: 'Keşfet' }] });
  assert.deepEqual(r.tabs.map((t) => t.target), ['profile', 'voice', 'feed']);
  assert.equal(r.tabs[1].hidden, true);
  assert.equal(r.tabs[2].label, 'Keşfet');
});

test('bilinmeyen sekme reddedilir (sunucu yeni sekme ÜRETEMEZ)', () => {
  assert.throws(() => ok({ tabs: [{ target: 'oyunlar' }] }), /bilinmeyen hedef/i);
});

test('aynı sekme iki kez yazılamaz', () => {
  assert.throws(() => ok({ tabs: [{ target: 'voice' }, { target: 'voice' }] }), /birden fazla/i);
});

test('bütün sekmeler gizlenemez — gezilemeyen uygulama kaydedilemez', () => {
  // Sunucudan gönderilebilecek en zararlı düzen budur.
  assert.throws(() => ok({ tabs: TAB_TARGETS.map((t) => ({ target: t, hidden: true })) }), /en az bir sekme/i);
});

test('izin verilmeyen ekran açılamaz', () => {
  // Oda ekranı (ses/görüntü), giriş ve cüzdan işlem akışı SDUI'ye kapalı.
  for (const bad of ['room', 'login', 'withdraw', 'admin']) {
    assert.throws(() => ok({ sections: [{ type: 'notice', text: 'x', action: { type: 'openScreen', screen: bad } }] }),
      /açılamaz/i, `"${bad}" kabul edilmemeliydi`);
  }
  assert.ok(OPEN_SCREENS.length > 0);
});

test('bilinmeyen eylem türü reddedilir', () => {
  // "eval", "runScript" gibi bir tür eklenmesi SDUI'yi uzaktan kod çalıştırmaya çevirirdi.
  assert.throws(() => ok({ sections: [{ type: 'notice', text: 'x', action: { type: 'runScript', code: 'x' } }] }),
    /bilinmeyen eylem/i);
});

test('openUrl yalnızca https', () => {
  const bad = { sections: [{ type: 'notice', text: 'x', action: { type: 'openUrl', url: 'http://a.com' } }] };
  assert.throws(() => ok(bad), /https/i);
  const good = { sections: [{ type: 'notice', text: 'x', action: { type: 'openUrl', url: 'https://a.com' } }] };
  assert.equal(ok(good).sections[0].action.url, 'https://a.com');
});

test('görsel adresi: yüklenmiş dosya ya da https', () => {
  const mk = (image) => ({ sections: [{ type: 'banner', items: [{ title: 'a', image }] }] });
  assert.doesNotThrow(() => ok(mk('/media/11111111-2222-3333-4444-555555555555.png')));
  assert.doesNotThrow(() => ok(mk('https://cdn.alanadi.com/a.png')));
  assert.throws(() => ok(mk('http://a.com/x.png')), /geçersiz/i);
  assert.throws(() => ok(mk('javascript:alert(1)')), /geçersiz/i);
  assert.throws(() => ok(mk('/etc/passwd')), /geçersiz/i);
});

test('etkinlik kimliği doğrulanır', () => {
  const mk = (id) => ({ sections: [{ type: 'notice', text: 'x', action: { type: 'openActivity', id } }] });
  assert.doesNotThrow(() => ok(mk('11111111-2222-3333-4444-555555555555')));
  assert.throws(() => ok(mk('1; DROP TABLE users')), /geçersiz/i);
});

test('boyut sınırları', () => {
  assert.throws(() => ok({ sections: Array.from({ length: 11 }, () => ({ type: 'notice', text: 'x' })) }), /en fazla 10/i);
  assert.throws(() => ok({ sections: [{ type: 'banner', items: Array.from({ length: 21 }, () => ({ title: 'a' })) }] }), /en fazla 20/i);
  assert.throws(() => ok({ sections: [{ type: 'notice', text: 'x'.repeat(401) }] }), /en fazla 400/i);
});

test('normalleştirme: aynı içerik aynı çıktıyı verir (sürüm boşuna değişmesin)', () => {
  const a = ok({ tabs: [{ target: 'voice', label: '  Sesli  ' }] });
  const b = ok({ tabs: [{ target: 'voice', label: 'Sesli', icon: '' }] });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('bilinmeyen bölüm türü reddedilir', () => {
  assert.throws(() => ok({ sections: [{ type: 'webview_full' }] }), /bilinmeyen tür/i);
});

// --- Uygulama tarafı aynı sınırları uyguluyor mu --------------------------------------------

const SCHEMA = new URL('../../../../../mobile/lib/hybrid/sdui/schema/sdui_schema.dart', import.meta.url);
const ENGINE = new URL('../../../../../mobile/lib/hybrid/sdui/engine/sdui_engine.dart', import.meta.url);
const RESOLVER = new URL('../../../../../mobile/lib/hybrid/sdui/resolver/sdui_action.dart', import.meta.url);
const HOME = new URL('../../../../../mobile/lib/screens/home_screen.dart', import.meta.url);

test('uygulama: iki taraftaki ekran listesi aynı', async () => {
  const s = await readFile(SCHEMA, 'utf8');
  const list = /const kOpenScreens = \[([^\]]*)\]/.exec(s)[1].replace(/['\s]/g, '').split(',').filter(Boolean);
  assert.deepEqual(list, OPEN_SCREENS, 'sunucu ve uygulama farklı ekran listesi kullanıyor');
});

test('uygulama: iki taraftaki sekme listesi aynı', async () => {
  const s = await readFile(SCHEMA, 'utf8');
  const list = /const kTabTargets = \[([^\]]*)\]/.exec(s)[1].replace(/['\s]/g, '').split(',').filter(Boolean);
  assert.deepEqual(list, TAB_TARGETS);
});

test('uygulama: bütün sekmeler gizliyse düzen kullanılmaz', async () => {
  const s = await readFile(SCHEMA, 'utf8');
  assert.ok(/!tabs\.any\(\(x\) => !x\.hidden\)\) return null/.test(s),
    'uygulama tarafında "görünür sekme yok" koruması eksik');
});

test('uygulama: bozuk düzen saklanmıyor', async () => {
  const s = await readFile(ENGINE, 'utf8');
  // Bozuk düzeni saklamak, uygulamayı ağ olmasa bile her açılışta bozuk açmak olurdu.
  const i = s.indexOf('if (parsed == null || parsed.isEmpty)');
  const j = s.indexOf('prefs.setString');
  assert.ok(i > 0 && j > i, 'doğrulamadan önce saklanıyor');
});

test('uygulama: openUrl izin listesinden geçiyor', async () => {
  const s = await readFile(RESOLVER, 'utf8');
  assert.ok(/WebViewPolicy\.canLoadExternal\(url\)/.test(s),
    'SDUI adresi WebView izin listesini atlatabiliyor');
});

test('uygulama: bayrak kapalıyken SDUI hiç devreye girmiyor', async () => {
  const s = await readFile(ENGINE, 'utf8');
  assert.ok(/if \(!Flags\.on\('sdui_home'\)\) return null;/.test(s), 'tek düğmeyle kapatılamıyor');
});

test('uygulama: yerleşik sekme düzeni kodda duruyor', async () => {
  const s = await readFile(HOME, 'utf8');
  // Üçüncü kademe geri düşme. Sunucu tamamen erişilemez olsa bile uygulama gezilebilmeli.
  assert.ok(/_builtInTabs = \[/.test(s), 'yerleşik düzen yok');
  assert.ok(/return out\.isEmpty \? _builtInTabs : out;/.test(s), 'boş SDUI listesinde yerleşiğe düşülmüyor');
  assert.ok(/layout == null \|\| layout\.tabs\.isEmpty\) return _builtInTabs;/.test(s), 'düzen yokken yerleşiğe düşülmüyor');
});

test('uygulama: sekme içeriği sabit yuvaya bağlı (sunucu içeriği değiştiremez)', async () => {
  const s = await readFile(HOME, 'utf8');
  // Sunucu sekmeyi taşıyabilir ama "profil" sekmesine mesajlar ekranını koyduramaz.
  assert.ok(/static int _slotOf\(String target\)/.test(s), 'sabit yuva eşlemesi yok');
});
