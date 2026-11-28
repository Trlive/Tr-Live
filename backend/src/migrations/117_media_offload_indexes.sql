-- Medya taşıma işinin saatlik taramaları büyük tabloda tam tarama yapmasın (rapor O-03).
-- Taşınacaklar: storage_key boş, data dolu (created_at sırasıyla). Silinecek kopyalar: taşınmış, kopyası hâlâ duran (offloaded_at sırasıyla).
CREATE INDEX IF NOT EXISTS idx_media_offload_pending ON media_files(created_at) WHERE storage_key IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_drop_candidates ON media_files(offloaded_at) WHERE storage_key IS NOT NULL AND db_copy_dropped = false;
