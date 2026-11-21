-- Basım bütçesi kayıtlarının sadeleştirilmesi.
--
-- Bir test/telafi/pazarlama basımı üç yere birden yazılıyordu:
--   1. coin_issuances          (bütçe sayacı)
--   2. wallet_transactions     (defter)
--   3. financial_audit_logs    (yönetici işlem günlüğü)
--
-- 1 ve 3 kaldırıldı. `coin_issuances`, `wallet_transactions`'ın birebir kopyasıydı: ikisi de aynı
-- transaction içinde, aynı tutarla, aynı bütçe anahtarıyla yazılıyordu. Aylık kullanım artık
-- doğrudan defterden hesaplanıyor — tek kayıt, aynı sonuç.
--
-- Bu yüzden tablo düşürülürken veri KAYBOLMUYOR: her satırın karşılığı defterde duruyor.
--
-- ## Defter satırı niçin duruyor
--
-- İki şey ona bağlı:
--
-- * **Aylık bütçe sınırı.** "Bu ay bu bütçeden ne kadar basıldı" sorusunun cevabı odur. Satır
--   olmazsa 10.000.000'luk test sınırı denetlenemez — sınırsız basım olur.
-- * **Günlük mutabakat alarmı.** Mutabakat, `users.coins` toplamıyla defter toplamını
--   karşılaştırır. Kayıtsız bir bakiye artışı, her gün büyüyen kalıcı bir açık üretir. Alarm
--   sürekli yanlış öterse kimse bakmaz; gerçek bir açık (hata ya da hırsızlık) olduğunda da
--   fark edilmez.
--
-- Satır duruyor ama **hiçbir insanın baktığı yerde görünmüyor**: kullanıcının hareket listesinde
-- de, panelin hareket listelerinde de süzülüyor.

DROP TABLE IF EXISTS coin_issuances;

-- Aylık kullanım sorgusu defterden okunuyor: bütçe türü + tarih üzerinden kısmi dizin.
CREATE INDEX IF NOT EXISTS wallet_tx_budget_idx
  ON wallet_transactions(transaction_type, created_at)
  WHERE transaction_type IN ('system_test', 'event_reward', 'vip_compensation', 'marketing');
