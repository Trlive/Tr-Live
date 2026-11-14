-- v2.103.1: Sohbet temizleme anı. Temizlemeden önce yazılıp temizleme sırasında henüz kaydı bitmemiş (uçan yazı işlemi)
-- mesajlar da geri gelmesin: liste bu andan sonrakileri gösterir.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS chat_cleared_at TIMESTAMPTZ;
