-- v2.68: Gizlilik ayarları WIP ayrıcalığına bağlanır (Ayarlar → Gizlilik).
--  * Ülke/Bölgeyi gizle (hideCountry) ve Çevrimiçi saati gizle (hideOnline): WIP 4 ve üzeri
--  * Gizli kullanıcı modu (hiddenUser): WIP 10 ve üzeri (SWIP dahil)
--  * Görüntüleme geçmişini gizle: mevcut "invisibleVisit" ayrıcalığı (WIP 7+), artık kişi açıp kapatabilir.
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_country BOOLEAN NOT NULL DEFAULT FALSE;
-- Varsayılan açık: WIP 7+ üyeler bugüne kadar olduğu gibi iz bırakmadan ziyaret etmeye devam eder.
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_visits BOOLEAN NOT NULL DEFAULT TRUE;

-- Yeni anahtarlar yalnızca yoksa eklenir (yönetimin panelden yaptığı değişiklikler korunur).
UPDATE wip_tiers SET features = jsonb_build_object('hideCountry', level >= 4, 'hideOnline', level >= 4, 'hiddenUser', level >= 10) || features;
