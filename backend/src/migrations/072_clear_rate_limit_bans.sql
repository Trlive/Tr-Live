-- v2.105.0: Hız sınırı aşımlarından doğan otomatik IP yasakları kaldırılır.
-- Eski sürümde sınırı aşan her istek bir ihlal puanıydı: hızlı hediye gönderen (combo) ya da aynı Wi-Fi / operatör
-- IP'sini paylaşan meşru kullanıcılar saniyeler içinde yasaklanıyor, o IP'deki herkes odasından düşüyordu (yasak
-- 15 dk → 1 saat → 24 saat diye uzuyordu). Saldırı imzası, hatalı giriş ve elle konan yasaklara dokunulmaz.
DELETE FROM firewall_blocks
 WHERE created_by IS NULL
   AND (reason LIKE 'Otomatik: rate_limit%' OR reason LIKE 'Otomatik: limit_%' OR reason LIKE 'Otomatik: ws_ip_flood%');
