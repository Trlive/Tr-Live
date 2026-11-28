-- Şarkı ses yüksekliği eşitleme (v2.155.7): yüklenen parçanın ses yüksekliği (EBU R128, LUFS) sunucuda ölçülür,
-- çalarken uygulanacak kazanç (dB, 0 ya da eksi) saklanır. Böylece yüksek ve kısık kaydedilmiş şarkılar aynı düzeyde çalar.
ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS gain_db REAL;
