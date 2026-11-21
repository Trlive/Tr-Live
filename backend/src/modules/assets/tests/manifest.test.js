import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SRC = new URL('../manifest.service.js', import.meta.url);
const CACHE = new URL('../../../../../mobile/lib/services/media_cache.dart', import.meta.url);

test('liste sorgusu yalnızca paylaşılan varlıkları alır', async () => {
  const s = await readFile(SRC, 'utf8');
  // Kullanıcıya özel görseller listeye girmemeli: kişi başına değişir, listeyi şişirir.
  assert.ok(!/avatar_url|cover_url|profile/i.test(s), 'kullanıcıya özel görsel listeye sızmış');
  for (const t of ['gifts', 'entrance_effects']) {
    assert.ok(s.includes(t), `${t} listede yok`);
  }
});

test('liste sürümü içerikten türetilir (sunucu yeniden başlayınca değişmez)', async () => {
  const s = await readFile(SRC, 'utf8');
  // Sürüm Date.now() ya da rastgele sayıdan üretilseydi, her sunucu açılışında bütün telefonlar
  // listeyi yeniden indirirdi; 304 hiç çalışmazdı.
  const block = s.slice(s.indexOf('const version ='), s.indexOf('const totalBytes'));
  assert.ok(block.includes("createHash('sha256')"), 'sürüm özetten üretilmiyor');
  assert.ok(!/Date\.now|Math\.random|randomUUID/.test(block), 'sürüm zamana/rastgeleye bağlı');
});

test('bilinmeyen boyut uydurulmuyor', async () => {
  const s = await readFile(SRC, 'utf8');
  // Uydurulmuş boyut, doğru inen dosyayı "eksik" sayıp attırırdı.
  assert.ok(/bytes: r\.size_bytes \?\? null/.test(s), 'boyut bilinmiyorsa null gönderilmeli');
});

test('damga doldurma turu sınırlı sayıda dosya işler', async () => {
  const s = await readFile(SRC, 'utf8');
  const fn = s.slice(s.indexOf('export async function backfillHashes'));
  assert.ok(/LIMIT \$1/.test(fn), 'tüm tablo birden okunuyor');
  assert.ok(/Math\.min\(500/.test(fn), 'üst sınır yok');
});

// --- Mobil önbellek: bulduğum gerçek hata ve düzeltmesi -----------------------------------

test('yarım inen dosya kalıcı önbelleğe girmiyor', async () => {
  const s = await readFile(CACHE, 'utf8');
  // Eski kod yalnızca "sıfır bayt" durumunu yakalıyordu: bağlantı yarıda kesilip gövde düzgün
  // kapanırsa yarım dosya kalıcı önbelleğe giriyor, o hediye o telefonda bir daha asla düzgün
  // oynamıyordu (dosya var sayıldığı için yeniden inmiyor).
  assert.ok(s.includes("content-length"), 'bildirilen boyut okunmuyor');
  assert.ok(/written != declared/.test(s), 'inen bayt bildirilen boyutla karşılaştırılmıyor');
  // Atma işlemi, dosya kalıcı ada alınmadan ÖNCE olmalı.
  const dropAt = s.indexOf('eksik dosya');
  const renameAt = s.indexOf('tmp.rename');
  assert.ok(dropAt > 0 && renameAt > dropAt, 'eksik dosya kalıcı ada alındıktan sonra atılıyor');
});

test('önbellekteki eski yarım dosyalar da temizleniyor', async () => {
  const s = await readFile(CACHE, 'utf8');
  // Düzeltmeden önce inmiş bozuk dosyalar telefonlarda duruyor; boyut uyuşmazsa silinmeli.
  assert.ok(/expectedBytes == null \|\| len == expectedBytes/.test(s), 'eldeki dosyanın boyutu denetlenmiyor');
});
