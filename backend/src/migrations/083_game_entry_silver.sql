-- 083: Ludo ve TEK (Uno) oda oyunlarına giriş Gümüş ile. Oyun beklerken çıkan / iptal edilen oyuncuya Gümüşü iade edilir.
ALTER TABLE room_game_players ADD COLUMN IF NOT EXISTS silver_paid BIGINT NOT NULL DEFAULT 0;
-- 082 ile eklenen Ludo/Uno etkinlik satırları gereksiz (oyunlar odanın kendi oyun menüsünde).
DELETE FROM activity_items WHERE title IN ('Ludo','Uno') AND link_url = '';
