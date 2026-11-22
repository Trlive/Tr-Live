-- Ağırlıklı maaş hak edişi + ay başı otomatik dolar aktarımı.
--
-- Sahibinin tasarımı:
--   · Yayıncının bir TEMEL MAAŞI var (sözleşme kademesi).
--   · Ay içinde tamamladığı koşullar bu maaşın yüzde kaçını hak ettiğini belirler:
--       hak edilen = temel maaş × Σ(koşul ağırlığı × gerçekleşme oranı)
--     "gün ve yayın saati eksikse kotanın yarısı, tüm koşullar sağlanınca hepsi."
--   · Kota dolunca maaş Fasulye olarak hak edilir. TALEP OLUŞTURMAYA GEREK YOK.
--   · Tamamlanan ayı izleyen ay başı 1–3 arası dolar hesabına OTOMATİK aktarılır.
--   · Kimlik fotoğrafı istenmez.
--
-- Fasulye ile dolar aynı bakiyedir (1 Fasulye = 1 dolar = 100 sent), bu sürümde bu
-- değişmiyor (sahibinin kararı). "Fasulye" = hak edilmiş ama henüz aktarılmamış maaş;
-- aktarım gerçekleştiğinde çekilebilir dolar bakiyesine geçiyor.
--
-- ## Hiçbir şey hemen farklı ödemiyor
--
-- Aşağıdaki sütunlar ve ayarlar EKLENİYOR; eski hesap çalışmaya devam ediyor. Yeni hesap
-- her dönem kapanışında yanında hesaplanıp yazılıyor, böylece sahibi iki sayıyı GERÇEK veri
-- üzerinde karşılaştırabiliyor. Hangisinin ödediğine `salary_weighted_enabled` karar
-- veriyor ve KAPALI başlıyor. Para davranışını bayraksız değiştirmek, yanlışı geri
-- alınamaz hale getirirdi.

-- ---------------------------------------------------------------------------
-- Ayarlar
-- ---------------------------------------------------------------------------

ALTER TABLE agency_settings
  -- Koşul ağırlıkları (on binde; toplamı 10000 olmak ZORUNDA, uygulama katmanı denetliyor).
  -- Varsayılan: gün 2500 + saat 2500 + elmas 3000 + görev 2000.
  -- gün + saat = 5000 olduğu için "gün ve saat eksikse yarısı" tasarımdaki gibi çıkıyor.
  ADD COLUMN IF NOT EXISTS salary_weights JSONB NOT NULL DEFAULT
    '{"days":2500,"hours":2500,"diamonds":3000,"tasks":2000}'::jsonb,
  -- Ağırlıklı hesap ÖDEMEYE esas olsun mu. Kapalıyken yalnızca hesaplanıp gösterilir.
  ADD COLUMN IF NOT EXISTS salary_weighted_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Ay başı 1–3 arası otomatik dolar aktarımı açık mı.
  ADD COLUMN IF NOT EXISTS salary_auto_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  -- Aktarımın yapılabileceği ayın günleri (1–3). Dışında çalışmaz.
  ADD COLUMN IF NOT EXISTS salary_transfer_day_from INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS salary_transfer_day_to INT NOT NULL DEFAULT 3;

ALTER TABLE agency_settings DROP CONSTRAINT IF EXISTS agency_settings_transfer_days;
ALTER TABLE agency_settings ADD CONSTRAINT agency_settings_transfer_days
  CHECK (salary_transfer_day_from BETWEEN 1 AND 28
     AND salary_transfer_day_to BETWEEN 1 AND 28
     AND salary_transfer_day_from <= salary_transfer_day_to);

-- ---------------------------------------------------------------------------
-- Özet satırına yeni alanlar
-- ---------------------------------------------------------------------------
--
-- Hepsi NULL kabul ediyor ve bu BİLEREK: eski dönemlerde ağırlıklı hesap hiç yapılmadı.
-- NULL "hesaplanmadı" demek; 0 yazsaydık "hak edilmedi" ile karışır ve geçmiş özetler
-- yanlış okunurdu.

