import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// CORS sıkılaştırması (denetim S-05) üretimde çalışan bir sunucuyu etkiliyor: yanlış yazılırsa
// güncelleme sırasında site düşer. Bu testler o davranışı sabitliyor.

const cfg = () => readFile(new URL('../../../config.js', import.meta.url), 'utf8');

test('üretimde "*" reddediliyor', async () => {
  const s = await cfg();
  assert.ok(/!cors \|\| cors === '\*'/.test(s), 'yıldız denetimi yok');
});

test('geçiş yolu var: kendi adresi biliniyorsa sunucu ayakta kalır', async () => {
  const s = await cfg();
  // Koşulsuz hata, sunucunun güncellendiği an AÇILMAMASI demekti: site kimse bir şey
  // yapmadan düşerdi. Bir güvenlik sıkılaştırması, uygulandığı gün hizmeti kesiyorsa
  // yanlış uygulanmıştır.
  assert.ok(/PUBLIC_BASE_URL/.test(s), 'geçiş yolu yok');
  assert.ok(/corsFallback = self/.test(s), 'kendi adresine daraltma yok');
});

test('kendi adresi de yoksa hata atılıyor (durulacak güvenli değer yok)', async () => {
  const s = await cfg();
  const block = s.slice(s.indexOf('const self ='), s.indexOf('corsFallback = self'));
  assert.ok(/if \(!self\) \{[\s\S]*throw new Error/.test(block), 'adres yokken hata atılmıyor');
});

test('corsOrigin getter: daraltma config kurulduktan sonra da geçerli', async () => {
  const s = await cfg();
  // Sabit değer olsaydı validateConfig() sonradan çalıştığı için daraltma hiç uygulanmazdı.
  assert.ok(/get corsOrigin\(\)/.test(s), 'corsOrigin getter değil — daraltma etkisiz kalır');
});

test('dağıtım dosyaları artık "*" yazmıyor', async () => {
  for (const f of ['../../../../../deploy/docker-compose.yml', '../../../../../deploy/oracle/install.sh']) {
    const s = await readFile(new URL(f, import.meta.url), 'utf8');
    const lines = s.split('\n').filter((l) => /^\s*#/.test(l) === false && /CORS_ORIGIN\s*[:=]/.test(l));
    for (const l of lines) {
      assert.ok(!/['"]\*['"]/.test(l), `dağıtımda hâlâ yıldız var: ${l.trim()}`);
    }
  }
});
