import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, bucketOf } from '../feature_flags.service.js';

const flag = (p = {}) => ({
  key: 'test_flag', enabled: true, rollout_percent: 0,
  allow_user_ids: [], deny_user_ids: [], min_app_version: '', platforms: [], ...p,
});
const U = '11111111-2222-3333-4444-555555555555';
const V = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('kapalı bayrak: oran 100 olsa da kapalı', () => {
  assert.equal(evaluate(flag({ enabled: false, rollout_percent: 100 }), { userId: U }), false);
});

test('oran 100: herkese açık', () => {
  assert.equal(evaluate(flag({ rollout_percent: 100 }), { userId: U }), true);
  assert.equal(evaluate(flag({ rollout_percent: 100 }), { userId: V }), true);
});

test('oran 0: kimseye açık değil', () => {
  assert.equal(evaluate(flag({ rollout_percent: 0 }), { userId: U }), false);
});

test('aynı kullanıcı her çağrıda aynı sonucu alır (özellik gelip gitmez)', () => {
  const f = flag({ rollout_percent: 50 });
  const first = evaluate(f, { userId: U });
  for (let i = 0; i < 200; i++) assert.equal(evaluate(f, { userId: U }), first);
});

test('kova dağılımı dengeli: %30 oranda gerçek pay %25-35 arasında', () => {
  const f = flag({ rollout_percent: 30 });
  let on = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const id = `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`;
    if (evaluate(f, { userId: id })) on++;
  }
  const pct = (on / N) * 100;
  assert.ok(pct > 25 && pct < 35, `beklenen ~%30, çıkan %${pct.toFixed(1)}`);
});

test('iki ayrı bayrak aynı kullanıcı grubuna denk gelmez', () => {
  // Bayrak anahtarı karmaya dahil edilmeseydi, %10'luk her bayrak AYNI kullanıcıları seçerdi:
  // bir grup kullanıcı her denemenin kobayı olurdu.
  let same = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const id = `${String(i).padStart(8, '0')}-0000-0000-0000-000000000000`;
    if (bucketOf(id, 'flag_a') === bucketOf(id, 'flag_b')) same++;
  }
  // Rastgele olsaydı ~%1 (1/100) beklenir; bariz bir ilişki varsa bu çok daha yüksek çıkar.
  assert.ok(same / N < 0.05, `kovalar fazla örtüşüyor: %${((same / N) * 100).toFixed(1)}`);
});

test('her zaman kapalı listesi her şeyin önünde', () => {
  assert.equal(evaluate(flag({ rollout_percent: 100, deny_user_ids: [U] }), { userId: U }), false);
  // Her iki listede de varsa kapalı kazanır: şikâyet eden kullanıcı kesin kapatılabilmeli.
  assert.equal(evaluate(flag({ rollout_percent: 100, deny_user_ids: [U], allow_user_ids: [U] }), { userId: U }), false);
});

test('her zaman açık listesi: bayrak kapalıyken bile açık (test hesabı)', () => {
  assert.equal(evaluate(flag({ enabled: false, rollout_percent: 0, allow_user_ids: [U] }), { userId: U }), true);
});

test('eski sürüm: özelliği olmayan APK\'da açılmaz', () => {
  const f = flag({ rollout_percent: 100, min_app_version: '2.136.0' });
  assert.equal(evaluate(f, { userId: U, appVersion: '2.135.0' }), false);
  assert.equal(evaluate(f, { userId: U, appVersion: '2.136.0' }), true);
  assert.equal(evaluate(f, { userId: U, appVersion: '2.140.1' }), true);
  // Sürüm bilinmiyorsa (başlık yok) kademeli bayrak açılmaz.
  assert.equal(evaluate(f, { userId: U, appVersion: '' }), false);
});

test('platform sınırı', () => {
  const f = flag({ rollout_percent: 100, platforms: ['android'] });
  assert.equal(evaluate(f, { userId: U, platform: 'android' }), true);
  assert.equal(evaluate(f, { userId: U, platform: 'ios' }), false);
});

test('girişsiz kullanıcı: kademeli bayrak kapalı, tam açık bayrak açık', () => {
  assert.equal(evaluate(flag({ rollout_percent: 50 }), { userId: null }), false);
  assert.equal(evaluate(flag({ rollout_percent: 100 }), { userId: null }), true);
});

test('bilinmeyen bayrak kapalıdır', () => {
  assert.equal(evaluate(null, { userId: U }), false);
  assert.equal(evaluate(undefined, { userId: U }), false);
});
