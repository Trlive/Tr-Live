-- Özellik bayrakları: hibrit mimarinin geri alma düğmesi.
--
-- Staging kurmama kararı verdiğimiz için (docs/ARCHITECTURE_AUDIT.md I-04) her riskli adımın
-- panelden kapatılabilir olması gerekiyor. app_config bunu "herkes için açık / herkes için kapalı"
-- düzeyinde yapıyordu; bu tablo kademeli açmayı getiriyor: önce %1 kullanıcı, sorun yoksa %10,
-- sonra herkes. Bir şey bozulursa tek düğmeyle sıfıra inilir, yeni APK beklenmez.
--
-- Aynı kullanıcı her istekte aynı sonucu almalı (ekran açılıp kapandıkça özellik gelip gitmemeli):
-- bu yüzden değerlendirme rastgele değil, kullanıcı kimliğinin karmasıyla kovalanır.

CREATE TABLE IF NOT EXISTS feature_flags (
  key             text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{2,48}$'),
  description     text NOT NULL DEFAULT '',
  enabled         boolean NOT NULL DEFAULT false,
  -- 0 = kimse, 100 = herkes. enabled=false ise yüzde dikkate alınmaz.
  rollout_percent smallint NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  -- Yüzdeden bağımsız olarak her zaman açık/kapalı olan kullanıcılar (test hesapları, şikâyetçi kullanıcı).
  allow_user_ids  uuid[] NOT NULL DEFAULT '{}',
  deny_user_ids   uuid[] NOT NULL DEFAULT '{}',
  -- Yalnızca bu sürüm ve üstü için açık (eski APK'da olmayan özellik yanlışlıkla açılmasın).
  min_app_version text NOT NULL DEFAULT '',
  -- 'android', 'ios' ya da boş (hepsi).
  platforms       text[] NOT NULL DEFAULT '{}',
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  updated_by      uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Bayrak değişikliklerinin kaydı: bir özellik ne zaman, kim tarafından, hangi orandan hangi orana
-- alındı. Bir sorun çıktığında "dün gece %10'a çıkarılmış" bilgisi, sorunu aramaktan hızlıdır.
CREATE TABLE IF NOT EXISTS feature_flag_audit (
  id         bigserial PRIMARY KEY,
  key        text NOT NULL,
  admin_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  before     jsonb,
  after      jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS feature_flag_audit_key_idx ON feature_flag_audit(key, id DESC);

-- İlk bayraklar: hibrit yol haritasındaki adımların her biri kendi düğmesiyle gelir.
-- Hepsi kapalı başlar — kod geldiğinde panelden kademeli açılır.
INSERT INTO feature_flags(key, description, enabled, rollout_percent) VALUES
  ('sdui_home',        'Ana ekranın sunucudan gelen düzenle çizilmesi (SDUI)', false, 0),
  ('webview_games',    'Oyunların WebView ile açılması', false, 0),
  ('asset_bundles',    'Görsellerin paket halinde CDN''den indirilmesi', false, 0),
  ('game_sdk_v2',      'Yeni oyun SDK oturum yönetimi', false, 0)
ON CONFLICT (key) DO NOTHING;
