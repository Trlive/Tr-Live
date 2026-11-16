-- Oda oyunları: TEK kart oyunu (2–9 oyuncu). Tablo yapısı Ludo ile ortaktır; yalnızca izin verilen oyun türü ve koltuk
-- aralığı genişler. Oyun durumu (eller dahil) room_games.state içinde durur; eller yalnızca sahibine gönderilir.
-- Kısıtın adı kurulumdan kuruluma değişebileceği için ilgili sütuna bağlı tüm CHECK kısıtları bulunup kaldırılır.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'room_games'::regclass AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ILIKE '%game_type%'
  LOOP
    EXECUTE format('ALTER TABLE room_games DROP CONSTRAINT %I', c.conname);
  END LOOP;
  FOR c IN
    SELECT con.conname FROM pg_constraint con
    WHERE con.conrelid = 'room_game_players'::regclass AND con.contype = 'c' AND pg_get_constraintdef(con.oid) ILIKE '%seat%'
  LOOP
    EXECUTE format('ALTER TABLE room_game_players DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE room_games ADD CONSTRAINT room_games_game_type_check CHECK (game_type IN ('ludo', 'tek'));
ALTER TABLE room_game_players ADD CONSTRAINT room_game_players_seat_check CHECK (seat BETWEEN 0 AND 8);

-- Süresi dolan sıraları bulan zamanlayıcı sorgusu için (yalnızca oynanan oyunlar).
CREATE INDEX IF NOT EXISTS idx_room_games_playing ON room_games(id) WHERE status = 'playing';
