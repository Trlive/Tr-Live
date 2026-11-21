-- F-01: Coin bahsi oyun sayfasından kaldırıldı (kazancı istemci bildiriyordu).
-- Sonuç artık yalnızca sunucuda üretilir: oyun paketi ya da imzalı sağlayıcı API'si.
-- Geçmiş turlar (activity_rounds) denetim için saklanır; yeni kayıt oluşmaz.
ALTER TABLE activity_items
  DROP COLUMN IF EXISTS coin_play,
  DROP COLUMN IF EXISTS min_bet,
  DROP COLUMN IF EXISTS max_bet,
  DROP COLUMN IF EXISTS max_multiplier;

COMMENT ON TABLE activity_rounds IS 'Kapatılan istemci-çarpanlı oyun yolunun geçmişi (v2.131.0). Salt okunur.';
