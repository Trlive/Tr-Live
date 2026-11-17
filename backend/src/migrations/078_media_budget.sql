-- 078: Medya bütçesi. Bazı hediyeler (ör. kral, kraliçe, çift hediyeleri) sınırın dışında tutulabilir:
-- bu hediyelerin dosyası otomatik küçültülmez. Yönetim panelindeki "Medya bütçesi" ekranından seçilir.
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS budget_exempt BOOLEAN NOT NULL DEFAULT FALSE;
-- Küçültülen dosyaların orijinali yedek olarak kalır (geri alınabilir); yedekleri hızlı bulmak için.
CREATE INDEX IF NOT EXISTS idx_media_backup ON media_files((meta->>'supersededBy')) WHERE meta ? 'supersededBy';
