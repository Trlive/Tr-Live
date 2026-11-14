-- v2.104.0: Duyurulara yapılandırılmış içerik (ör. haftalık etkinlik sonuçları: etkinlik türü, kürsü, kazananlar).
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS meta JSONB;
CREATE INDEX IF NOT EXISTS announcements_meta_week_idx ON announcements ((meta->>'weekStart')) WHERE meta IS NOT NULL;