ALTER TABLE host_statements
  -- Hesabın dayandığı sözleşme kademesi ve o kademenin temel maaşı. Dönem kapanırken
  -- DONDURULUYOR: yayıncının kademesi sonra değişse bile geçmiş özet aynı kalmalı.
  ADD COLUMN IF NOT EXISTS contract_tier INT,
  ADD COLUMN IF NOT EXISTS base_tier_cents BIGINT,
  -- Koşulların o dönemdeki hedefleri. Kademe tablosu sonra değiştirilse bile geçmiş
  -- özetteki "22 günün 20'si" ifadesi anlamını korusun diye saklanıyor.
  ADD COLUMN IF NOT EXISTS required_days INT,
  ADD COLUMN IF NOT EXISTS required_seconds BIGINT,
  ADD COLUMN IF NOT EXISTS required_diamonds BIGINT,
  ADD COLUMN IF NOT EXISTS diamond_target_ok BOOLEAN,
  -- Hak edilen yüzde (on binde) ve bunun karşılığı Fasulye/sent.
  ADD COLUMN IF NOT EXISTS earned_bps INT,
  ADD COLUMN IF NOT EXISTS weighted_cents BIGINT,
  -- Koşul kırılımı: hangi koşul ne ağırlıktaydı, ne oranda gerçekleşti, kaç puan kattı.
  -- Yayıncı ekranında "neden bu kadar" sorusunun yanıtı ve denetim kaydı.
  ADD COLUMN IF NOT EXISTS weight_parts JSONB,
  -- Ödemeye hangi hesap esas alındı: 'tier' (eski basamak) ya da 'weighted' (ağırlıklı).
  ADD COLUMN IF NOT EXISTS salary_basis VARCHAR(10);

ALTER TABLE host_statements DROP CONSTRAINT IF EXISTS host_statements_earned_bps;
ALTER TABLE host_statements ADD CONSTRAINT host_statements_earned_bps
  CHECK (earned_bps IS NULL OR earned_bps BETWEEN 0 AND 10000);

ALTER TABLE host_statements DROP CONSTRAINT IF EXISTS host_statements_basis;
ALTER TABLE host_statements ADD CONSTRAINT host_statements_basis
  CHECK (salary_basis IS NULL OR salary_basis IN ('tier', 'weighted'));

-- ---------------------------------------------------------------------------
-- Otomatik aktarımın BİR KERE çalışmasının güvencesi
-- ---------------------------------------------------------------------------
--
-- Sahibinin en net şartı: "1–3 aktarımı bir kere çalışmalı; sistem yeniden başlasa ya da
-- işlem tekrarlansa bile yayıncıya iki defa dolar yazılmamalı."
--
-- Bunu koda bakarak garanti etmek mümkün değil: sunucu iki örnekte çalışabilir, işlem
-- yarıda kesilebilir, zamanlanmış iş iki kez tetiklenebilir. Güvence VERİTABANINDA olmalı.
--
-- Yöntem: aktarım, önce bu tabloya satır EKLEMEYİ dener. `period_key` tekil (PRIMARY KEY)
-- olduğu için ikinci deneme çakışır ve aktarım hiç başlamaz. Satır, aktarımla AYNI
-- transaction içinde eklenir; aktarım geri alınırsa satır da geri alınır (yani yarım kalan
-- bir çalışma kilidi sonsuza kadar tutmaz, tekrar denenebilir).
--
-- İkinci kat güvence: host_statements.status = 'pending' koşulu. Aktarım yalnızca bekleyen
-- satırları ödeyip 'paid' yapıyor, yani aynı satır ikinci kez ödenemez.
CREATE TABLE IF NOT EXISTS salary_transfer_runs (
  period_key    VARCHAR(16) PRIMARY KEY,
  period_id     UUID NOT NULL REFERENCES payout_periods(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  -- Elle mi tetiklendi, zamanlanmış iş mi. Denetimde "bunu kim başlattı" sorusu için.
  started_by    UUID REFERENCES users(id),
  trigger       VARCHAR(10) NOT NULL DEFAULT 'auto' CHECK (trigger IN ('auto', 'manual')),
  paid_count    INT NOT NULL DEFAULT 0,
  paid_cents    BIGINT NOT NULL DEFAULT 0,
  -- Telefonu doğrulanmadığı için atlananlar: para kaybolmuyor, özet 'pending' kalıyor ve
  -- sonraki çalışmada ödeniyor. Kaç kişi atlandı, panelde görünsün.
  skipped_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS salary_transfer_runs_period ON salary_transfer_runs(period_id);
