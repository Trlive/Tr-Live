-- Oda müziğinin ses düzeyi: müziği çalan kişi (DJ) ayarlar, odadaki herkesin cihazında bu düzeyde çalar.
ALTER TABLE room_music ADD COLUMN IF NOT EXISTS volume REAL NOT NULL DEFAULT 1.0;
