import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAY_LEVELS as L } from '../src/modules/games/paytable.rules.js';
import { evaluateHost } from '../src/modules/agencies/agency_metrics.service.js';
import { consumedDiamondsByUser } from '../src/modules/wallet/advance_ledger.service.js';

const H = 3600;
const baseSettings = { splitByRoomType: false, allowBalanceMethod: true, requireGameHours: false, penaltyBps: 5000, audioShortfallCutBps: 0, instantSalaryBps: 5000 };
const cfgOf = (extra) => ({ levels: L, videoLevels: L, settings: { ...baseSettings, ...extra } });
const metrics = (over = {}) => ({ seconds: 40 * H, validDays: 10, gameSeconds: 0, diamonds: 200_000n, ...over });

test('ay içi maaş kuralı AÇIKKEN evaluateHost basit kuralı kullanır (şart eksik → 7$)', () => {
  const e = evaluateHost(cfgOf({ instantSalaryEnabled: true }), metrics(), { balance: 200_000n });
  assert.equal(e.audioCents, 700n);
  assert.equal(e.salaryCents, 700n);
  assert.equal(e.consume, 200_000n);
});

test('ay içi maaş kuralı AÇIKKEN şartlar tamamsa 15$', () => {
  const e = evaluateHost(cfgOf({ instantSalaryEnabled: true }), metrics({ seconds: 80 * H, validDays: 22 }), { balance: 200_000n });
  assert.equal(e.salaryCents, 1500n);
});

test('ay içi maaş kuralı KAPALIYKEN eski hesap aynen çalışır (şart eksik, kesinti 0 → 0$)', () => {
  const e = evaluateHost(cfgOf({ instantSalaryEnabled: false }), metrics(), { balance: 200_000n });
  assert.equal(e.salaryCents, 0n);
  // Ayar hiç yoksa da kapalı sayılır.
  assert.equal(evaluateHost(cfgOf({}), metrics(), { balance: 200_000n }).salaryCents, 0n);
});

test('avansla düşülen elmas bakiyeye geri eklenince bozdurmama şartı bozulmaz: tam maaş', () => {
  // Elmas avansta Fasulyeye çevrildi (bakiye 0); etkin bakiye = 0 + 200 bin düşülen.
  const m = metrics({ seconds: 80 * H, validDays: 22 });
  const kaybolmus = evaluateHost(cfgOf({ instantSalaryEnabled: true }), m, { balance: 0n }); // geri eklenmeseydi: bozdurulmuş sayılırdı
  assert.equal(kaybolmus.salaryCents, 700n);
  const etkin = evaluateHost(cfgOf({ instantSalaryEnabled: true }), m, { balance: 0n + 200_000n });
  assert.equal(etkin.salaryCents, 1500n);
});

test('consumedDiamondsByUser: kullanıcı başına avansla düşülen elmas toplamı', async () => {
  const calls = [];
  const run = async (sql, params) => { calls.push({ sql: sql.replace(/\s+/g, ' '), params }); return { rows: [{ user_id: 'a', s: '200000' }, { user_id: 'b', s: '50' }] }; };
  const from = new Date('2026-11-01'); const to = new Date('2026-12-01');
  const m = await consumedDiamondsByUser(run, ['a', 'b', 'c'], from, to);
  assert.equal(m.get('a'), 200000n);
  assert.equal(m.get('b'), 50n);
  assert.equal(m.get('c'), undefined);
  assert.match(calls[0].sql, /applied_period_id IS NULL/); // kapanmış döneme işlenmiş avanslar sayılmaz
  assert.deepEqual(calls[0].params, [['a', 'b', 'c'], from, to]);
  // Kullanıcı yoksa sorgu atılmaz.
  assert.equal((await consumedDiamondsByUser(async () => { throw new Error('çağrılmamalı'); }, [], from, to)).size, 0);
});
