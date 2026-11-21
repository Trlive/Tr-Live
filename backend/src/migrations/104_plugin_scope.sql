-- Oyun paketi yetki daraltma (denetim O-01 adım 2).
--
-- Paketlere ham `query`/`tx` veriliyordu: veritabanının tamamına erişim. Artık her paketin
-- SAHİP OLDUĞU tablolar kayıtlı ve çalışma anındaki SQL'i bununla sınırlanıyor.

-- Paketin kurulum SQL'inde oluşturduğu tablolar. Çalışma anındaki izin listesi budur.
ALTER TABLE game_plugins ADD COLUMN IF NOT EXISTS tables TEXT[] NOT NULL DEFAULT '{}';

-- Güvenilen paket = bizim yazdığımız, ham veritabanı erişimi verilen paket.
-- YENİ yüklemeler varsayılan olarak GÜVENİLMEZ (dar API). Hâlihazırda kurulu olanlar
-- bu göçte güvenilir sayılıyor, yoksa çalışan bir oyun bu sürümle birlikte kırılırdı;
-- bir sonraki yüklemelerinde kendi tablolarını kaydedip dar API'ye geçerler.
ALTER TABLE game_plugins ADD COLUMN IF NOT EXISTS trusted BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE game_plugins SET trusted = TRUE WHERE tables = '{}';

-- game_kv ortak bir anahtar alanıydı: her paket diğerinin anahtarını okuyup yazabiliyordu.
-- Anahtarlar paket başına ayrılıyor. Mevcut satırlar 'legacy' altında toplanır; hiçbir
-- paket artık başka bir paketin anahtarını göremez.
ALTER TABLE game_kv ADD COLUMN IF NOT EXISTS plugin_id TEXT NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  -- Birincil anahtar (key) → (plugin_id, key). Aynı anahtar adı farklı paketlerde durabilsin.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_kv_pkey') THEN
    ALTER TABLE game_kv DROP CONSTRAINT game_kv_pkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_kv_scope_pkey') THEN
    ALTER TABLE game_kv ADD CONSTRAINT game_kv_scope_pkey PRIMARY KEY (plugin_id, key);
  END IF;
END $$;
