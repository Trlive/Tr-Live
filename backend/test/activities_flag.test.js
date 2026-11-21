import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_DEFAULTS, validateConfigPatch } from '../src/modules/system/app_config.service.js';
test('genel etkinlik anahtarı tanımlı, bool doğrulanır; panelin gönderdiği anahtarlar kabul edilir', () => {
  assert.equal(CONFIG_DEFAULTS.roomActivitiesEnabled, true);
  assert.deepEqual(validateConfigPatch({ roomActivitiesEnabled: false }), { roomActivitiesEnabled: false });
  assert.throws(() => validateConfigPatch({ roomActivitiesEnabled: 'hayır' }));
});

test('kaldırılan güvenlik ayarları geri gelmiyor (denetim S-04)', () => {
  // blockRooted ve sslPinning tanımlıydı ama mobil tarafta onları okuyan tek satır yoktu.
  // Hiçbir şey yapmayan bir güvenlik ayarı, yapıyormuş gibi görünür: "SSL pinning açık" sanan
  // bir yönetici olmayan bir korumaya güvenir. Yanlış güven, korumasızlıktan beterdir.
  //
  // Bu test, ayarların "uygulanmadan" geri eklenmesini engeller: eklenirse önce burada kırılır.
  assert.equal(CONFIG_DEFAULTS.blockRooted, undefined);
  assert.equal(CONFIG_DEFAULTS.sslPinning, undefined);
  assert.throws(() => validateConfigPatch({ blockRooted: false }), /Bilinmeyen ayar/);
  assert.throws(() => validateConfigPatch({ sslPinning: true }), /Bilinmeyen ayar/);
});

test('doğrulama ayarları: Firebase ve SMTP alanları denetlenir', () => {
  assert.doesNotThrow(() => validateConfigPatch({
    firebaseProjectId: 'trlive-12345', firebaseApiKey: 'AIzaSyA1234567890abcdefghijklmnopqrstu', firebaseAppId: '1:123456789:android:abcdef123456',
    firebaseSenderId: '123456789', phoneVerifyRequired: true, smtpHost: 'smtp-relay.brevo.com', smtpPort: 587, smtpSecure: false,
    smtpUser: 'u@ornek.com', smtpPass: 'x', smtpFrom: 'TR Live <no-reply@ornek.com>',
  }));
  assert.doesNotThrow(() => validateConfigPatch({ firebaseProjectId: '', smtpHost: '', smtpFrom: '' }), 'boş = kapalı');
  assert.throws(() => validateConfigPatch({ firebaseProjectId: 'Büyük Harf' }));
  assert.throws(() => validateConfigPatch({ firebaseAppId: '1:123:ios:abc' }));
  assert.throws(() => validateConfigPatch({ smtpPort: 70000 }));
  assert.throws(() => validateConfigPatch({ smtpFrom: 'adres-degil' }));
  assert.throws(() => validateConfigPatch({ smtpHost: 'smtp host' }));
});
