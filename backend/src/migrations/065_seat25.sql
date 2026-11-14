-- Doğum Günü mikrofon modu odayı 25 koltuğa çıkarır (062). Uygulama 25'e izin veriyordu (SUPPORTED_SEATS) ama veritabanı
-- kısıtı vermiyordu: "Uygula" deyince "Değer kurallara uymuyor." hatası. 25 her iki tabloya eklendi.
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_seat_count_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_seat_count_check CHECK (seat_count IN (2, 4, 5, 6, 8, 9, 12, 15, 20, 25, 30));
ALTER TABLE room_profiles DROP CONSTRAINT IF EXISTS room_profiles_seat_count_check;
ALTER TABLE room_profiles ADD CONSTRAINT room_profiles_seat_count_check CHECK (seat_count IN (2, 4, 5, 6, 8, 9, 12, 15, 20, 25, 30));
