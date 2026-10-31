-- v2.73: Sesli oda içi PK (Yoho): koltuklar Kırmızı / Mavi takıma ayrılır, takımdaki koltuklara gelen hediyeler puan olur.
-- mode: 'neutral' = oda sahibi (koltuk 1) hakem, puanı sayılmaz; 'partisan' = oda sahibi owner_team takımında.
CREATE TABLE IF NOT EXISTS room_pk(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  started_by UUID NOT NULL REFERENCES users(id),
  mode VARCHAR(10) NOT NULL CHECK (mode IN ('neutral','partisan')),
  owner_team VARCHAR(4) CHECK (owner_team IN ('red','blue')),
  status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','cancelled')),
  seat_count INT NOT NULL,
  duration_seconds INT NOT NULL CHECK (duration_seconds BETWEEN 60 AND 3600),
  score_red BIGINT NOT NULL DEFAULT 0 CHECK (score_red >= 0),
  score_blue BIGINT NOT NULL DEFAULT 0 CHECK (score_blue >= 0),
  winner VARCHAR(5) CHECK (winner IN ('red','blue','draw')),
  mvp_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pk_active ON room_pk(room_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_room_pk_room ON room_pk(room_id, started_at DESC);

-- Destekçiler (hediye gönderenler, harcanan Coin) ve puan alanlar (koltuktaki alıcılar, alınan Elmas) takım başına.
CREATE TABLE IF NOT EXISTS room_pk_points(
  pk_id UUID NOT NULL REFERENCES room_pk(id) ON DELETE CASCADE,
  kind VARCHAR(8) NOT NULL CHECK (kind IN ('support','receive')),
  team VARCHAR(4) NOT NULL CHECK (team IN ('red','blue')),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (pk_id, kind, team, user_id)
);
