import test from 'node:test';
import assert from 'node:assert/strict';
import { errorWindow, recordQuery, recordRequest, resetMetrics, snapshot } from '../src/infrastructure/observability/metrics.js';

test('yüzdelikler: p50/p95/p99 sıralı örneklemden okunur', () => {
  resetMetrics();
  // 1..100 ms arası 100 istek. p50 ≈ 50, p95 ≈ 95, p99 ≈ 99.
  for (let i = 1; i <= 100; i++) recordRequest({ method: 'GET', route: '/api/x', status: 200, ms: i });
  const r = snapshot().routes[0];
  assert.equal(r.count, 100);
  assert.ok(r.p50 >= 49 && r.p50 <= 52, `p50 = ${r.p50}`);
  assert.ok(r.p95 >= 94 && r.p95 <= 97, `p95 = ${r.p95}`);
  assert.ok(r.p99 >= 98 && r.p99 <= 100, `p99 = ${r.p99}`);
  assert.equal(r.maxMs, 100);
});

test('ortalama yanıltır, yüzdelik yanıltmaz', () => {
  resetMetrics();
  // 95 istek hızlı, 5 istek çok yavaş: ortalama "iyi" görünür ama p95 gerçeği söyler.
  for (let i = 0; i < 95; i++) recordRequest({ method: 'GET', route: '/api/y', status: 200, ms: 80 });
  for (let i = 0; i < 5; i++) recordRequest({ method: 'GET', route: '/api/y', status: 200, ms: 9000 });
  const r = snapshot().routes[0];
  assert.ok(r.avgMs < 600, `ortalama ${r.avgMs} ms — "iyi" görünüyor`);
  assert.ok(r.p95 >= 8000, `p95 ${r.p95} ms — sorunu göstermeli`);
});

test('uç anahtarı desen olmalı: her kimlik ayrı satır açmaz', () => {
  resetMetrics();
  for (let i = 0; i < 50; i++) recordRequest({ method: 'GET', route: '/api/rooms/:roomId', status: 200, ms: 10 });
  const s = snapshot();
  assert.equal(s.routeCount, 1, 'desen tek satır olmalı');
  assert.equal(s.routes[0].count, 50);
});

test('kardinalite tavanı: beklenmedik anahtar seli belleği yemez', () => {
  resetMetrics();
  for (let i = 0; i < 1000; i++) recordRequest({ method: 'GET', route: `/api/${i}`, status: 200, ms: 5 });
  const s = snapshot({ limit: 1000 });
  assert.ok(s.routeCount <= 400, `tavan aşıldı: ${s.routeCount}`);
  assert.equal(s.truncated, true, 'tavana dayandığı panelde görünmeli');
});

test('hata oranı penceresi yalnızca 5xx sayar', () => {
  resetMetrics();
  for (let i = 0; i < 90; i++) recordRequest({ method: 'GET', route: '/api/z', status: 200, ms: 5 });
  for (let i = 0; i < 5; i++) recordRequest({ method: 'GET', route: '/api/z', status: 404, ms: 5 });
  for (let i = 0; i < 5; i++) recordRequest({ method: 'GET', route: '/api/z', status: 500, ms: 5 });
  const w = errorWindow();
  assert.equal(w.count, 100);
  assert.equal(w.errors, 5, '404 sunucu hatası değildir');
  assert.ok(Math.abs(w.rate - 0.05) < 1e-9);
  const r = snapshot().routes[0];
  assert.equal(r.clientErrors, 5);
  assert.equal(r.serverErrors, 5);
});

test('yavaş SQL: normalleştirilir, değerler kaydedilmez, tekrarlar sayılır', () => {
  resetMetrics();
  recordQuery({ ms: 900, sql: "SELECT * FROM users WHERE id = 42 AND name = 'Ahmet'" });
  recordQuery({ ms: 1200, sql: "SELECT * FROM users WHERE id = 77 AND name = 'Mehmet'" });
  const s = snapshot();
  assert.equal(s.slowQueries.length, 1, 'aynı sorgu tek satır olmalı');
  const q = s.slowQueries[0];
  assert.equal(q.count, 2);
  assert.equal(q.ms, 1200, 'en yüksek süre tutulur');
  assert.ok(!/Ahmet|Mehmet|42|77/.test(q.sql), `değer sızdı: ${q.sql}`);
});

test('hızlı SQL listeye girmez', () => {
  resetMetrics();
  recordQuery({ ms: 5, sql: 'SELECT 1' });
  const s = snapshot();
  assert.equal(s.slowQueries.length, 0);
  assert.equal(s.queries.count, 1, 'ama sayıya dahildir');
});

test('sıralama: p95, hata ve çağrı sayısına göre', () => {
  resetMetrics();
  for (let i = 0; i < 10; i++) recordRequest({ method: 'GET', route: '/yavas', status: 200, ms: 5000 });
  for (let i = 0; i < 100; i++) recordRequest({ method: 'GET', route: '/cok', status: 200, ms: 10 });
  for (let i = 0; i < 3; i++) recordRequest({ method: 'GET', route: '/hatali', status: 500, ms: 10 });
  assert.equal(snapshot({ sortBy: 'p95' }).routes[0].route, '/yavas');
  assert.equal(snapshot({ sortBy: 'count' }).routes[0].route, '/cok');
  assert.equal(snapshot({ sortBy: 'errors' }).routes[0].route, '/hatali');
});
