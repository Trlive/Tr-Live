-- 079: Sayı tahtası oturumları (Yoho gibi): başlat (süreli / elle), sıfırlama kuralları, durdur, sonuç sıralaması, geçmiş.
CREATE TABLE IF NOT EXISTS room_scoreboard_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,                       -- NULL: elle kontrollü
  reset_on_seat_leave BOOLEAN NOT NULL DEFAULT TRUE,
  reset_on_room_leave BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES users(id) ON DELETE SET NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb
);
-- Odada aynı anda tek açık oturum.
CREATE UNIQUE INDEX IF NOT EXISTS uq_scoreboard_active ON room_scoreboard_sessions(room_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_scoreboard_room_time ON room_scoreboard_sessions(room_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_scoreboard_due ON room_scoreboard_sessions(ends_at) WHERE status = 'active' AND ends_at IS NOT NULL;

-- Sıfırlama kuralları veritabanında uygulanır (koltuktan inme / atılma / odadan çıkma / oda kapanması — hangi yoldan
-- olursa olsun): kişinin o oturumdaki puanı silinir.
CREATE OR REPLACE FUNCTION scoreboard_reset_on_leave() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM room_scoreboard_sessions s WHERE s.room_id = OLD.room_id AND s.status = 'active'
               AND (s.reset_on_room_leave OR (s.reset_on_seat_leave AND OLD.seat_index IS NOT NULL))) THEN
      DELETE FROM room_gift_totals WHERE room_id = OLD.room_id AND user_id = OLD.user_id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.seat_index IS NOT NULL AND NEW.seat_index IS NULL AND EXISTS (
       SELECT 1 FROM room_scoreboard_sessions s WHERE s.room_id = NEW.room_id AND s.status = 'active' AND s.reset_on_seat_leave) THEN
    DELETE FROM room_gift_totals WHERE room_id = NEW.room_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scoreboard_reset_upd ON room_members;
CREATE TRIGGER trg_scoreboard_reset_upd AFTER UPDATE OF seat_index ON room_members
  FOR EACH ROW EXECUTE FUNCTION scoreboard_reset_on_leave();
DROP TRIGGER IF EXISTS trg_scoreboard_reset_del ON room_members;
CREATE TRIGGER trg_scoreboard_reset_del AFTER DELETE ON room_members
  FOR EACH ROW EXECUTE FUNCTION scoreboard_reset_on_leave();
