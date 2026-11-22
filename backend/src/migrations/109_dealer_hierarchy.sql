-- Ana bayi / Alt bayi.
--
-- Bayi sistemi bugüne kadar DÜZDÜ: her bayi doğrudan yönetimden Coin alıyordu. Ana bayinin
-- kendi altında bayileri olması ve onlara Coin aktarabilmesi isteniyor.
--
-- ## İki kat, daha fazlası değil
--
-- Bir bayinin ebeveyni varsa, o bayi KENDİSİ ebeveyn olamaz. Yani zincir en fazla
-- "ana bayi → alt bayi" derinliğinde. Sebep muhasebe: üç kat olsaydı bir Coin'in hangi
-- bayiden geldiğini bulmak için ağaçta yukarı yürümek gerekirdi ve her satışta komisyon
-- kimin hakkı sorusu belirsizleşirdi. İki kat, bugünkü ihtiyacı karşılıyor ve defteri
-- okunabilir tutuyor. Kural uygulamada (dealers.service.js) zorlanır ve e2e ile sınanır.
--
-- ## Coin nereden geliyor
--
-- Alt bayiye Coin YARATILMAZ: ana bayinin bakiyesinden DÜŞÜLÜP alt bayiye eklenir, tek
-- işlemde. Toplam Coin değişmez. Her aktarım iki tarafın defterine de yazılır
-- (`sub_transfer_out` / `sub_transfer_in`), böylece mutabakat iki yönden de tutar.

ALTER TABLE dealer_accounts
  ADD COLUMN IF NOT EXISTS parent_dealer_id UUID REFERENCES dealer_accounts(id) ON DELETE SET NULL;

-- Kendi kendinin ebeveyni olamaz. (Daha derin döngüleri uygulama katmanı engelliyor:
-- ebeveyn atanırken hedefin ebeveyni olmaması ve adayın çocuğu olmaması aranıyor.)
ALTER TABLE dealer_accounts DROP CONSTRAINT IF EXISTS dealer_not_own_parent;
ALTER TABLE dealer_accounts ADD CONSTRAINT dealer_not_own_parent CHECK (parent_dealer_id IS NULL OR parent_dealer_id <> id);

CREATE INDEX IF NOT EXISTS dealer_accounts_parent ON dealer_accounts(parent_dealer_id) WHERE parent_dealer_id IS NOT NULL;
