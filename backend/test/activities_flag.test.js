import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_DEFAULTS, validateConfigPatch } from '../src/services/app_config.js';
test('genel etkinlik anahtarı tanımlı, bool doğrulanır; panelin gönderdiği anahtarlar kabul edilir', () => {
  assert.equal(CONFIG_DEFAULTS.roomActivitiesEnabled, true);
  assert.deepEqual(validateConfigPatch({ roomActivitiesEnabled: false }), { roomActivitiesEnabled: false });
  assert.throws(() => validateConfigPatch({ roomActivitiesEnabled: 'hayır' }));
  assert.doesNotThrow(() => validateConfigPatch({ blockRooted: false, sslPinning: false }));
});
