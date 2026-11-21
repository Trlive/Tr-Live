-- Oda üye listesinin sıralama dizini.
--
-- `/api/rooms/:id/members` sorgusu `WHERE room_id = $1 ORDER BY seat_index NULLS LAST, joined_at`
-- şeklinde. Birincil anahtar (room_id, user_id) filtreyi karşılıyor ama **sıralamayı
-- karşılamıyor**: PostgreSQL eşleşen bütün satırları okuyup belleğe alıp sıralıyor, ancak ondan
-- sonra LIMIT uyguluyor.
--
-- Yani 2.000 dinleyicili bir odada, 300 satır isteseniz bile 2.000 satır okunup sıralanıyor.
-- Bu dizin sıralamayı dizinden karşılıyor: sorgu ilk 300 satırı okuyup duruyor.
--
-- Sütun sırası sorgudaki ORDER BY ile birebir aynı olmalı, yoksa dizin sıralama için kullanılamaz.
CREATE INDEX IF NOT EXISTS room_members_list_idx
  ON room_members(room_id, seat_index NULLS LAST, joined_at);
