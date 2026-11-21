-- Medyanın R2'ye taşınması.
--
-- Bugün her görsel `media_files.data` içinde bayt olarak duruyor ve her görüntüleme bir veritabanı
-- okuması. Bu alanlar dosyanın nesne deposundaki karşılığını ve bütünlük damgasını tutar.
--
-- Taşıma GERİ ALINABİLİR olacak şekilde tasarlandı: `data` sütunu hemen boşaltılmaz. Önce dosya
-- R2'ye kopyalanır, oradan okunup boyutu doğrulanır, `storage_key` dolar ve adres yönlendirmeye
-- başlar. Veritabanı kopyası ayrı ve bilinçli bir adımda silinir. Böylece R2'de bir sorun çıkarsa
-- `storage_key` temizlenip eski davranışa dönülür — dosya kaybı olmaz.

ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS storage_key text,
  ADD COLUMN IF NOT EXISTS sha256      text,
  ADD COLUMN IF NOT EXISTS offloaded_at timestamptz,
  -- Veritabanı kopyası silindi mi (data artık boş). Ayrı sütun: "taşındı" ile "veritabanından
  -- silindi" farklı durumlar, ikisini tek alanda tutmak geri dönüşü imkânsızlaştırırdı.
  ADD COLUMN IF NOT EXISTS db_copy_dropped boolean NOT NULL DEFAULT false;

-- Taşınmayı bekleyenler sırayla alınır; taşınmışlar sorguya hiç girmez.
CREATE INDEX IF NOT EXISTS media_files_pending_offload_idx
  ON media_files(created_at) WHERE storage_key IS NULL;
