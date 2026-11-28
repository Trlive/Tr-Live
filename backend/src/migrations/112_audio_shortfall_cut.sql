-- Sesli odada elmas kotası tutan ama gün/saat şartı eksik kalan yayıncı artık maaşından kesintiyle ödenir (sahibinin kararı).
-- Değer baz puandır: 4000 = %40 kesinti (maaşın %60'ı ödenir), 0 = kesintili ödeme yok (eski davranış: seviye sayılmaz).
-- Görüntülü odanın video_shortfall_cut_bps ayarından bağımsızdır.
ALTER TABLE agency_settings
  ADD COLUMN IF NOT EXISTS audio_shortfall_cut_bps INT NOT NULL DEFAULT 4000 CHECK (audio_shortfall_cut_bps BETWEEN 0 AND 10000);
