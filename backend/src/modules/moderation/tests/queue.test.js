import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const f = (p) => readFile(new URL(p, import.meta.url), 'utf8');

// Moderasyon kuyruğu (denetim S-06) mağaza yayın şartı. Bu testler, kuyruğun doğru şeyi
// önceliklendirdiğini ve kanıtın kaybolmadığını sabitliyor.

test('risk puanı AYRI ŞİKÂYETÇİ sayısına dayanıyor, toplam şikâyete değil', async () => {
  const s = await f('../queue.service.js');
  // En kritik ayrım: beş ayrı kişinin bir kez şikâyet etmesi ile bir kişinin beş kez şikâyet
  // etmesi aynı şey değildir. İkincisi genellikle husumettir. Toplam sayıya göre sıralasaydık,
  // bir kişiyi hedef alan organize şikâyet kampanyası masum kullanıcıyı tepeye çıkarırdı.
  assert.ok(/COUNT\(DISTINCT reporter_id\)/.test(s), 'ayrı şikâyetçi sayılmıyor');
  assert.ok(/r\.reporters \* 10/.test(s), 'puan ayrı şikâyetçiye dayanmıyor');
  const scoreBlock = s.slice(s.indexOf('r.reporters * 10'), s.indexOf('AS score'));
  assert.ok(!/r\.reports \*/.test(scoreBlock), 'puanda toplam şikâyet sayısı ağırlık alıyor');
});

test('ağır nedenler en yüksek ağırlıkta', async () => {
  const s = await f('../queue.service.js');
  assert.ok(/r\.severe \* 25/.test(s), 'ağır nedenler ağırlıklandırılmamış');
  for (const r of ['child_safety', 'sexual', 'harassment', 'violence', 'self_harm']) {
    assert.ok(s.includes(`'${r}'`), `ağır neden listesinde yok: ${r}`);
  }
});

test('bekleme süresi puana giriyor ama sınırlı', async () => {
  const s = await f('../queue.service.js');
  // Süre sınırsız artsaydı, aylarca bekleyen önemsiz bir şikâyet yeni gelen ağır bir şikâyetin
  // önüne geçerdi.
  assert.ok(/LEAST\(EXTRACT\(EPOCH FROM \(NOW\(\) - r\.oldest\)\) \/ 3600 \* 0\.5, 100\)/.test(s),
    'bekleme süresi puanı sınırsız ya da yok');
});

test('karar, kullanıcının bütün açık şikâyetlerini birlikte kapatıyor', async () => {
  const s = await f('../queue.service.js');
  // Tek tek kapatmak moderatöre aynı kararı tekrar verdirir ve bir şikâyeti unutması kaçınılmaz olur.
  assert.ok(/UPDATE reports SET status = \$3[\s\S]*WHERE target_user_id = \$1 AND status = 'open'/.test(s),
    'şikâyetler toplu kapatılmıyor');
});

test('gerekçesiz karar kabul edilmiyor (dismiss hariç)', async () => {
  const s = await f('../queue.service.js');
  assert.ok(/action !== 'dismiss' && !note/.test(s), 'gerekçe zorunlu değil');
});

