import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseAllowlist, validateAllowlist, hostAllowed } from '../webview_policy.service.js';

const L = (s) => parseAllowlist(s);

test('boş liste: kısıt yok (bugünkü davranış korunur)', () => {
  assert.equal(hostAllowed('https://herhangi.com/x', []), true);
  assert.equal(hostAllowed('http://herhangi.com/x', []), true);
});

test('liste doluyken http hiçbir koşulda kabul edilmez', () => {
  // Düz http, araya girenin sayfaya kod sokabilmesi demek; kanal bağlı bir pencerede kabul edilemez.
  assert.equal(hostAllowed('http://oyun.alanadi.com/', L('oyun.alanadi.com')), false);
  assert.equal(hostAllowed('https://oyun.alanadi.com/', L('oyun.alanadi.com')), true);
});

test('tam alan adı eşleşmesi', () => {
  const l = L('oyun.alanadi.com');
  assert.equal(hostAllowed('https://oyun.alanadi.com/a/b?c=1', l), true);
  assert.equal(hostAllowed('https://baska.alanadi.com/', l), false);
});

test('joker yalnızca alt alan adlarını kapsar, kökü kapsamaz', () => {
  const l = L('*.alanadi.com');
  assert.equal(hostAllowed('https://oyun.alanadi.com/', l), true);
  assert.equal(hostAllowed('https://a.b.alanadi.com/', l), true);
  // Kökü isteyen kökü de yazar: sessizce eklemek, listeyi okuyanı yanıltır.
  assert.equal(hostAllowed('https://alanadi.com/', l), false);
});

test('joker etiket sınırında eşleşir — benzer isimli alan adı geçemez', () => {
  // En kritik durum: saldırgan "kotualanadi.com" alıp listeye sızmaya çalışır.
  const l = L('*.alanadi.com');
  assert.equal(hostAllowed('https://kotualanadi.com/', l), false);
  assert.equal(hostAllowed('https://x.kotualanadi.com/', l), false);
  assert.equal(hostAllowed('https://alanadi.com.saldirgan.net/', l), false);
});

test('benzer yazılmış alan adı (harf hatası) geçemez', () => {
  const l = L('trlive.app');
  assert.equal(hostAllowed('https://trlve.app/', l), false);
  assert.equal(hostAllowed('https://trlive.app.kotu.net/', l), false);
});

test('büyük/küçük harf ve boşluk farkı sorun çıkarmaz', () => {
  assert.equal(hostAllowed('https://OYUN.Alanadi.COM/', L('  oyun.alanadi.com \n')), true);
});

test('bozuk adres reddedilir', () => {
  const l = L('alanadi.com');
  assert.equal(hostAllowed('alanadi.com', l), false); // şemasız
  assert.equal(hostAllowed('', l), false);
  assert.equal(hostAllowed('javascript:alert(1)', l), false);
});

test('liste ayrıştırma: virgül, noktalı virgül, satır sonu', () => {
  assert.deepEqual(L('a.com, b.com;\nc.com'), ['a.com', 'b.com', 'c.com']);
});

test('doğrulama: şema, yol ve port reddedilir', () => {
  // İzin listesi alan adı listesidir. Yol tabanlı izin, tek bir açık yönlendirmeyle delinir.
  for (const bad of ['https://alanadi.com', 'alanadi.com/oyun', 'alanadi.com:8443', 'alan adi.com', '*.com*']) {
    assert.throws(() => validateAllowlist(bad), /geçersiz/i, `kabul edilmemeliydi: ${bad}`);
  }
});

test('doğrulama: geçerli biçimler kabul edilir', () => {
  assert.equal(validateAllowlist('alanadi.com, *.oyun.net'), 'alanadi.com\n*.oyun.net');
  assert.equal(validateAllowlist(''), '');
});

// --- Mobil taraf aynı kuralı uyguluyor mu ---------------------------------------------------

const POLICY = new URL('../../../../../mobile/lib/hybrid/webview/navigation_policy.dart', import.meta.url);
const BRIDGE = new URL('../../../../../mobile/lib/hybrid/js_bridge/bridge_policy.dart', import.meta.url);

test('uygulama tarafı da etiket sınırında eşleştiriyor', async () => {
  const s = await readFile(POLICY, 'utf8');
  // host.endsWith(suffix) tek başına "kotualanadi.com"u geçirirdi; uzunluk denetimi şart.
  assert.ok(/host\.endsWith\(suffix\) && host\.length > suffix\.length/.test(s),
    'uygulama tarafında etiket sınırı denetimi yok');
});

test('uygulama tarafı düz http yüklemiyor', async () => {
  const s = await readFile(POLICY, 'utf8');
  const fn = s.slice(s.indexOf('static bool canLoadExternal'));
  assert.ok(/u\.scheme != 'https'/.test(fn), 'http engellenmiyor');
});

test('dış sayfaya oturum bileti verilmiyor', async () => {
  const s = await readFile(BRIDGE, 'utf8');
  const ext = /_external = \{([^}]*)\}/.exec(s)?.[1] ?? '';
  assert.ok(!ext.includes('getToken'), 'dış sayfa oturum bileti alabiliyor');
  assert.ok(!ext.includes('open'), 'dış sayfa uygulama ekranı açabiliyor');
  assert.equal(ext.replace(/['\s]/g, ''), 'close');
});

test('köprü aşırı büyük mesajı düşürüyor', async () => {
  const s = await readFile(BRIDGE, 'utf8');
  assert.ok(/raw\.length > 64 \* 1024/.test(s), 'mesaj boyutu sınırlı değil');
});
