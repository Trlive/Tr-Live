import test from 'node:test';
import assert from 'node:assert/strict';
import { gainForLufs, parseIntegratedLufs, MIN_GAIN_DB } from '../loudness.rules.js';

test('ses yüksekliği: yüksek parça kısılır, kısık parça yükseltilmez, sınırlar', () => {
  assert.equal(gainForLufs(-8), -10);
  assert.equal(gainForLufs(-18), 0);
  assert.equal(gainForLufs(-25), 0, 'kısık parça yükseltilmez');
  assert.equal(gainForLufs(0), MIN_GAIN_DB, 'en çok MIN_GAIN_DB kısılır');
  assert.equal(gainForLufs(-12.34), -5.7);
  assert.equal(gainForLufs(-90), 0, 'sessiz parça');
  assert.equal(gainForLufs('x'), 0);
});

test('ebur128 çıktısından Integrated değeri okunur', () => {
  const out = `[Parsed_ebur128_0 @ 0x1] t: 1.2 M: -20.1 S: -22.0 I: -19.0 LUFS LRA: 0.0 LU\n[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -11.4 LUFS\n    Threshold: -21.6 LUFS\n`;
  assert.equal(parseIntegratedLufs(out), -11.4);
  assert.equal(parseIntegratedLufs('hata'), null);
});
