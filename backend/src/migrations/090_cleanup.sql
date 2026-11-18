-- Eski bir denemenin kalıntılarını temizler (varsa).
DELETE FROM activity_items WHERE link_url LIKE '%/g/crash/%';
DROP TABLE IF EXISTS crash_bets;
DROP TABLE IF EXISTS crash_rounds;
DELETE FROM game_kv WHERE key = 'crash_settings';
