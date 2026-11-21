-- Moderasyon kuyruğu (denetim S-06).
--
-- Apple ve Google, kullanıcı içeriği barındıran uygulamalarda şikâyet, engelleme ve **etkin
-- moderasyon** istiyor. Bu madde yayın engeli.
--
-- ## Bulduğum asıl boşluk: kanıt saklanmıyordu
--
-- `reports` tablosu şikâyet edilen mesajın **kimliğini** tutuyordu, içeriğini değil. Kullanıcı
-- mesajı silerse (`room_messages.deleted = true`) ya da saklama süresi temizlerse, moderatör
-- ekranında şikâyet duruyor ama **neyin şikâyet edildiği görünmüyor**.
--
-- Bu, moderasyonu imkânsız kılar: göremediğin kanıta göre karar veremezsin. Üstelik kötü niyetli
-- kullanıcı tam da bunu yapar — yaz, şikâyet edilince sil.
--
-- Çözüm: şikâyet anında içeriğin **anlık kopyası** alınır. Mesaj sonradan silinse de moderatör
-- ne olduğunu görür.
--
-- ## Veri koruma dengesi
--
-- Kopya yalnızca şikâyet edilen tek mesajı içerir, sohbetin tamamını değil. Şikâyet kapandıktan
-- sonra saklama temizliği onu da süpürür (aşağıdaki görünüm değil, mevcut temizlik işi).

ALTER TABLE reports
  -- Şikâyet anındaki içerik: {text, authorName, roomName, at}. Mesaj silinse de kalır.
  ADD COLUMN IF NOT EXISTS evidence jsonb,
  -- Moderatörün aldığı aksiyon (dismiss/mute/room_ban/suspend/delete_message). Kapanış notuyla
  -- birlikte, "ne yapıldı" sorusunun cevabı. İtiraz akışının da dayanağı olacak.
  ADD COLUMN IF NOT EXISTS action text;

-- Kuyruk, açık şikâyetleri hedef kullanıcıya göre gruplayıp sıralıyor: bu dizin onun içindir.
CREATE INDEX IF NOT EXISTS reports_open_target_idx
  ON reports(target_user_id, created_at DESC) WHERE status = 'open';

-- Moderatör aksiyonlarının kaydı.
--
-- `financial_audit_logs` finansal işler için; moderasyon ayrı tutuluyor çünkü farklı kişiler
-- bakar (destek ekibi vs. finans) ve farklı saklama süresi gerekir.
CREATE TABLE IF NOT EXISTS moderation_actions (
  id          bigserial PRIMARY KEY,
  moderator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  action      text NOT NULL,
  reason      text NOT NULL DEFAULT '',
  -- Bu aksiyonla kapatılan şikâyet sayısı; kuyruğun ne kadar boşaldığını ölçmek için.
  reports_closed int NOT NULL DEFAULT 0,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_actions_target_idx ON moderation_actions(target_user_id, id DESC);
CREATE INDEX IF NOT EXISTS moderation_actions_recent_idx ON moderation_actions(created_at DESC);
