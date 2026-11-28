-- R2'ye taşınmış bir medya satırı silindiğinde depodaki NESNE de silinmeli (rapor O-03). Eskiden `deleteObject` hiçbir yerden çağrılmıyordu:
-- hesap silinse, avatar değişse ya da medya yedeği temizlense de R2'deki dosya (ve herkese açık CDN adresi) kalıyordu.
--
-- Çözüm: satır silinince tetikleyici anahtarı AYNI İŞLEMDE kuyruğa yazar (silme noktası ne olursa olsun, bugünküler ve gelecektekiler dahil);
-- arka plan işi kuyruğu boşaltır. R2 o an erişilemezse anahtar kuyrukta kalır ve sonra denenir: nesne sahipsiz kalmaz.
CREATE TABLE IF NOT EXISTS media_delete_queue(
  storage_key TEXT PRIMARY KEY,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_delete_queue_order ON media_delete_queue(attempts, queued_at);

CREATE OR REPLACE FUNCTION media_files_enqueue_delete() RETURNS trigger AS $$
BEGIN
  IF OLD.storage_key IS NOT NULL THEN
    INSERT INTO media_delete_queue(storage_key) VALUES (OLD.storage_key) ON CONFLICT DO NOTHING;
  END IF;
  RETURN OLD;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_files_enqueue_delete ON media_files;
CREATE TRIGGER trg_media_files_enqueue_delete AFTER DELETE ON media_files
  FOR EACH ROW EXECUTE FUNCTION media_files_enqueue_delete();
