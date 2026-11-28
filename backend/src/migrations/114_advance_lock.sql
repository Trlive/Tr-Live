-- Avans olarak yatan Fasulye, maaş TAM yatana kadar yalnızca Coin'e çevrilebilir; dolar olarak gönderilemez/çekilemez (sahibinin kararı).
-- locked_cents: bu avansın hâlâ kilitli kalan kısmı. Avans yatarken cents'e eşitlenir; Coin'e çevrildikçe en eskiden düşer;
-- dönemin maaşı tam yatınca (özet 'paid' ya da kalan 0) sıfırlanır. Kullanıcının kilitli toplamı = SUM(locked_cents).
-- Bu migration'dan ÖNCE yatmış avanslar kilitsiz kalır (varsayılan 0).
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS locked_cents BIGINT NOT NULL DEFAULT 0 CHECK (locked_cents >= 0);
CREATE INDEX IF NOT EXISTS idx_salary_advances_locked ON salary_advances(user_id) WHERE locked_cents > 0;
