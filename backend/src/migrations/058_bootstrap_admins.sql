-- ADMIN_USERNAMES güvenliği: listedeki her ad ilk görüldüğü an ve yönetici yaptığı hesap kaydedilir.
--  * Ad bir hesaba yönetici yetkisi verdikten sonra o hesap silinir / adı değişirse, boşa çıkan adı alan başka biri
--    yönetici olamaz (user_id farklı).
--  * Listeye eklenmiş ama henüz kimsenin almadığı adla SONRADAN açılan hesap da yönetici olmaz (first_listed_at).
CREATE TABLE IF NOT EXISTS bootstrap_admins (
  username TEXT PRIMARY KEY,
  first_listed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ
);
