#!/usr/bin/env bash
# Günlük veritabanı yedeği: /opt/trlive/backups (son 7 gün). Panelde uzak hedef (S3 uyumlu depolama) girilirse aynı yedek oraya da
# kopyalanır ve orada 30 gün saklanır; böylece sunucu kaybolsa da veri kaybolmaz (rapor K-07).
# Çıkış kodları: 0 tamam, 1 yerel yedek başarısız, 3 yerel yedek tamam ama uzak kopya başarısız (systemd "failed" gösterir).
set -euo pipefail
ROOT=${TRLIVE_ROOT:-/opt/trlive}
ENVF="$ROOT/env/extra.env"
STAMP=${BACKUP_STAMP:-$(date +%F)}
F="$ROOT/backups/trlive-$STAMP.sql.gz"
log() { echo "[trlive-backup $(date '+%F %T')] $*"; }

# <backup-helpers>
env_get() {   # $1 = anahtar, $2 = extra.env yolu → değer (tırnaksız; yoksa boş)
  local line
  line=$(grep -E "^$1=" "$2" 2>/dev/null | tail -n 1 || true)
  line=${line#*=}
  line=${line#\'}; line=${line%\'}
  line=${line#\"}; line=${line%\"}
  printf '%s' "$line"
}
# </backup-helpers>

mkdir -p "$ROOT/backups"

# 1) Yerel yedek. Sessizce bozuk/boş yedek bırakmamak için üç denetim yapılır; başarısızsa hata verilir ve ESKİ YEDEKLER SİLİNMEZ.
if ! docker exec trlive-postgres-1 pg_dump -U trlive --no-owner trlive | gzip -6 > "$F.tmp"; then
  rm -f "$F.tmp"; log "HATA: pg_dump başarısız oldu; yedek alınmadı."; exit 1
fi
if ! gzip -t "$F.tmp" 2>/dev/null; then
  rm -f "$F.tmp"; log "HATA: yedek dosyası bozuk (gzip denetimi geçmedi)."; exit 1
fi
SIZE=$(stat -c %s "$F.tmp")
if [ "$SIZE" -lt 1024 ]; then
  rm -f "$F.tmp"; log "HATA: yedek şüpheli derecede küçük ($SIZE bayt); alınmadı."; exit 1
fi
mv "$F.tmp" "$F"
log "Yerel yedek tamam: $F ($SIZE bayt)"
ls -1t "$ROOT"/backups/trlive-*.sql.gz | tail -n +8 | xargs -r rm -f

# 2) Uzak kopya (isteğe bağlı): panelde "Uzak yedek" alanı doluysa. Biçim (boşlukla ayrılmış): uç-nokta kova anahtar-kimliği gizli-anahtar [bölge]
#    Örnek: https://s3.us-west-004.backblazeb2.com kovam AKIA... gizli... us-west-004
REMOTE_CFG=$(env_get BACKUP_REMOTE "$ENVF")
if [ -z "$REMOTE_CFG" ]; then exit 0; fi   # uzak hedef ayarlanmamış
EP=""; BK=""; KID=""; SEC=""; REG=""
read -r EP BK KID SEC REG <<< "$REMOTE_CFG" || true
DAYS=30                                    # uzakta bu kadar gün saklanır
if [ -z "$EP" ] || [ -z "$BK" ] || [ -z "$KID" ] || [ -z "$SEC" ]; then
  log "UYARI: uzak yedek ayarı eksik (uç-nokta, kova, anahtar kimliği ve gizli anahtar gerekir); uzak kopya atlandı."; exit 3
fi
if ! command -v rclone >/dev/null 2>&1; then
  log "UYARI: rclone kurulu değil; uzak kopya atlandı (panelde Kaydet'e basınca kurulum kurar)."; exit 3
fi
# Kimlik bilgileri komut satırına değil ortam değişkenlerine yazılır (süreç listesinde görünmesin).
export RCLONE_CONFIG_OFFSITE_TYPE=s3 RCLONE_CONFIG_OFFSITE_PROVIDER=Other
export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$KID" RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$SEC"
export RCLONE_CONFIG_OFFSITE_ENDPOINT="$EP" RCLONE_CONFIG_OFFSITE_REGION="$REG"
REMOTE="offsite:$BK/trlive"
if ! rclone copyto "$F" "$REMOTE/trlive-$STAMP.sql.gz" --s3-no-check-bucket; then
  log "HATA: uzak kopya yüklenemedi (yerel yedek duruyor)."; exit 3
fi
log "Uzak kopya tamam: $REMOTE/trlive-$STAMP.sql.gz"
if ! rclone delete "$REMOTE" --min-age "${DAYS}d" --s3-no-check-bucket; then
  log "UYARI: $DAYS günden eski uzak yedekler temizlenemedi."; exit 3
fi
