import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAY_LEVELS, cheapestDiamondsPerUsd, salaryLoopError } from '../src/modules/games/paytable.rules.js';

test('varsayılan tablo: en cömert seviye 1$ için ~10.638 elmas ister (maaş + ajans primi)', () => {
  assert.equal(cheapestDiamondsPerUsd(DEFAULT_PAY_LEVELS), 10638n);
});

test('iki tablodan en cömerdi alınır; ödemesiz seviye yok sayılır', () => {
  const a = [{ diamonds: 1000n, salary1Cents: 100n, salary2Cents: 0n, agencyCents: 0n }]; // 1000 elmas / $
  const b = [{ diamonds: 500n, salary1Cents: 0n, salary2Cents: 100n, agencyCents: 0n }, { diamonds: 1n, salary1Cents: 0n, salary2Cents: 0n, agencyCents: 0n }];
  assert.equal(cheapestDiamondsPerUsd(a, b), 500n);
  assert.equal(cheapestDiamondsPerUsd([], null), null);
});

test('kur, tablonun istediği elmastan azsa döngü yok; eşit ya da fazlaysa hata', () => {
  assert.equal(salaryLoopError({ coinsPerUsd: 4000, diamondsPerUsd: 10638n }), null);
  assert.equal(salaryLoopError({ coinsPerUsd: 10637, diamondsPerUsd: 10638n }), null);
  assert.match(salaryLoopError({ coinsPerUsd: 10638, diamondsPerUsd: 10638n, label: 'Kur' }), /kendine hediye/);
  assert.match(salaryLoopError({ coinsPerUsd: 50000, diamondsPerUsd: 10638n }), /1\$ = 50000 Coin/);
  assert.equal(salaryLoopError({ coinsPerUsd: 1e8, diamondsPerUsd: null }), null, 'ödemesiz tabloda döngü yok');
});
