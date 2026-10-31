-- v2.68: Mesajlar → konuşmayı sil (yalnızca silen kişide). O ana kadarki mesajlar silen kişiye artık görünmez;
-- karşı taraf konuşmayı görmeye devam eder. Yeni mesaj gelince konuşma yeniden (yalnızca yeni mesajlarla) görünür.
CREATE TABLE IF NOT EXISTS dm_cleared(
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cleared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, peer_id)
);
