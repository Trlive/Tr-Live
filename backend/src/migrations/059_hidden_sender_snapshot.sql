-- Gizli kullanıcının odada gönderdiği hediye (tüm uygulama şeridi) ve şanslı çanta, gönderim anındaki gizlilikle saklanır:
-- kişi odadan çıkıp gizliliği kapatsa da bu kayıtlar gerçek kimliğini göstermez (oda sohbetindeki gibi).
ALTER TABLE global_gift_events ADD COLUMN IF NOT EXISTS sender_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lucky_bags ADD COLUMN IF NOT EXISTS sender_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE lucky_bags ADD COLUMN IF NOT EXISTS sender_alias VARCHAR(8);
