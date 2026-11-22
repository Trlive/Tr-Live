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

// ---- Sürüm özetinin anahtar sırasından bağımsızlığı ----
//
// PostgreSQL `jsonb` anahtar sırasını korumaz; (uzunluk, bayt) sırasına göre saklar.
// Düz JSON.stringify ile özet alınınca, koddan üretilen nesne ile veritabanından okunan
// AYNI içerik farklı özet veriyordu. Sonuç: panelde "yayınlanmamış değişiklik var" uyarısı
// hiç sönmüyor, geri alma bile temizlemiyordu. CI'da e2e şöyle kırıldı:
// "geri almadan sonra yayınlanmamış değişiklik kalmamalı: true !== false".
test('sürüm özeti anahtar sırasından bağımsız (jsonb yeniden sıralar)', async () => {
  const { revisionOf } = await import('../src/modules/sdui/v2/sdui_v2.service.js');
  const kodSirasi = { schemaVersion: 2, screenId: 'help', root: { type: 'column', children: [{ type: 'title', text: 'x' }] } };
  const jsonbSirasi = { root: { children: [{ text: 'x', type: 'title' }], type: 'column' }, screenId: 'help', schemaVersion: 2 };
  assert.equal(revisionOf(kodSirasi), revisionOf(jsonbSirasi), 'aynı içerik aynı özet vermeli');

  const farkli = { schemaVersion: 2, screenId: 'help', root: { type: 'column', children: [{ type: 'title', text: 'DEĞİŞTİ' }] } };
  assert.notEqual(revisionOf(kodSirasi), revisionOf(farkli), 'içerik değişince özet değişmeli');

  // Dizi sırası İÇERİKTİR, sıralanmaz: iki bileşenin yeri değişirse ekran değişmiştir.
  const yerDegisti = { schemaVersion: 2, screenId: 'help', root: { type: 'column', children: [{ type: 'title', text: 'b' }, { type: 'title', text: 'a' }] } };
  const ilkHali = { schemaVersion: 2, screenId: 'help', root: { type: 'column', children: [{ type: 'title', text: 'a' }, { type: 'title', text: 'b' }] } };
  assert.notEqual(revisionOf(yerDegisti), revisionOf(ilkHali), 'bileşen sırası değişince özet değişmeli');
});

// ---- Yerleşim mimarisi ve vektörel bileşenler ----

test('oran ve genişlik sınırı: sayfa her ekranda aynı dursun', () => {
  const out = validateScreen('events', {
    root: { type: 'maxWidth', width: 560, align: 'center', children: [
      { type: 'aspectRatio', w: 16, h: 9, children: [{ type: 'image', url: 'https://cdn.example/a.jpg' }] },
      { type: 'spacer', size: 12 },
      { type: 'safeArea', bottom: true, children: [{ type: 'title', text: 'Alt' }] },
    ] },
  });
  assert.equal(out.root.type, 'maxWidth');
  assert.equal(out.root.width, 560);
  assert.equal(out.root.children[0].w, 16);
  assert.equal(out.root.children[0].h, 9);
  assert.equal(out.root.children[1].size, 12);
  assert.equal(out.root.children[2].bottom, true);
});

test('vektörel bileşenler: görsel indirmeden çizilir', () => {
  const out = validateScreen('events', {
    root: { type: 'row', children: [
      { type: 'icon', name: 'trophy', size: 28, tone: 'gold' },
      { type: 'shape', kind: 'ring', size: 40, thickness: 3, tone: 'primary' },
      { type: 'progress', kind: 'ring', value: 70, label: '%70', tone: 'success' },
      { type: 'progress', kind: 'bar', value: 30 },
    ] },
  });
  const [ikon, sekil, halka, cubuk] = out.root.children;
  assert.equal(ikon.name, 'trophy');
  assert.equal(sekil.kind, 'ring');
  assert.equal(halka.value, 70);
  assert.equal(cubuk.kind, 'bar');
});

test('vektörel bileşenlerde de kapalı liste geçerli', () => {
  bad({ type: 'shape', kind: 'ucgen' }, /geçersiz/i);
  bad({ type: 'icon', name: 'nuke' }, /bilinmeyen simge/i);
  bad({ type: 'progress', tone: '#ff0000' }, /bilinmeyen renk rolü/i);
});

test('oran değerleri sınırlı (bölme hatası ve saçma oran olmasın)', () => {
  bad({ type: 'aspectRatio', w: 5000, h: 1 }, /0–2000/);
  // 0 kabul edilir ama çizici 1'e sıkıştırır; şema tarafında sayı olması yeter.
  assert.doesNotThrow(() => validateScreen('events', { root: { type: 'aspectRatio', w: 0, h: 0 } }));
});

