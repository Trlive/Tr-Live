import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SDK_JS } from '../trlive_game_sdk.js';

// SDK, kullanıcının telefonunda çalışan ve oyun sayfasının tamamen kontrolündeki bir ortamda
// duruyor. Buradaki her sınır, oyun yazarının kötü niyetli olmasına değil, **hata yapmasına**
// karşı da koruma: yanlışlıkla açık bırakılan bir kapı, sahada açık kapıdır.

test('üretilen SDK geçerli JavaScript', () => {
  assert.doesNotThrow(() => new Function(SDK_JS));
});

test('SDK Coin hareketi başlatabilen hiçbir yöntem ya da uç içermiyor', () => {
  // Eski çarpan/ödül yöntemleri tamamen kaldırıldı: çağıran eski bir oyun "is not a function" hatası alır, sessizce başarısız olmaz.
  assert.ok(!/\b(bet|settle|play)\s*:/.test(SDK_JS), 'SDK hâlâ Coin yöntemi sunuyor');
  assert.ok(!/gone\(/.test(SDK_JS), 'SDK içinde kaldırılmış yöntem artığı var');
  // Sunucuya para hareketi isteyen bir yol kalmadı.
  assert.ok(!/\/bet|\/settle|\/play/.test(SDK_JS), 'SDK hâlâ para ucu çağırıyor');
});

test('bilet adres satırından siliniyor', () => {
  // Adres satırı tarayıcı geçmişine, yer imlerine ve paylaşma menüsüne girer.
  assert.match(SDK_JS, /q\.delete\('token'\)/);
  assert.match(SDK_JS, /history\.replaceState/);
  // Silme, sessionStorage'a yazdıktan SONRA olmalı; önce silinirse bilet kaybolur.
  assert.ok(SDK_JS.indexOf("sessionStorage.setItem('trg_'") < SDK_JS.indexOf("q.delete('token')"),
    'bilet saklanmadan adres satırından siliniyor');
});

test('yeniden bağlanma: artan bekleme ve üst sınır var', () => {
  // Sonsuz hızlı deneme, ağ kesintisinde sunucuyu bağlantı isteğiyle döver.
  assert.match(SDK_JS, /Math\.min\(30000,1000\*Math\.pow\(2,/);
});

test('yeniden bağlanmada rastgele sapma var (gürleyen sürü)', () => {
  // Sapma olmadan bütün telefonlar aynı anda döner ve sunucu kalktığı anda yeniden düşer.
  assert.match(SDK_JS, /Math\.random\(\)\*base\*0\.3/);
});

test('sayfa arkaya alınınca bağlantı bırakılıyor', () => {
  assert.match(SDK_JS, /visibilitychange/);
  assert.match(SDK_JS, /document\.hidden/);
});

test('send bağlantı yokken sessizce yutmuyor', () => {
  // Sessiz yutma, oyunun "gönderdim" sanıp beklemesine yol açar.
  assert.match(SDK_JS, /if\(!_ws\|\|_ws\.readyState!==1\)return false;/);
});

test('köprüden oturum bileti istenmiyor', () => {
  // Oyun sayfası uygulamadan oturum bileti isteyemez; etkinlik bileti zaten adresle geliyor.
  assert.ok(!/getToken/.test(SDK_JS), 'SDK uygulamadan oturum bileti istiyor');
});

test('SDK kaynak dosyaları parçalara ayrılmış', async () => {
  for (const f of ['session_client.js', 'event_client.js', 'bridge_client.js', 'trlive_game_sdk.js']) {
    const s = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(s.length > 200, `${f} boş görünüyor`);
  }
});

// --- Kayıtlarda bilet sızıntısı ---------------------------------------------------------------

test('hata kayıtlarında adres maskeleniyor', async () => {
  const s = await readFile(new URL('../../../../app.js', import.meta.url), 'utf8');
  // Oyun sayfaları bileti sorgu dizesinde taşır; maskelenmezse bilet hata kayıtlarında
  // saklama süresi boyunca düz metin olarak durur. Kendi standardımız: "hassas veri içermeyen log".
  const lines = s.split('\n').filter((l) => l.includes('originalUrl'));
  assert.ok(lines.length > 0, 'adres hiç kaydedilmiyor mu?');
  for (const l of lines) {
    assert.ok(l.includes('redactSecrets('), `maskelenmemiş adres kaydı: ${l.trim()}`);
  }
});

test('maskeleme bilet parametresini gerçekten yakalıyor', async () => {
  const { redactSecrets } = await import('../../../../middleware/security/redact.js');
  const out = redactSecrets('/games/abc/?uid=5&token=eyJhbGciOi.AAAA.BBBB&lang=tr');
  assert.ok(!out.includes('eyJhbGciOi.AAAA.BBBB'), `bilet maskelenmedi: ${out}`);
  assert.ok(out.includes('uid=5'), 'zararsız parametreler de silinmiş');
});
