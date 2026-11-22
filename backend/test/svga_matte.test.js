// SVGA yeniden yazıcısı maskeleri ve katman verisini KORUMALI.
//
// NEDEN: sunucu, yüklenen SVGA dosyalarının içindeki görselleri küçültmek için dosyayı
// açıp yeniden yazıyor (fixSvga → parseSvga / buildSvga). Bu yeniden yazma sırasında
// katman (sprite) verisi kaybolursa, hediyedeki MASKELER gider.
//
// Maske, "şu katman yalnızca maskenin opak olduğu yerde görünsün" demek. Maskesi
// kaybolan bir hediyede gizlenmesi gereken parçalar olduğu gibi görünür ve görsel
// tanınmaz hale gelir — sahibinin "bazıları ne olduğu belli olmayacak kadar sıkıntılı"
// dediği hata sınıfı tam olarak bu.
//
// parseSvga bugün yapı koruyucu çalışıyor: yalnızca görsel baytlarını değiştiriyor,
// diğer her alanı ham bayt olarak geçiriyor. Bu test o davranışı KİLİTLİYOR; biri
// ayrıştırıcıyı "sadeleştirmeye" kalkarsa burada patlar.
import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

delete process.env.DATABASE_URL;
const { parseSvga, buildSvga } = await import('../src/modules/media/media_optimize.service.js');

// ---- küçük protobuf yazıcısı ----
const vi = (n) => { const o = []; let v = n; while (v > 127) { o.push((v & 127) | 128); v >>>= 7; } o.push(v); return Buffer.from(o); };
const lenField = (tag, b) => Buffer.concat([vi(tag), vi(b.length), b]);
const strField = (f, v) => lenField(f * 8 + 2, Buffer.from(v, 'utf8'));

/** 1x1 saydam PNG — isImage() onu görsel olarak tanısın diye gerçek bir PNG başlığı. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
  + '0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex',
);

/** matteKey taşıyan bir katmanı olan en küçük geçerli SVGA. */
function makeSvga() {
  const params = lenField(2 * 8 + 2, Buffer.concat([vi(3 * 8), vi(20), vi(4 * 8), vi(6)]));
  const maskImage = lenField(3 * 8 + 2, Buffer.concat([strField(1, 'mask.matte'), lenField(2 * 8 + 2, PNG)]));
  const bodyImage = lenField(3 * 8 + 2, Buffer.concat([strField(1, 'body'), lenField(2 * 8 + 2, PNG)]));
  // Maske katmanı (yalnızca imageKey) ve onunla maskelenen katman (imageKey + matteKey).
  const maskSprite = lenField(4 * 8 + 2, Buffer.concat([strField(1, 'mask.matte')]));
  const bodySprite = lenField(4 * 8 + 2, Buffer.concat([strField(1, 'body'), strField(3, 'mask.matte')]));
  return {
    svga: zlib.deflateSync(Buffer.concat([params, maskImage, bodyImage, maskSprite, bodySprite]), { level: 9 }),
    bodySprite,
  };
}

test('SVGA yeniden yazıldığında matteKey KAYBOLMAZ', () => {
  const { svga, bodySprite } = makeSvga();
  const parsed = parseSvga(svga);
  const back = zlib.inflateSync(buildSvga(parsed.parts));

  assert.ok(back.includes(Buffer.from('mask.matte', 'utf8')), 'maske anahtarı dosyada kalmalı');
  // Katmanın tamamı bayt bayt korunmalı: matteKey alanı da içinde.
  assert.ok(back.includes(bodySprite.subarray(2)), 'maskelenen katmanın baytları aynen korunmalı');
});

test('SVGA ayrıştırıcısı başlığı ve görselleri doğru okur', () => {
  const { svga } = makeSvga();
  const p = parseSvga(svga);
  assert.equal(p.fps, 20);
  assert.equal(p.frames, 6);
  assert.equal(p.images.length, 2, 'iki görsel (maske + gövde)');
  assert.ok(p.images.every((i) => Buffer.isBuffer(i.data)));
});

test('görsel DEĞİŞTİRİLSE bile katman verisi korunur', () => {
  // fixSvga'nın yaptığı iş bu: görseli küçültüp yerine koyuyor.
  const { svga, bodySprite } = makeSvga();
  const p = parseSvga(svga);
  const smaller = Buffer.concat([PNG, Buffer.from([0])]); // "küçültülmüş" görsel yerine geçen bayt
  for (const im of p.images) im.data = smaller;
  const back = zlib.inflateSync(buildSvga(p.parts));

  assert.ok(back.includes(smaller), 'yeni görsel yazılmış olmalı');
  assert.ok(back.includes(bodySprite.subarray(2)), 'katman + matteKey yine korunmalı');
});

test('bozuk SVGA sessizce yarım dosya üretmez, hata atar', () => {
  // Yarım ayrıştırılmış bir dosyayı yeniden yazmak, maskeleri sessizce düşürmekten beterdir.
  assert.throws(() => parseSvga(Buffer.from('bu bir svga degil')), /./);
  const truncated = zlib.deflateSync(Buffer.concat([vi(3 * 8 + 2), vi(200)]), { level: 9 });
  assert.throws(() => parseSvga(truncated), /svga bozuk/);
});
