-- Sözleşme kabulü sadeleşti (sahibin kararı): rakiplerdeki gibi işlemle birlikte kabul. Yayıncı sözleşmesi ajans davetini kabul ederken,
-- ajans ve bayi sözleşmesi panel ilk açılırken tek dokunuşla kabul edilir. SMS ve PDF yok. Kayıt (kim, hangi sürüm, ne zaman, hangi
-- işlemle, gösterilen metnin özeti, IP, cihaz) değiştirilemez olarak kalır (119'daki tetikleyiciler geçerli).
ALTER TABLE contract_acceptances DROP CONSTRAINT IF EXISTS contract_acceptances_method_check;
ALTER TABLE contract_acceptances ADD CONSTRAINT contract_acceptances_method_check CHECK (method IN ('sms', 'password', 'clickwrap'));
ALTER TABLE contract_acceptances ALTER COLUMN pdf DROP NOT NULL;
ALTER TABLE contract_acceptances ALTER COLUMN pdf_sha256 DROP NOT NULL;
-- Kabulün yapıldığı işlem: 'panel' (sözleşme ekranı), 'agency_invite' (ajans davetini kabul), 'self_join' (ajans sahibi kendini ekledi).
ALTER TABLE contract_acceptances ADD COLUMN IF NOT EXISTS via TEXT;
