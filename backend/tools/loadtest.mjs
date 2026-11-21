#!/usr/bin/env node
// Yük testi — sıfır bağımlılık.
//
//   node tools/loadtest.mjs --url https://api.alanadi.com --users 200 --duration 60
//
// ## Niçin kendi aracımız
//
// k6 ya da Artillery daha yetenekli, ama ikisi de kuruluma ihtiyaç duyar ve senaryoyu ayrı bir
// dilde yazdırır. Burada ölçmek istediğimiz şey kendi API'mizin kendi akışı: giriş → oda listesi
// → odaya gir → sohbet → çık. Bunu Node'un kendi `fetch`'iyle yazmak hem bağımlılık eklemiyor
// hem de senaryo koddaki gerçek uçlarla aynı yerde duruyor.
//
// ## ÖNEMLİ: üretime karşı çalıştırmayın
//
// Bu araç gerçek kullanıcı yaratır, gerçek oda açar ve gerçek mesaj yazar. Üretim veritabanında
// çöp bırakır ve gerçek kullanıcıların deneyimini bozar. Ayrı bir kopyaya karşı çalıştırın.
// Araç, adres `localhost`/`127.0.0.1`/`.test`/`staging`/`dev` içermiyorsa **onay ister**.
//
// ## Neyi ölçer
//
// Uç başına p50/p95/p99 gecikme, hata oranı, saniyedeki istek. Ortalama DEĞİL yüzdelik dilim
// raporlanır: ortalama, en yavaş %5'i gizler — oysa kullanıcıların şikâyet ettiği tam orasıdır.

const args = Object.fromEntries(
  process.argv.slice(2).join(' ').split('--').filter(Boolean)
    .map((s) => s.trim().split(/\s+/)).map(([k, v]) => [k, v ?? 'true']),
);

