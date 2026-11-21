import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routeMap } from '../tools/route_map.mjs';

// Modüllere ayırma güvenlik ağı.
//
// Dosyalar taşınırken bir API adresinin sessizce kaybolması, sunucu açılıp testler geçtiği için
// fark edilmez; uygulamadaki bir düğme 404 döner. Staging olmadığımız için bunu canlıda görürdük.
// Bu test, kaynaktan çıkarılan adres listesini onaylanmış anlık görüntüyle karşılaştırır.
//
// Anahtarda dosya yolu ve router değişken adı YOK: taşıma dosyayı, bölme ise router adını değiştirir;
// ikisi de API yüzeyini değiştirmemelidir. Aynı yolun kaç kez tanımlandığı sayılır (`×3`), böylece
// bölme sırasında kaybolan bir tanım yine yakalanır.
// Bilerek adres eklendiyse/kaldırıldıysa: `node tools/route_map.mjs --write`

const snap = JSON.parse(readFileSync(new URL('./route_map.json', import.meta.url), 'utf8'));

test('API adresleri: hiçbiri taşıma sırasında kaybolmadı', () => {
  const now = routeMap();
  const missing = snap.routes.filter((r) => !now.routes.includes(r));
  const added = now.routes.filter((r) => !snap.routes.includes(r));
  assert.deepEqual(missing, [], `KAYBOLAN ADRESLER (taşıma sırasında düştü):\n${missing.join('\n')}`);
  assert.deepEqual(added, [], `YENİ ADRESLER (bilerekse: node tools/route_map.mjs --write):\n${added.join('\n')}`);
});

test('toplam adres tanımı sayısı değişmedi', () => {
  assert.equal(routeMap().total, snap.total);
});

test('router bağlamaları: her router hâlâ aynı yola bağlı', () => {
  const now = routeMap();
  assert.deepEqual(now.mounts, snap.mounts);
});

test('anlık görüntü boş değil (araç bozulursa test sessizce geçmesin)', () => {
  assert.ok(snap.total > 400, `beklenen 400+ adres tanımı, bulunan ${snap.total}`);
  assert.ok(snap.mounts.length > 40, `beklenen 40+ bağlama, bulunan ${snap.mounts.length}`);
});