// ---- Veri kaynakları: tanıtılan her kaynağın karşılığı olmalı ----
test('veri kaynakları yalnızca doğrulanmış uçlardan', () => {
  // Panelde görünen ama seçilince boş ekran veren bir kaynak, olmayandan beterdir.
  // İlk yazımda faq/tasks/familyMembers/agencyReport tanıtılmıştı; dördünün de karşılığı yoktu.
  for (const yok of ['faq', 'tasks', 'familyMembers', 'agencyReport']) {
    bad({ type: 'repeater', source: yok }, /izinli olmayan veri kaynağı/i);
  }
  for (const var_ of ['events', 'inbox', 'relations', 'dealerCatalog']) {
    assert.doesNotThrow(() => ok({ type: 'repeater', source: var_, emptyText: 'Yok' }), var_);
  }
});

test('her kaynağın bağlanabilir alanları tanımlı', async () => {
  const { SOURCE_SPECS, SOURCES } = await import('../src/modules/sdui/v2/sdui_v2.schema.js');
  for (const s of SOURCES) {
    assert.ok(Array.isArray(SOURCE_SPECS[s]?.fields) && SOURCE_SPECS[s].fields.length, `${s}: alan listesi yok`);
    assert.ok(SOURCE_SPECS[s].fields.includes('id'), `${s}: id alanı olmalı`);
  }
});

// ---- Şablon bağlama: kimlik ve görsel alanlarında ----
//
// Liste satırları kendi öğelerini açabilmeli. Kimlik bekleyen alanlar yalnızca gerçek UUID
// kabul etseydi, `repeater` içinde yalnızca SABİT kimlik yazılabilirdi — bu da listeyi
// anlamsız kılardı. Bu yüzden `{alan}` biçimi de kabul edilir, ama SADECE o biçim.
test('kimlik alanları {alan} şablonunu kabul eder, uydurma kimliği etmez', () => {
  const uuid = '3f2a1b4c-5d6e-4f7a-8b9c-0d1e2f3a4b5c';
  assert.doesNotThrow(() => ok({ type: 'listItem', trailingAction: { type: 'openChat', id: '{id}' } }));
  assert.doesNotThrow(() => ok({ type: 'listItem', trailingAction: { type: 'openChat', id: uuid } }));
  assert.doesNotThrow(() => ok({ type: 'card', action: { type: 'openActivity', id: '{id}' } }));
  bad({ type: 'listItem', trailingAction: { type: 'openChat', id: 'abc' } }, /kullanıcı kimliği/i);
  // Şablonun içinde ifade olamaz: nokta, parantez, koşul — hiçbiri alan adı değildir.
  bad({ type: 'listItem', trailingAction: { type: 'openChat', id: '{a.b}' } }, /kullanıcı kimliği/i);
  bad({ type: 'card', action: { type: 'openActivity', id: '{f()}' } }, /etkinlik kimliği/i);
});

test('görsel alanı şablon kabul eder ama file:// kabul etmez', () => {
  assert.doesNotThrow(() => ok({ type: 'listItem', image: '{avatarUrl}' }));
  bad({ type: 'image', url: 'file:///etc/passwd' }, /görsel adresi/i);
  bad({ type: 'image', url: 'javascript:alert(1)' }, /görsel adresi/i);
});

test('satır sonu eylemi: SDUI sürümü yerleşikten kötü olmamalı', () => {
  // Yerleşik arkadaş listesinde satırın sağında "Mesaj" düğmesi vardı. trailingAction
  // olmasaydı SDUI'ye taşımak o düğmeyi kaybetmek olurdu.
  const out = ok({
    type: 'listItem', title: '{displayName}',
    action: { type: 'openScreen', screen: 'profile', arg: '{id}' },
    trailingIcon: 'chat', trailingAction: { type: 'openChat', id: '{id}' },
  });
  assert.equal(out.root.trailingIcon, 'chat');
  assert.equal(out.root.trailingAction.type, 'openChat');
  assert.equal(out.root.action.screen, 'profile');
});

test('eylem türleri tek kaynaktan ve hepsi doğrulanabilir', async () => {
  const { ACTION_TYPES } = await import('../src/modules/sdui/v2/sdui_v2.schema.js');
  assert.ok(ACTION_TYPES.includes('openChat'));
  bad({ type: 'notice', text: 'x', action: { type: 'calistir' } }, /bilinmeyen eylem/i);
});
