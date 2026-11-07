-- Gizli kullanıcı kimliği (Yoho "gizemli kişi" gibi): gizli mod her açılışta kişiye 6 haneli yeni bir gizli ID verilir.
-- Odalarda ve listelerde gerçek ID yerine bu görünür; gizli mod kapanınca kullanılmaz, yeniden açılınca yenisi verilir.
ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden_alias VARCHAR(8);
UPDATE users SET hidden_alias = (100000 + floor(random() * 900000))::int::text WHERE is_hidden = TRUE AND hidden_alias IS NULL;
-- Oda sohbeti: mesaj gönderilirken kişi gizli miydi ve gizli ID'si neydi (sonradan gizlilik kapansa da eski mesajlar
-- gerçek kimliği göstermesin).
ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS sender_hidden BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE room_messages ADD COLUMN IF NOT EXISTS sender_alias VARCHAR(8);
