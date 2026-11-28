import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { hashInPool, compareInPool, closePasswordPool, POOL_SIZE } from '../src/infrastructure/crypto/password_pool.js';

test('havuzdaki özet bcryptjs ile birebir uyumlu (eski şifreler aynen doğrulanır)', async () => {
  const fromPool = await hashInPool('gizli-sifre-1', 4);
  assert.match(fromPool, /^\$2[aby]\$04\$/);
  assert.equal(await bcrypt.compare('gizli-sifre-1', fromPool), true, 'havuzun özeti ana kütüphaneyle doğrulanır');
  const old = await bcrypt.hash('eski-sifre', 4);
  assert.equal(await compareInPool('eski-sifre', old), true, 'eski özet havuzda doğrulanır');
  assert.equal(await compareInPool('yanlis', old), false);
});

test('bozuk özet: bcryptjs gibi false döner (davranış değişmedi), havuz çalışmaya devam eder', async () => {
  assert.equal(await compareInPool('x', 'bozuk-ozet'), await bcrypt.compare('x', 'bozuk-ozet'));
  assert.equal(await compareInPool('x', 'bozuk-ozet'), false);
  const h = await hashInPool('sonra', 4);
  assert.equal(await compareInPool('sonra', h), true);
});

test('ana iş parçacığı serbest kalır: özet sürerken zamanlayıcı gecikmez', async () => {
  // 12 maliyetli 4 özet (ana iş parçacığında ~1,2 sn kilit). Havuzda iken 10 ms'lik zamanlayıcı en çok birkaç ms gecikmeli.
  let worst = 0; let last = Date.now();
  const tick = setInterval(() => { const now = Date.now(); worst = Math.max(worst, now - last - 10); last = now; }, 10);
  await Promise.all(Array.from({ length: 4 }, (_, i) => hashInPool(`p${i}`, 12)));
  clearInterval(tick);
  assert.ok(worst < 150, `ana iş parçacığı ${worst} ms kilitlendi (havuz boyu ${POOL_SIZE})`);
});

test.after(() => closePasswordPool());