const URL_BASE = (args.url || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const USERS = Math.max(1, Number(args.users) || 20);
const DURATION = Math.max(5, Number(args.duration) || 30);
const RAMP = Math.max(1, Number(args.ramp) || Math.min(15, USERS));

const SAFE = /localhost|127\.0\.0\.1|\[::1\]|\.test\b|staging|\bdev\b|\bqa\b/i.test(URL_BASE);
if (!SAFE && args.yes !== 'true') {
  console.error(`
  ${URL_BASE} yerel ya da test adresi gibi görünmüyor.

  Bu araç GERÇEK kullanıcı yaratır, GERÇEK oda açar ve GERÇEK mesaj yazar. Üretimde
  çalıştırmak veritabanında çöp bırakır ve gerçek kullanıcıların deneyimini bozar.

  Gerçekten bu adrese karşı çalıştırmak istiyorsanız --yes ekleyin.`);
  process.exit(2);
}

// --- Ölçüm ---------------------------------------------------------------------------------

const stats = new Map(); // ad -> { ok: [ms], fail: n, codes: Map }

function record(name, ms, ok, code) {
  let s = stats.get(name);
  if (!s) stats.set(name, (s = { ok: [], fail: 0, codes: new Map() }));
  if (ok) s.ok.push(ms); else s.fail++;
  s.codes.set(code, (s.codes.get(code) || 0) + 1);
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
}

async function call(name, path, { method = 'GET', body, token } = {}) {
  const t0 = performance.now();
  try {
    const r = await fetch(URL_BASE + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const ms = performance.now() - t0;
    const data = await r.json().catch(() => null);
    record(name, ms, r.ok, r.status);
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    record(name, performance.now() - t0, false, e.name === 'TimeoutError' ? 'timeout' : 'network');
    return { ok: false, status: 0, data: null };
  }
}

// --- Senaryo -------------------------------------------------------------------------------

let stop = false;
const rnd = () => Math.random().toString(36).slice(2, 10);

/// Bir sanal kullanıcının yaşam döngüsü. Gerçek kullanımı taklit eder: her istekten sonra
/// kısa bir bekleme var, çünkü aralıksız istek atan bir istemci gerçek yükü temsil etmez —
/// sunucuyu olduğundan hızlı ya da yavaş gösterir.
async function virtualUser(i) {
  const username = `lt_${Date.now().toString(36)}_${i}_${rnd()}`;
  const password = 'Yuktest!2026';

  const reg = await call('register', '/api/auth/register', {
    method: 'POST',
    body: { username, password, displayName: `Yük ${i}` },
  });
  let token = reg.data?.token;
  if (!token) {
    const login = await call('login', '/api/auth/login', { method: 'POST', body: { username, password } });
    token = login.data?.token;
  }
  if (!token) return;

  while (!stop) {
    await call('app_config', '/api/app/config');
    await sleep(200 + Math.random() * 400);

    const rooms = await call('room_list', '/api/rooms?limit=20', { token });
    await sleep(300 + Math.random() * 600);

    const roomId = rooms.data?.rooms?.[0]?.id;
    if (roomId) {
      await call('room_join', `/api/rooms/${roomId}/join`, { method: 'POST', token });
      await sleep(400 + Math.random() * 800);
      await call('room_messages', `/api/rooms/${roomId}/messages?limit=30`, { token });
      await sleep(300 + Math.random() * 600);
      await call('chat_send', `/api/rooms/${roomId}/messages`, {
        method: 'POST', token, body: { body: `yük testi ${rnd()}` },
      });
      await sleep(500 + Math.random() * 1000);
      await call('room_leave', `/api/rooms/${roomId}/leave`, { method: 'POST', token });
    }
    await call('me', '/api/me', { token });
    await sleep(500 + Math.random() * 1500);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Çalıştır ------------------------------------------------------------------------------

console.log(`Yük testi: ${URL_BASE} · ${USERS} kullanıcı · ${DURATION} sn · ${RAMP} sn rampa\n`);

const started = Date.now();
const runners = [];
for (let i = 0; i < USERS; i++) {
  // Rampa: hepsi aynı anda başlamaz. Aynı anda başlatmak, gerçekte olmayan bir ani yük yaratır
  // ve ölçülen şey sunucunun kapasitesi değil, o ani yükün etkisi olur.
  const delay = (i / USERS) * RAMP * 1000;
  runners.push(sleep(delay).then(() => virtualUser(i)));
}

setTimeout(() => { stop = true; }, DURATION * 1000 + RAMP * 1000);
await Promise.allSettled(runners);

// --- Rapor ---------------------------------------------------------------------------------

const elapsed = (Date.now() - started) / 1000;
const rows = [...stats.entries()].map(([name, s]) => {
  const total = s.ok.length + s.fail;
  return {
    name,
    istek: total,
    'hata%': total ? ((s.fail / total) * 100).toFixed(1) : '0.0',
    p50: Math.round(pct(s.ok, 50)),
    p95: Math.round(pct(s.ok, 95)),
    p99: Math.round(pct(s.ok, 99)),
    'en yavaş': Math.round(Math.max(0, ...s.ok)),
  };
}).sort((a, b) => b.p95 - a.p95);

console.log(`\nSüre: ${elapsed.toFixed(1)} sn`);
console.table(rows);

const totalReq = rows.reduce((n, r) => n + r.istek, 0);
const totalFail = [...stats.values()].reduce((n, s) => n + s.fail, 0);
console.log(`Toplam ${totalReq} istek · ${(totalReq / elapsed).toFixed(1)} istek/sn · hata %${((totalFail / Math.max(1, totalReq)) * 100).toFixed(2)}`);

// En yavaş uç, darboğazın ilk adresidir.
if (rows.length) {
  const worst = rows[0];
  console.log(`\nEn yavaş uç: ${worst.name} (p95 ${worst.p95} ms, p99 ${worst.p99} ms)`);
  if (worst.p95 > 1000) console.log('p95 1 saniyenin üstünde — bu uç kullanıcıya yavaş hissettirir.');
}
const bad = rows.filter((r) => Number(r['hata%']) > 1);
if (bad.length) console.log(`\nHata oranı %1'in üstünde olan uçlar: ${bad.map((r) => r.name).join(', ')}`);
