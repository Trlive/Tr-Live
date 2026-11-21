#!/usr/bin/env bash
# Yedekten geri yükleme provası (V-03).
#
# Denenmemiş yedek, yedek değildir. Bu betik en son yedeği GEÇİCİ bir veritabanına geri yükler,
# içeriğini doğrular ve sonra o geçici veritabanını siler. Üretim veritabanına DOKUNMAZ.
#
# Kullanım:
#   ./restore_test.sh                      # en son yedek
#   ./restore_test.sh /yol/trlive-2026-11-20.sql.gz
#
# Ayda bir cron ile çalıştırın:
#   0 5 1 * * /opt/trlive/deploy/restore_test.sh >> /var/log/trlive-restore-test.log 2>&1
#
# Çıkış kodu 0 = yedek gerçekten geri yüklenebiliyor. 0 değilse yedekleriniz güvenilmez demektir.
set -euo pipefail
DIR=${BACKUP_DIR:-/var/backups/trlive}
COMPOSE="$(dirname "$0")/docker-compose.yml"
DB_USER=${POSTGRES_USER:-trlive}
TEST_DB="trlive_restore_test_$$"

file=${1:-}
if [ -z "$file" ]; then
  file=$(ls -1t "$DIR"/trlive-*.sql.gz 2>/dev/null | head -1 || true)
fi
[ -n "$file" ] || { echo "HATA: yedek dosyası bulunamadı ($DIR)" >&2; exit 1; }
[ -f "$file" ] || { echo "HATA: dosya yok: $file" >&2; exit 1; }

echo "Prova başlıyor: $file"
started=$(date +%s)

# 0) Dosya bozulmamış mı (özet varsa karşılaştır).
gzip -t "$file"
if [ -f "$file.sha256" ]; then
  want=$(cat "$file.sha256")
  have=$(sha256sum "$file" | awk '{print $1}')
  [ "$want" = "$have" ] || { echo "HATA: dosya özeti tutmuyor (yedek bozulmuş olabilir)." >&2; exit 1; }
  echo "  ✓ dosya özeti doğru"
fi

psql_t() { docker compose -f "$COMPOSE" exec -T postgres psql -U "$DB_USER" -d "$TEST_DB" -v ON_ERROR_STOP=1 -Atc "$1"; }
cleanup() {
  docker compose -f "$COMPOSE" exec -T postgres psql -U "$DB_USER" -d postgres -q \
    -c "DROP DATABASE IF EXISTS \"$TEST_DB\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# 1) Boş veritabanı aç ve yedeği içine yükle.
docker compose -f "$COMPOSE" exec -T postgres psql -U "$DB_USER" -d postgres -q -c "CREATE DATABASE \"$TEST_DB\""
gzip -dc "$file" | docker compose -f "$COMPOSE" exec -T postgres psql -U "$DB_USER" -d "$TEST_DB" -q -v ON_ERROR_STOP=1 >/dev/null
echo "  ✓ geri yükleme tamamlandı"

# 2) Kritik tablolar yerinde ve dolu mu?
missing=""
for t in users rooms gifts wallet_transactions schema_migrations; do
  exists=$(psql_t "SELECT to_regclass('public.$t') IS NOT NULL")
  [ "$exists" = "t" ] || missing="$missing $t"
done
[ -z "$missing" ] || { echo "HATA: yedekte eksik tablo(lar):$missing" >&2; exit 1; }
echo "  ✓ kritik tablolar var"

users=$(psql_t "SELECT COUNT(*) FROM users")
mig=$(psql_t "SELECT COUNT(*) FROM schema_migrations")
tables=$(psql_t "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
lastmig=$(psql_t "SELECT COALESCE(MAX(version),'-') FROM schema_migrations")
[ "$users" -gt 0 ] || { echo "HATA: kullanıcı tablosu boş — yedek işe yaramaz." >&2; exit 1; }

# 3) Para tutarlılığı: bakiye ile işlem defteri yedekte de tutuyor mu?
#    (Mutabakat tabanı yedekte varsa aynı eşitlik burada da sınanır.)
recon=$(psql_t "
  SELECT COALESCE(COUNT(*), 0) FROM (
    SELECT b.user_id FROM wallet_recon_baseline b
      JOIN users u ON u.id = b.user_id
      LEFT JOIN (SELECT user_id, SUM(coin_amount) c, SUM(diamond_amount) d FROM wallet_transactions GROUP BY user_id) l
        ON l.user_id = b.user_id
     WHERE (u.coins - b.coins) <> (COALESCE(l.c,0) - b.led_coins)
        OR (u.diamonds - b.diamonds) <> (COALESCE(l.d,0) - b.led_diamonds)
  ) x" 2>/dev/null || echo "yok")

took=$(( $(date +%s) - started ))
echo
echo "SONUÇ: yedek geri yüklenebiliyor."
echo "  dosya        : $file"
echo "  süre         : ${took} sn   ← felaket anında veri bu kadar sürede ayağa kalkar"
echo "  tablo sayısı : $tables"
echo "  kullanıcı    : $users"
echo "  migration    : $mig (son: $lastmig)"
if [ "$recon" = "yok" ]; then
  echo "  mutabakat    : taban tablosu yedekte yok (eski yedek) — atlandı"
elif [ "$recon" = "0" ]; then
  echo "  mutabakat    : ✓ fark yok"
else
  echo "  mutabakat    : ✗ $recon kullanıcıda bakiye/defter farkı — YEDEK TUTARSIZ" >&2
  exit 1
fi
