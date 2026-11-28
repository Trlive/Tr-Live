-- Ay içi maaş (avans) kuralı artık VARSAYILAN AÇIK (sahibinin kararı: panelden elle açmaya gerek yok).
-- Panelde yalnızca tek bir acil durdurma kutusu kalır (instant_salary_enabled). Oran (instant_salary_bps, %50) panelden kaldırıldı; sabit 5000.
ALTER TABLE agency_settings ALTER COLUMN instant_salary_enabled SET DEFAULT TRUE;
UPDATE agency_settings SET instant_salary_enabled = TRUE;
