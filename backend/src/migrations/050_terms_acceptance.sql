-- v2.69: Kullanıcı Sözleşmesi / Gizlilik Politikası onayı (sürüm ve zaman) kayıt altına alınır.
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
