// Şifre kuralları (bağımlılık yok, test edilebilir). auth.js bunu yeniden dışa aktarır.
import { fail } from '../../shared/errors/http.js';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX_BYTES = 72; // bcrypt 72 bayttan sonrasını yok sayar

// En sık kullanılan şifreler (en az 8 karakterlik olanlar; daha kısaları zaten uzunluk kuralına takılır).
// Gerçek bir sızıntı listesi yerine küçük, bilinen bir çekirdek: "12345678" gibi şifrelerin kayıtta geçmesini önler.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '87654321', '987654321', '11111111', '00000000', '12341234', '123123123',
  '1q2w3e4r', '1qaz2wsx', 'q1w2e3r4', '1234qwer', 'qwer1234', 'qwerty123', 'qwertyui', 'qwertyuiop', 'asdfghjk',
  'asdfghjkl', 'zxcvbnm1', 'abcd1234', 'abc12345', 'password', 'password1', 'password12', 'password123', 'passw0rd',
  'p@ssw0rd', 'iloveyou', 'admin123', 'welcome1', 'letmein1', 'test1234', 'trlive123', 'trlive1234', 'turkiye1',
  'turkiye123', 'merhaba123', 'galatasaray', 'fenerbahce', 'besiktas1', 'trabzonspor',
]);

/**
 * Geçersizse fail() fırlatır. options.username verilirse şifre kullanıcı adıyla aynı olamaz.
 * Yalnızca uzunluk ve bariz kötü seçimleri denetler; karmaşıklık zorlaması (büyük harf, sembol) bilerek yoktur.
 */
export function passwordRules(password, { username } = {}) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw fail(`Şifre en az ${PASSWORD_MIN} karakter olmalı.`);
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) throw fail('Şifre en fazla 72 bayt olabilir.');
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/u.test(password)) throw fail('Bu şifre çok yaygın. Daha zor tahmin edilen bir şifre seçin.');
  if (username && lower === String(username).toLowerCase()) throw fail('Şifre kullanıcı adıyla aynı olamaz.');
}