test('askıya alma ortak servisten geçiyor (kopya mantık yok)', async () => {
  const s = await f('../queue.service.js');
  // Kopya olsaydı bir yol oturum iptalini unutabilirdi: askıya alınan kullanıcı uygulamada
  // açık kalmaya devam ederdi, yani ceza uygulanmamış olurdu.
  assert.ok(/suspendUser\(/.test(s), 'askıya alma ortak servisi kullanılmıyor');
  assert.ok(!/UPDATE users SET account_status = 'banned'/.test(s), 'kuyrukta kopya ban mantığı var');
});

test('askıya almanın yan etkileri commit SONRASI', async () => {
  const all = await f('../../users/ban.service.js');
  // Yalnızca işlev gövdesine bakılır: import satırları da bu adları içerir ve onları saymak
  // testi her zaman kırardı (aracın kendisi gürültü üretmemeli).
  const body = all.slice(all.indexOf('export async function suspendUser'));
  const txEnd = body.indexOf('// --- Commit sonrası yan etkiler ---');
  assert.ok(txEnd > 0, 'yan etkiler ayrılmamış');
  // Transaction geri alınırsa kullanıcı atılmış ama ceza kaydı yazılmamış olurdu.
  assert.ok(body.indexOf('revokeAllSessions(') > txEnd, 'oturum iptali transaction içinde');
  assert.ok(body.indexOf('closeRoom(') > txEnd, 'oda kapatma transaction içinde');
  assert.ok(body.indexOf('hub.disconnectUser') > txEnd, 'bağlantı kesme transaction içinde');
});

test('tek ban uygulaması: yönetim rotası da aynı servisi çağırıyor', async () => {
  const s = await f('../../admin/admin_users.routes.js');
  assert.ok(/suspendUser\(\{/.test(s), 'yönetim rotası ortak servisi kullanmıyor');
  assert.ok(!/token_version = token_version \+ 1/.test(s), 'rotada hâlâ kopya ban mantığı var');
});

// --- Kanıt kopyası: asıl boşluk ---------------------------------------------------------------

test('şikâyet anında içerik kopyası alınıyor', async () => {
  const s = await f('../safety.routes.js');
  // Eskiden yalnızca mesaj KİMLİĞİ saklanıyordu. Kullanıcı mesajı silince moderatör ekranında
  // şikâyet duruyor ama neyin şikâyet edildiği görünmüyordu. Kötü niyetli kullanıcı tam da
  // bunu yapar: yaz, şikâyet edilince sil.
  assert.ok(/async function snapshot\(/.test(s), 'kopya işlevi yok');
  assert.ok(/evidence \? JSON\.stringify\(evidence\) : null/.test(s), 'kopya kaydedilmiyor');
});

test('kopya alınamazsa şikâyet yine kaydediliyor', async () => {
  const s = await f('../safety.routes.js');
  const fn = s.slice(s.indexOf('async function snapshot('));
  // Eksik kanıtla bir şikâyet, hiç şikâyet olmamasından iyidir.
  assert.ok(/catch \{/.test(fn) && /return null;/.test(fn), 'kopya hatası şikâyeti düşürüyor olabilir');
});

test('kopya yalnızca şikâyet edilen öğeyi içeriyor (sohbetin tamamını değil)', async () => {
  const s = await f('../safety.routes.js');
  const fn = s.slice(s.indexOf('async function snapshot('));
  // Gereğinden fazlasını saklamak, moderasyon ihtiyacını aşan bir veri birikimi olurdu.
  assert.ok(/WHERE m\.id = \$1/.test(fn), 'oda mesajı tek kimlikle çekilmiyor');
  assert.ok(/WHERE d\.id = \$1/.test(fn), 'özel mesaj tek kimlikle çekilmiyor');
  assert.ok(!/LIMIT 50|ORDER BY/.test(fn), 'kopyaya mesaj listesi giriyor olabilir');
});

test('panel: silinmiş mesajda kopya gösteriliyor ve işaretleniyor', async () => {
  const s = await f('../../admin/admin_moderation.routes.js');
  assert.ok(/x\.message_text \?\? x\.evidence\?\.text/.test(s), 'kopyaya düşülmüyor');
  assert.ok(/evidenceOnly:/.test(s), 'moderatör kopyadan baktığını göremiyor');
});

test('mesaj silme yalnızca şikâyet edilen mesajları siliyor', async () => {
  const s = await f('../queue.service.js');
  const block = s.slice(s.indexOf("case 'delete_messages'"), s.indexOf("case 'mute'"));
  assert.ok(/WHERE target_user_id = \$1 AND status = 'open' AND message_id IS NOT NULL/.test(block),
    'kullanıcının tüm geçmişi siliniyor olabilir');
});
