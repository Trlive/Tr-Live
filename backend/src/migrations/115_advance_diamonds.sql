-- Ay içi maaş ödemesi (avans) yapılırken kota kadar elmas, Fasulyeye çevrilir (bakiyeden düşülür). Bu sütun, dönem içinde avansla
-- düşülen elmasın toplamını izler: değerlendirme bakiyeye bunu geri ekler ("elmas bozdurmama" şartı bozulmasın) ve dönem kapanışı
-- aynı elması ikinci kez düşmez.
-- NOT: salary_advances.locked_cents (migration 114) artık KULLANILMAZ (avans kilidi sahibinin kararıyla kaldırıldı); sütun zararsız, 0 kalır.
ALTER TABLE salary_advances ADD COLUMN IF NOT EXISTS diamonds_consumed BIGINT NOT NULL DEFAULT 0 CHECK (diamonds_consumed >= 0);
