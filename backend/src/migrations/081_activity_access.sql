-- 081: Oda etkinliklerini görebilecek kişiler (yönetici izni). İzin yoksa etkinlikler hiç görünmez / açılmaz.
CREATE TABLE IF NOT EXISTS activity_access (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
