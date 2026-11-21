-- SDUI: sunucudan gelen ekran düzeni.
--
-- Mimari ilkemiz: "minimum yerel kod, maksimum dinamik içerik; ancak ses, görüntü, kimlik
-- doğrulama, güvenlik ve finansal işlemler native/backend katmanlarında kalır."
--
-- Bu tablo o ilkenin "dinamik içerik" tarafı: sekmelerin sırası, görünürlüğü, bölümler ve giriş
-- kartları sunucudan gelir. Oda ekranı (ses/görüntü), cüzdan işlemleri ve giriş akışı SDUI'ye
-- AÇILMAZ — onlar native kalır.
--
-- ## Niçin iki tablo
--
-- `sdui_layouts` yürürlükteki düzeni tutar. `sdui_layout_history` her kaydedilen sürümü saklar:
-- yanlış bir düzen yayınlandığında tek tıkla eski sürüme dönülür. Geri dönüş yolu olmayan bir
-- uzaktan arayüz sistemi, uygulamayı kullanılamaz hale getirme yetkisini sunucuya vermek demektir.

CREATE TABLE IF NOT EXISTS sdui_layouts (
  screen     text PRIMARY KEY CHECK (screen ~ '^[a-z][a-z0-9_]{1,30}$'),
  -- Düzenin içerik özeti. Uygulama ETag olarak kullanır: değişmediyse gövde hiç inmez.
  version    text NOT NULL,
  payload    jsonb NOT NULL,
  -- Kapalıyken uygulama kendi yerleşik düzenini çizer (fallback). Yeni APK gerekmez.
  enabled    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sdui_layout_history (
  id         bigserial PRIMARY KEY,
  screen     text NOT NULL,
  version    text NOT NULL,
  payload    jsonb NOT NULL,
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT NOW(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS sdui_history_screen_idx ON sdui_layout_history(screen, id DESC);

-- Ana ekran kaydı kapalı olarak oluşturulur: panelden düzenlenip açılana kadar uygulama
-- bugünkü yerleşik sekmelerini çizmeye devam eder.
INSERT INTO sdui_layouts(screen, version, payload, enabled)
VALUES ('home', 'bos', '{"tabs":[],"sections":[]}'::jsonb, false)
ON CONFLICT (screen) DO NOTHING;
