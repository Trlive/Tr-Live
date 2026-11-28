-- Sözleşme onay sistemi (yayıncı, ajans sahibi, Coin bayisi). Karar: herkese uygulama içi onay (metni sonuna kadar görüntüleme +
-- onay kutusu + SMS kodu; SMS yapılandırılmamışsa hesap şifresi). Ayrıntı: docs/sozlesmeler/OKU_once.md.
--
-- DEĞİŞTİRİLEMEZLİK VERİTABANINDA uygulanır: yayımlanmış metin ve onay kayıtları güncellenemez ve silinemez (tetikleyiciler).
-- Uygulama kodundaki bir hata ya da yönetim paneli geçmiş bir kaydı değiştiremez; değişiklik = yeni sürüm.
-- Onay kayıtları users tablosuna yabancı anahtarla BAĞLI DEĞİLDİR: kullanıcı satırına ne olursa olsun kayıt yaşar (yasal saklama).

CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('broadcaster', 'agency', 'dealer')),
  version TEXT NOT NULL CHECK (version ~ '^[0-9]{1,3}(\.[0-9]{1,3}){0,2}$'),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 200),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 100 AND 200000),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  published_by UUID,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, version)
);
CREATE INDEX IF NOT EXISTS idx_contract_templates_kind ON contract_templates(kind, published_at DESC);

-- Okunabilir sözleşme numarası: YAY-000001, AJS-000001, BAY-000001 (türe göre ayrı sayaç).
CREATE SEQUENCE IF NOT EXISTS contract_no_broadcaster;
CREATE SEQUENCE IF NOT EXISTS contract_no_agency;
CREATE SEQUENCE IF NOT EXISTS contract_no_dealer;

CREATE TABLE IF NOT EXISTS contract_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_no TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES contract_templates(id),
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  -- Kişiye doldurulmuş, kullanıcıya gösterilen metnin özeti (taraf bilgileri dahil) ve şablonun özeti.
  rendered_sha256 TEXT NOT NULL CHECK (rendered_sha256 ~ '^[0-9a-f]{64}$'),
  template_sha256 TEXT NOT NULL CHECK (template_sha256 ~ '^[0-9a-f]{64}$'),
  party JSONB NOT NULL,                     -- onay anındaki taraf bilgileri (ad, kullanıcı ID, telefon, ajans/bayi kimliği)
  method TEXT NOT NULL CHECK (method IN ('sms', 'password')),
  phone TEXT,                               -- SMS ile doğrulanan numara
  ip TEXT,
  device JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pdf_sha256 TEXT NOT NULL CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contract_acceptances_user ON contract_acceptances(user_id, kind, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_contract_acceptances_template ON contract_acceptances(template_id);

CREATE OR REPLACE FUNCTION contracts_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Sözleşme kayıtları değiştirilemez ve silinemez (%: %).', TG_TABLE_NAME, TG_OP USING ERRCODE = 'P0001';
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_templates_immutable ON contract_templates;
CREATE TRIGGER trg_contract_templates_immutable BEFORE UPDATE OR DELETE ON contract_templates
  FOR EACH ROW EXECUTE FUNCTION contracts_immutable();
DROP TRIGGER IF EXISTS trg_contract_acceptances_immutable ON contract_acceptances;
CREATE TRIGGER trg_contract_acceptances_immutable BEFORE UPDATE OR DELETE ON contract_acceptances
  FOR EACH ROW EXECUTE FUNCTION contracts_immutable();
-- TRUNCATE satır tetikleyicisini atlar: ayrıca engellenir.
DROP TRIGGER IF EXISTS trg_contract_acceptances_no_truncate ON contract_acceptances;
CREATE TRIGGER trg_contract_acceptances_no_truncate BEFORE TRUNCATE ON contract_acceptances
  FOR EACH STATEMENT EXECUTE FUNCTION contracts_immutable();
DROP TRIGGER IF EXISTS trg_contract_templates_no_truncate ON contract_templates;
CREATE TRIGGER trg_contract_templates_no_truncate BEFORE TRUNCATE ON contract_templates
  FOR EACH STATEMENT EXECUTE FUNCTION contracts_immutable();
