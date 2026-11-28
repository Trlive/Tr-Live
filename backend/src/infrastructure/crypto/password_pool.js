// Şifre özeti (bcrypt) ana iş parçacığının DIŞINDA.
//
// Neden: bcryptjs saf JavaScript'tir; 12 maliyetle tek bir özet/karşılaştırma ~290 ms işlemci harcar ve bu süre boyunca
// Node'un tek iş parçacığı başka hiçbir isteğe bakamaz. Yük testinde (tools/loadtest.mjs, 150 kullanıcı) kayıt/giriş
// dalgası tüm sunucuyu kilitledi: oda listesi, /me ve ayarlar 6–19 sn bekledi, isteklerin yarısı zaman aşımına düştü.
// Üretimde bunun karşılığı: kampanyayla gelen yeni kullanıcı dalgası ya da dağıtık şifre deneme saldırısı, açık odalardaki
// herkesin uygulamasını dondurur.
//
// Çözüm: aynı bcryptjs, Node'un kendi worker_threads'inde. Özet biçimi değişmez (eski şifreler aynen doğrulanır), yeni
// bağımlılık yok. Havuz işlemci sayısı − 1 kadar (en az 1, en çok 4) iş parçacığıdır; ana iş parçacığı istekleri karşılamaya
// devam eder. İş parçacığı açılamazsa (kısıtlı ortam) eski yola, ana iş parçacığında bcryptjs'e dönülür.
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';

const require = createRequire(import.meta.url);
const BCRYPT_PATH = require.resolve('bcryptjs');

// İş parçacığının kodu: istekleri sırayla işler (her iş parçacığında aynı anda tek işlem; paralellik havuzdan gelir).
const WORKER_SRC = `
const { parentPort, workerData } = require('node:worker_threads');
const bcrypt = require(workerData.bcryptPath);
parentPort.on('message', ({ id, op, a, b }) => {
  try {
    const value = op === 'hash' ? bcrypt.hashSync(a, b) : bcrypt.compareSync(a, b);
    parentPort.postMessage({ id, value });
  } catch (e) {
    parentPort.postMessage({ id, error: String(e && e.message || e) });
  }
});`;

export const POOL_SIZE = Math.max(1, Math.min(4, (os.availableParallelism?.() ?? os.cpus().length) - 1));

let workers = null; // [{ worker, pending: Map(id -> {resolve, reject}) }]
let disabled = false;
let seq = 0;
let rr = 0;

function spawn() {
  const slot = { worker: null, pending: new Map() };
  const w = new Worker(WORKER_SRC, { eval: true, workerData: { bcryptPath: BCRYPT_PATH } });
  w.unref(); // sunucu kapanırken bekletmesin
  w.on('message', ({ id, value, error }) => {
    const p = slot.pending.get(id);
    if (!p) return;
    slot.pending.delete(id);
    if (error) p.reject(new Error(error)); else p.resolve(value);
  });
  const die = (err) => {
    // İş parçacığı öldü: bekleyenler hata alır, yerine yenisi açılır.
    for (const p of slot.pending.values()) p.reject(err instanceof Error ? err : new Error('Şifre iş parçacığı kapandı.'));
    slot.pending.clear();
    const i = workers?.indexOf(slot) ?? -1;
    if (i >= 0) {
      try { workers[i] = spawn(); } catch { workers.splice(i, 1); if (!workers.length) { workers = null; disabled = true; } }
    }
  };
  w.on('error', die);
  w.on('exit', (code) => { if (code !== 0) die(new Error(`Şifre iş parçacığı ${code} koduyla kapandı.`)); });
  slot.worker = w;
  return slot;
}

function pool() {
  if (disabled) return null;
  if (!workers) {
    try {
      workers = Array.from({ length: POOL_SIZE }, spawn);
    } catch (e) {
      disabled = true;
      workers = null;
      console.warn('[uyarı] Şifre iş parçacıkları açılamadı; bcrypt ana iş parçacığında çalışacak:', e.message);
      return null;
    }
  }
  return workers;
}

function run(op, a, b) {
  const ws = pool();
  if (!ws) return op === 'hash' ? bcrypt.hash(a, b) : bcrypt.compare(a, b);
  // En az işi olan iş parçacığı; eşitlikte sırayla.
  let slot = ws[rr++ % ws.length];
  for (const s of ws) if (s.pending.size < slot.pending.size) slot = s;
  const id = ++seq;
  return new Promise((resolve, reject) => {
    slot.pending.set(id, { resolve, reject });
    slot.worker.postMessage({ id, op, a, b });
  });
}

/** bcrypt özeti (maliyet: rounds). bcryptjs.hash ile aynı çıktı biçimi. */
export const hashInPool = (password, rounds) => run('hash', String(password), rounds);
/** bcrypt karşılaştırması. */
export const compareInPool = (password, hash) => run('compare', String(password), String(hash));

/** Testler için: iş parçacıklarını kapatır. */
export async function closePasswordPool() {
  const ws = workers;
  workers = null;
  if (ws) await Promise.all(ws.map((s) => s.worker.terminate()));
}
