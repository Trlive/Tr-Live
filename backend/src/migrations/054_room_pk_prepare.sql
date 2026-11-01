-- v2.75: Oda içi PK modu. PK modu açılınca tur 'preparing' (Hazırlanıyor) durumunda bekler; "Başla" ile 'active' olur,
-- bitince aynı ayarlarla yeni bir 'preparing' tur açılır (mod, kapatılana kadar sürer).
ALTER TABLE room_pk DROP CONSTRAINT IF EXISTS room_pk_status_check;
ALTER TABLE room_pk ADD CONSTRAINT room_pk_status_check CHECK (status IN ('preparing','active','finished','cancelled'));
ALTER TABLE room_pk ALTER COLUMN ends_at DROP NOT NULL;
DROP INDEX IF EXISTS uq_room_pk_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pk_open ON room_pk(room_id) WHERE status IN ('preparing','active');
