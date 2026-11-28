import test from 'node:test';
import assert from 'node:assert/strict';
import { stepUpError } from '../src/modules/games/plugins.service.js';

test('kod çalıştıran paket işlemi: 2FA açık + geçerli kod şart', () => {
  assert.match(stepUpError({ enabled: false, code: '123456', valid: true }), /iki adımlı doğrulamayı açın/, '2FA kapalıysa kod işe yaramaz');
  assert.match(stepUpError({ enabled: true, code: '', valid: false }), /kodunu girin/);
  assert.equal(stepUpError({ enabled: true, code: '000000', valid: false }), 'Doğrulama kodu hatalı.');
  assert.equal(stepUpError({ enabled: true, code: '123456', valid: true }), null);
});
