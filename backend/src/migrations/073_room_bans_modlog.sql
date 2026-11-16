-- v2.106.0: Odadan atılan kişi 24 saat aynı odaya giremez; oda sahibi için yönetici kayıtları (kim kimi attı / engelledi /
-- susturdu) ve yasağı kaldırma. Oda her açılışta yeni kimlik aldığı için yasak ve kayıtlar oda kimliğine değil kalıcı
-- odaya (sahip + oda türü) bağlıdır: oda kapatılıp yeniden açılınca da sürer.
CREATE TABLE IF NOT EXISTS room_bans (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_type VARCHAR(20) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL CHECK (kind IN ('kick', 'block')),   -- kick: 24 saat · block: süresiz
  banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  until TIMESTAMPTZ,                                             -- NULL = süresiz
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (owner_id, room_type, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_bans_user ON room_bans(user_id);

CREATE TABLE IF NOT EXISTS room_mod_logs (
  id BIGSERIAL PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_type VARCHAR(20) NOT NULL,
  room_id UUID,                                                  -- işlemin yapıldığı açılış (bilgi amaçlı)
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(20) NOT NULL,                                   -- kick, block, unban, mute, unmute, mic_off, role
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_room_mod_logs_owner ON room_mod_logs(owner_id, room_type, id DESC);

-- Açık odalardaki mevcut engeller (oda kimliğine bağlıydı, oda yeniden açılınca kayboluyordu) kalıcı kayda taşınır.
INSERT INTO room_bans(owner_id, room_type, user_id, kind, banned_by, until)
SELECT r.owner_id, r.room_type, b.blocked_user_id, 'block', b.blocked_by_user_id, NULL::timestamptz
FROM room_blocks b JOIN rooms r ON r.id = b.room_id
WHERE r.is_active = TRUE AND b.blocked_user_id <> r.owner_id
ON CONFLICT (owner_id, room_type, user_id) DO NOTHING;
