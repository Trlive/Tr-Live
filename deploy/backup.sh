#!/usr/bin/env bash
# Günlük PostgreSQL yedeği (cron: 0 4 * * * /opt/trlive/deploy/backup.sh). 14 gün saklanır.
#
# Yedek alındıktan sonra OKUNABİLİRLİĞİ doğrulanır: bozuk bir gzip ya da yarım kalmış dump
# sessizce birikirse, gerçekten ihtiyaç duyulan gün elinizde hiçbir şey olmaz.
# Ayrıca SHA-256 özeti yazılır: sunucu dışına kopyalanan dosyanın aynı dosya olduğunu kanıtlar.
#
# ÖNEMLİ: Bu betiğin ürettiği yedek, sunucunun KENDİSİNDE durur. Sunucu kaybolursa yedek de
# kaybolur. En az ayda bir, dosyaları sunucu dışına (başka bir makine ya da nesne depolama)
# kopyalayın; geri yükleme provası için deploy/restore_test.sh kullanın.
set -euo pipefail
DIR=${BACKUP_DIR:-/var/backups/trlive}
COMPOSE="$(dirname "$0")/docker-compose.yml"
DB_USER=${POSTGRES_USER:-trlive}
DB_NAME=${POSTGRES_DB:-trlive}
KEEP_DAYS=${BACKUP_KEEP_DAYS:-14}
mkdir -p "$DIR"

stamp=$(date +%F)
tmp="$DIR/.trlive-$stamp.sql.gz.partial"
out="$DIR/trlive-$stamp.sql.gz"

# pg_dump veya gzip hata verirse dosya "partial" adında kalır, üzerine yazılmaz (set -o pipefail).
docker compose -f "$COMPOSE" exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$tmp"

# 1) gzip bütünlüğü  2) dump sonu işareti (yarım kalan dump'ta bu satır yoktur)
gzip -t "$tmp"
if ! gzip -dc "$tmp" | tail -5 | grep -q 'PostgreSQL database dump complete'; then
  echo "HATA: yedek yarım görünüyor (dump bitiş satırı yok): $tmp" >&2
  exit 1
fi

bytes=$(stat -c%s "$tmp")
if [ "$bytes" -lt 10240 ]; then
  echo "HATA: yedek şüpheli derecede küçük ($bytes bayt): $tmp" >&2
  exit 1
fi

mv "$tmp" "$out"
sha256sum "$out" | awk '{print $1}' > "$out.sha256"
find "$DIR" -name 'trlive-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$DIR" -name 'trlive-*.sql.gz.sha256' -mtime +"$KEEP_DAYS" -delete
find "$DIR" -name '.trlive-*.partial' -mtime +2 -delete

echo "Yedek alındı ve doğrulandı: $out ($(numfmt --to=iec "$bytes" 2>/dev/null || echo "$bytes bayt"))"
echo "SHA-256: $(cat "$out.sha256")"
