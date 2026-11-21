import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const f = (p) => readFile(new URL(p, import.meta.url), 'utf8');

// Oda üye listesi, yük altında ilk patlayacak uçtu: kalabalık odada her çağrıda binlerce satır
// dönüyordu ve uygulama listeyi düzenli yeniliyor. Bu testler sınırın geri alınmasını engelliyor.

test('üye listesinde üst sınır var', async () => {
  const s = await f('../rooms.routes.js');
  const fn = s.slice(s.indexOf("router.get('/:roomId/members'"), s.indexOf("router.get('/:roomId/members'") + 2500);
  assert.ok(/LIMIT \$4/.test(fn), 'LIMIT yok — kalabalık odada tüm satırlar dönüyor');
  assert.ok(/Math\.min\(500/.test(fn), 'üst sınır istemciden sınırsız büyütülebiliyor');
});

test('kesilen liste sayıyı kaybetmiyor', async () => {
  const s = await f('../rooms.routes.js');
  // Arayüz "+1.742 dinleyici" gösterebilsin diye toplam ayrıca dönüyor.
  assert.ok(/total: c\.rows\[0\]\.n/.test(s), 'toplam sayı dönmüyor');
  assert.ok(/truncated:/.test(s), 'kesilme bilgisi dönmüyor');
});

test('sıralama koltuktakileri başa koyuyor (kesme koltukları etkilemesin)', async () => {
  const s = await f('../rooms.routes.js');
  // Koltuk çizimi, "boş koltuk var mı" ve "çıkınca oda kapanır mı" hesapları buna bağlı:
  // koltuktakiler kesilirse oda ekranı yanlış çizilir.
  assert.ok(/ORDER BY rm\.seat_index NULLS LAST, rm\.joined_at/.test(s), 'sıralama değişmiş');
});

test('sıralama dizini sorgudaki ORDER BY ile aynı', async () => {
  const m = await f('../../../migrations/102_room_members_index.sql');
  // Sütun sırası birebir aynı olmalı, yoksa dizin sıralama için kullanılamaz ve LIMIT'ten önce
  // bütün satırlar yine okunup sıralanır.
  assert.ok(/room_members\(room_id, seat_index NULLS LAST, joined_at\)/.test(m), 'dizin ORDER BY ile eşleşmiyor');
});
