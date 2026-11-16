import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateVideoPay, evaluatePay, DEFAULT_PAY_LEVELS } from '../src/paytable.js';
import { evaluateHost, videoRules } from '../src/services/agency_metrics.js';
import { validateAgencyConfig } from '../src/agency_config.js';

const L = DEFAULT_PAY_LEVELS;
const l1 = L[0]; const l2 = L[1];
const H = 3600;
const full = { seconds: l2.hours * H, validDays: l2.days, gameSeconds: 0 };

test('görüntülü maaş: yalnızca Yöntem 1; bakiye yöntemi uygulanmaz', () => {
  const e = evaluateVideoPay({ levels: L, metrics: { ...full, diamonds: l2.diamonds, balance: 999999999999n } });
  assert.equal(e.level.level, 2);
  assert.equal(e.salaryCents, l2.salary1Cents);
  assert.equal(e.method, 1);
  assert.equal(e.level2, null);
  assert.equal(e.consume, 0n);
  assert.equal(e.shortfall, false);
});

test('görüntülü maaş: şart tutmayan seviye — kural kapalıyken ödenmez, açıkken kesintili ödenir', () => {
  const m = { seconds: (l2.hours - 5) * H, validDays: l2.days, gameSeconds: 0, diamonds: l2.diamonds };
  const strict = evaluateVideoPay({ levels: L, metrics: m });
  assert.equal(strict.salaryCents, 0n);
  assert.equal(strict.blocked.level, 2);
  assert.ok(strict.blockedBy.includes('hours'));
  const half = evaluateVideoPay({ levels: L, metrics: m, video: { shortfallCutBps: 5000 } });
  assert.equal(half.salaryCents, l2.salary1Cents / 2n);
  assert.equal(half.shortfall, true);
  assert.equal(half.level.level, 2);
  assert.equal(evaluateVideoPay({ levels: L, metrics: m, video: { shortfallCutBps: 10000 } }).salaryCents, 0n, '%100 kesinti = ödeme yok');
  assert.equal(evaluateVideoPay({ levels: L, metrics: m, video: { shortfallCutBps: 99999 } }).salaryCents, 0n, 'oran 10000 ile sınırlanır');
  // Şartı tutan daha düşük seviyenin maaşı daha yüksekse o ödenir (kesinti kuralı maaşı düşürmez).
  const lowCut = evaluateVideoPay({ levels: L, metrics: { seconds: l1.hours * H, validDays: l1.days, gameSeconds: 0, diamonds: L[2].diamonds }, video: { shortfallCutBps: 9000 } });
  const met = evaluatePay({ levels: L, metrics: { seconds: l1.hours * H, validDays: l1.days, gameSeconds: 0, diamonds: L[2].diamonds, balance: 0n }, settings: { allowBalanceMethod: false }, pref: 1 });
  assert.ok(lowCut.salaryCents >= met.salaryCents);
  // Etkinlik cezası kesintili ödemeye de uygulanır.
  const ev = evaluateVideoPay({ levels: L, metrics: m, settings: { requireOfficialEvents: true, penaltyBps: 5000 }, video: { shortfallCutBps: 5000 }, eventsOk: false });
  assert.equal(ev.salaryCents, l2.salary1Cents / 4n);
});

test('yayıncı maaşı: sesli + görüntülü ayrı hesaplanıp toplanır; kapalıyken tek havuz', () => {
  const m = {
    seconds: 2 * l2.hours * H, validDays: l2.days, gameSeconds: 0, diamonds: l1.diamonds + l2.diamonds,
    audio: { seconds: l2.hours * H, validDays: l2.days, diamonds: l1.diamonds },
    video: { seconds: l2.hours * H, validDays: l2.days, diamonds: l2.diamonds },
  };
  const cfg = { levels: L, videoLevels: L, settings: { splitByRoomType: true, allowBalanceMethod: true } };
  const e = evaluateHost(cfg, m, { pref: 1 });
  assert.equal(e.split, true);
  assert.equal(e.audioCents, l1.salary1Cents);
  assert.equal(e.videoCents, l2.salary1Cents);
  assert.equal(e.salaryCents, l1.salary1Cents + l2.salary1Cents);
  assert.equal(e.level.level, 1, 'üst düzey seviye sesli taraftır');
  assert.equal(e.video.level.level, 2);
  // Görüntülü tablo farklıysa görüntülü taraf o tablodan hesaplanır.
  const vL = L.map((l) => ({ ...l, salary1Cents: l.salary1Cents * 3n }));
  assert.equal(evaluateHost({ ...cfg, videoLevels: vL }, m, { pref: 1 }).videoCents, l2.salary1Cents * 3n);
  // Bakiye yöntemi yalnızca sesli tarafta: bakiye çok yüksekse sesli Yöntem 2, görüntülü yine Yöntem 1.
  const big = evaluateHost(cfg, m, { pref: 0, balance: L[5].diamonds });
  assert.equal(big.method, 2);
  assert.equal(big.video.method, 1);
  assert.equal(big.consume, L[5].diamonds);
  assert.equal(big.salaryCents, big.audioCents + big.videoCents);
  // Ayrı hesap kapalı: toplam elmas sesli tablodan, görüntülü yok.
  const off = evaluateHost({ ...cfg, settings: { ...cfg.settings, splitByRoomType: false } }, m, { pref: 1 });
  assert.equal(off.split, false);
  assert.equal(off.video, null);
  assert.equal(off.videoCents, 0n);
  const whole = evaluatePay({ levels: L, metrics: { seconds: m.seconds, validDays: m.validDays, gameSeconds: 0, diamonds: m.diamonds, balance: 0n }, settings: cfg.settings, pref: 1 });
  assert.equal(off.salaryCents, whole.salaryCents);
});

test('görüntülü ayarları: varsayılanlar ve doğrulama', () => {
  assert.deepEqual(videoRules({}), { dailyCapMinutes: 0, minSessionMinutes: 0, shortfallCutBps: 0 });
  assert.deepEqual(videoRules({ videoDailyCapMinutes: 120, videoMinSessionMinutes: 30, videoShortfallCutBps: 5000 }), { dailyCapMinutes: 120, minSessionMinutes: 30, shortfallCutBps: 5000 });
  const ok = validateAgencyConfig({ settings: { splitByRoomType: false, videoDailyCapMinutes: 120, videoMinSessionMinutes: 30, videoShortfallCutBps: 5000 } });
  assert.deepEqual(ok.settings, { splitByRoomType: false, videoDailyCapMinutes: 120, videoMinSessionMinutes: 30, videoShortfallCutBps: 5000 });
  for (const bad of [{ splitByRoomType: 'evet' }, { videoDailyCapMinutes: 1441 }, { videoDailyCapMinutes: -1 }, { videoMinSessionMinutes: 1.5 }, { videoShortfallCutBps: 10001 }]) {
    assert.throws(() => validateAgencyConfig({ settings: bad }), undefined, JSON.stringify(bad));
  }
});
