import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const f = (p) => readFile(new URL(p, import.meta.url), 'utf8');

// Sahibin kararı: test, etkinlik ödülü, telafi ve pazarlama basımları hiçbir insan listesinde
// görünmeyecek. Defter satırı duruyor — aylık bütçe sınırı ve mutabakat alarmı ona bağlı.
// Bu testler, bir sonraki değişiklikte o süzgeçlerin sessizce düşmemesi için var.

test('ayrı basım tablosuna artık yazılmıyor', async () => {
  const s = await f('../coin_budgets.service.js');
  assert.ok(!/INSERT INTO coin_issuances/.test(s), 'coin_issuances hâlâ yazılıyor');
});

test('aylık kullanım defterden okunuyor (sınır bu yüzden çalışır)', async () => {
  const s = await f('../coin_budgets.service.js');
  const fn = s.slice(s.indexOf('export async function chargeBudget'));
  assert.ok(/FROM wallet_transactions/.test(fn), 'sınır denetimi deftere bakmıyor');
});

test('gizlenecek türler veritabanından okunuyor, koda yazılmıyor', async () => {
  const s = await f('../coin_budgets.service.js');
  // Sabit liste, panelden eklenen beşinci bütçeyi sessizce görünür bırakırdı.
  assert.ok(/SELECT key FROM coin_budgets/.test(s), 'bütçe anahtarları veritabanından okunmuyor');
});

test('kullanıcının hareket listesi basımları süzüyor', async () => {
  const s = await f('../../users/me.routes.js');
  assert.ok(/NOT \(transaction_type = ANY\(\$5::text\[\]\)\)/.test(s), 'kullanıcı listesinde süzgeç yok');
  assert.ok(/await hiddenTxTypes\(\)/.test(s), 'gizli tür listesi kullanılmıyor');
});

test('panelin iki hareket listesi de basımları süzüyor', async () => {
  const s = await f('../../admin/admin_panel.routes.js');
  const hits = s.match(/NOT \((?:w\.)?transaction_type = ANY\(/g) ?? [];
  assert.equal(hits.length, 2, `iki listede de süzgeç olmalı, bulunan: ${hits.length}`);
});

test('basımlar yönetici işlem günlüğüne yazılmıyor', async () => {
  const s = await f('../../admin/admin_coins.routes.js');
  assert.ok(/if \(!budgetKey\) \{/.test(s), 'bütçeli yükleme hâlâ günlüğe yazılıyor');
});

test('basım listesi adresi kaldırıldı', async () => {
  const s = await f('../../admin/admin_finance.routes.js');
  assert.ok(!/finance\/issuances['"]/.test(s), 'basım listesi adresi duruyor');
});
