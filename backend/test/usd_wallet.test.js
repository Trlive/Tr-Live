import test from 'node:test';
import assert from 'node:assert/strict';
import { centsOf, coinsFor, usdSettings, settingsJson, beansText, CREDIT_TYPES } from '../src/modules/wallet/usd_wallet.service.js';
import { CONFIG_DEFAULTS, validateConfigPatch } from '../src/modules/system/app_config.service.js';

test('dolar cüzdanı: tutar doğrulama (yalnızca pozitif tam sent)', () => {
  assert.equal(centsOf(1000), 1000n);
  assert.equal(centsOf('2550'), 2550n);
  assert.equal(centsOf(' 10 '), 10n);
  for (const bad of [0, '0', -5, '-5', 10.5, '10.5', '1e3', 'abc', '', null, undefined, {}, [], '1234567890123', Number.NaN, Infinity, '10 dolar', '0x10']) {
    assert.throws(() => centsOf(bad), /geçersiz/, `reddedilmeli: ${String(bad)}`);
  }
});

test('dolar cüzdanı: bayiye gönderimde Coin karşılığı tam sayı hesabıyla (aşağı yuvarlanır)', () => {
  assert.equal(coinsFor(1000n, 4000n), 40000n);
  assert.equal(coinsFor(2550n, 4000n), 102000n);
  assert.equal(coinsFor(1n, 4000n), 40n);
  assert.equal(coinsFor(1n, 50n), 0n, '1 sent × 50 Coin/dolar = 0,5 → 0');
  assert.equal(coinsFor(999999999999n, 100000000n), 999999999999000000n, 'büyük tutarlarda taşma / kayan nokta hatası yok');
  assert.equal(coinsFor('1000', '4000'), 40000n);
});

test('dolar cüzdanı: varsayılan ayarlar ve panel doğrulaması', () => {
  const s = usdSettings(CONFIG_DEFAULTS);
  assert.deepEqual(settingsJson(s), { enabled: true, withdrawMinCents: '1000', dealerMinCents: '1000', coinsPerUsd: '4000', exchangeCoinsPerUsd: '4000', exchangeMinCents: '100' });
  assert.equal(usdSettings({ ...CONFIG_DEFAULTS, usdEnabled: false }).enabled, false);
  assert.deepEqual(validateConfigPatch({ usdWithdrawMinCents: 2500, usdDealerMinCents: 1000, usdDealerCoinsPerUsd: 5000, usdEnabled: false, usdAutoCredit: true }),
    { usdWithdrawMinCents: 2500, usdDealerMinCents: 1000, usdDealerCoinsPerUsd: 5000, usdEnabled: false, usdAutoCredit: true });
  for (const bad of [{ usdDealerCoinsPerUsd: 0 }, { usdDealerCoinsPerUsd: 1.5 }, { usdWithdrawMinCents: 99 }, { usdWithdrawMinCents: '1000' }, { usdEnabled: 'true' }, { usdDealerMinCents: -1 }]) {
    assert.throws(() => validateConfigPatch(bad), undefined, JSON.stringify(bad));
  }
  assert.deepEqual(CREDIT_TYPES, ['salary', 'agency_bonus', 'assistant_share', 'referral_bonus']);
});

test('Fasulye: 1 Fasulye = 1 dolar; metin ve Coin karşılığı', () => {
  assert.equal(beansText(100n), '1');
  assert.equal(beansText(1250n), '12,5');
  assert.equal(beansText(1205n), '12,05');
  assert.equal(beansText(5n), '0,05');
  assert.equal(beansText('250000'), '2500');
  // Varsayılan kur: 1 Fasulye = 4.000 Coin; kesirli Fasulyede aşağı yuvarlanır.
  const s = usdSettings(CONFIG_DEFAULTS);
  assert.equal(s.exchangeCoinsPerUsd, 4000n);
  assert.equal(s.exchangeMinCents, 100n);
  assert.equal(coinsFor(100n, s.exchangeCoinsPerUsd), 4000n);
  assert.equal(coinsFor(1250n, s.exchangeCoinsPerUsd), 50000n);
  assert.equal(coinsFor(1n, 7000n), 70n);
  assert.equal(coinsFor(1n, 33n), 0n, 'çok küçük tutar 0 Coin eder (işlem reddedilir)');
  assert.deepEqual(validateConfigPatch({ usdCoinsPerUsd: 8000, usdExchangeMinCents: 500 }), { usdCoinsPerUsd: 8000, usdExchangeMinCents: 500 });
  for (const bad of [{ usdCoinsPerUsd: 0 }, { usdCoinsPerUsd: 2.5 }, { usdExchangeMinCents: 0 }, { usdExchangeMinCents: '100' }]) {
    assert.throws(() => validateConfigPatch(bad), undefined, JSON.stringify(bad));
  }
});
