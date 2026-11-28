#!/usr/bin/env bash
# Ses/görüntü yük testi (sunucu panelinden başlatılır): LiveKit'in resmi aracıyla (lk load-test) sahte konuşmacı ve dinleyiciler
# açar, dinleyici sayısını kademe kademe artırır; her kademede LiveKit'in işlemci/bellek kullanımını, ses kaybını ve hataları
# ölçer. LiveKit zorlanmaya başlayınca (işlemci %85, hata, paket kaybı) durur ve özet yazar.
#
# İstek dosyası ($STATE/loadtest-request): "<audio|video> <konuşmacı> <en çok dinleyici>" (ör. "audio 10 1000").
# Çıktı: $STATE/loadtest.log (panel gösterir).
#
# ÖNEMLİ — ölçüm aynı sunucuda yapılır: sahte dinleyiciler de bu makinenin işlemcisini kullanır. Bu yüzden sonuç
# GERÇEK sınırın ALTINDA kalır (güvenli taraf). Özet, ölçüm aracının kendi işlemci payını ayrıca gösterir.
# Oda adı UUID değildir: uygulamanın LiveKit kuralları (üye olmayanı at) test odasına karışmaz.
set -uo pipefail
ROOT=${TRLIVE_ROOT:-/opt/trlive}
STATE=$ROOT/state
ENVD=$ROOT/env
LOG=$STATE/loadtest.log
REQ=$STATE/loadtest-request
say() { echo "$*" >> "$LOG"; }

exec 8>"$STATE/loadtest.lock"
flock -n 8 || exit 0
[ -s "$REQ" ] || exit 0
read -r MODE PUBS MAXSUBS < "$REQ" || true
rm -f "$REQ"
[[ $MODE == audio || $MODE == video ]] || MODE=audio
[[ $PUBS =~ ^[0-9]+$ ]] && [ "$PUBS" -ge 1 ] && [ "$PUBS" -le 20 ] || PUBS=10
[[ $MAXSUBS =~ ^[0-9]+$ ]] && [ "$MAXSUBS" -ge 10 ] && [ "$MAXSUBS" -le 5000 ] || MAXSUBS=1000

: > "$LOG"; : > "$STATE/loadtest.raw"
say "[$(date '+%H:%M:%S')] Yük testi başlıyor: $([ "$MODE" = audio ] && echo sesli || echo görüntülü) oda, $PUBS konuşmacı, en çok $MAXSUBS dinleyici."

KEY=$( (grep -E "^LIVEKIT_API_KEY=" "$ENVD/stack.env" || true) | head -n1 | cut -d= -f2- | tr -d "'\"")
SECRET=$( (grep -E "^LIVEKIT_API_SECRET=" "$ENVD/stack.env" || true) | head -n1 | cut -d= -f2- | tr -d "'\"")
if [ -z "$KEY" ] || [ -z "$SECRET" ]; then say "HATA: LiveKit anahtarı bulunamadı."; say "Bitti."; exit 1; fi

# Ölçüm aracı (LiveKit CLI): yoksa resmi kurulum betiğiyle kurulur.
if ! command -v lk >/dev/null 2>&1; then
  say "Ölçüm aracı (LiveKit CLI) kuruluyor…"
  curl -sSL https://get.livekit.io/cli | bash >> "$LOG" 2>&1 || true
fi
if ! command -v lk >/dev/null 2>&1; then say "HATA: LiveKit CLI kurulamadı."; say "Bitti."; exit 1; fi
say "Araç: $(lk --version 2>/dev/null | head -n1)"

LKID=$(docker ps -q --filter "name=livekit" | head -n1)
[ -n "$LKID" ] || { say "HATA: LiveKit çalışmıyor."; say "Bitti."; exit 1; }
CORES=$(nproc)
CPU_CAP=$((CORES * 85))   # docker stats yüzdesi çekirdek toplamıdır (4 çekirdek = %400)
ulimit -n 65535 2>/dev/null || true
URL=ws://127.0.0.1:7880

# Bir kademe: N dinleyici. Çıktı satırı: "N lkCPUort lkCPUtepe bellekMB üreticiCPU hata kayıp% dosya"
stage() {
  local n=$1 out pid t0 dur
  out=$(mktemp)
  # Katılım hızı saniyede 50; süre: herkes katıldıktan sonra en az 30 sn ölçüm.
  dur=$(( n / 50 + 40 ))
  local args=(load-test --url "$URL" --api-key "$KEY" --api-secret "$SECRET" --room "yuktesti-$(date +%s)" --subscribers "$n" --num-per-second 50 --duration "${dur}s")
  if [ "$MODE" = audio ]; then args+=(--audio-publishers "$PUBS"); else args+=(--video-publishers "$PUBS" --video-resolution medium); fi
  lk "${args[@]}" > "$out" 2>&1 &
  pid=$!
  local sum=0 cnt=0 peak=0 mem=0 gen=0 c m g
  t0=$(date +%s)
  sleep $(( n / 50 + 8 ))   # katılım bitene kadar ölçme (giriş anı yükü ayrı)
  while kill -0 "$pid" 2>/dev/null; do
    c=$(docker stats --no-stream --format '{{.CPUPerc}}' "$LKID" 2>/dev/null | tr -d '%' | cut -d. -f1)
    m=$(docker stats --no-stream --format '{{.MemUsage}}' "$LKID" 2>/dev/null | awk '{print $1}')
    g=$(ps -o %cpu= -p "$pid" 2>/dev/null | cut -d. -f1 | tr -d ' ')
    [[ $c =~ ^[0-9]+$ ]] && { sum=$((sum + c)); cnt=$((cnt + 1)); [ "$c" -gt "$peak" ] && peak=$c; }
    [[ $g =~ ^[0-9]+$ ]] && [ "$g" -gt "$gen" ] && gen=$g
    [ -n "$m" ] && mem=$m
    sleep 4
    [ $(( $(date +%s) - t0 )) -gt $(( dur + 120 )) ] && kill "$pid" 2>/dev/null
  done
  wait "$pid"; local rc=$?
  local avg=0; [ "$cnt" -gt 0 ] && avg=$((sum / cnt))
  # Hata ve kayıp: aracın özet tablosundan (biçim sürüme göre değişebilir; ham çıktı da kayda yazılır).
  local errs loss
  errs=$(grep -ciE "failed|could not|error:" "$out" || true)
  loss=$(grep -iE "^\s*\|?\s*total" "$out" | grep -oE "[0-9]+(\.[0-9]+)?%" | tail -n1 | tr -d '%')
  echo "$n $avg $peak ${mem:-?} $gen $rc ${errs:-0} ${loss:-?} $out"
}

say ""
say "Ön deneme (1 konuşmacı, 2 dinleyici)…"
PUBS_SAVE=$PUBS; PUBS=1
read -r _ _ _ _ _ rc errs _ f <<< "$(stage 2)"
PUBS=$PUBS_SAVE
if [ "$rc" != 0 ] || grep -qiE "could not connect|failed to connect|ice.*fail" "$f"; then
  say "HATA: Ön deneme bağlanamadı. Ham çıktı:"; tail -n 30 "$f" >> "$LOG"; say "Bitti."; exit 1
fi
say "Ön deneme tamam."
say ""
say "Dinleyici | LiveKit işlemci ort/tepe (%$((CORES * 100)) = tüm çekirdekler) | bellek | ölçüm aracı işlemci | hata | kayıp"

LAST_OK=0; REASON="hedefe ulaşıldı ($MAXSUBS)"
for n in 25 50 100 200 300 500 750 1000 1500 2000 3000 4000 5000; do
  [ "$n" -gt "$MAXSUBS" ] && break
  read -r N AVG PEAK MEM GEN RC ERRS LOSS F <<< "$(stage "$n")"
  say "$(printf '%9s | %3s / %3s %% | %8s | %4s %% | %s | %s%%' "$N" "$AVG" "$PEAK" "$MEM" "$GEN" "$ERRS" "$LOSS")"
  { echo "--- $N dinleyici: araç çıktısı (son satırlar)"; tail -n 12 "$F"; } >> "$STATE/loadtest.raw"
  rm -f "$F"
  if [ "$RC" != 0 ] || [ "${ERRS:-0}" -gt $(( N / 20 + 2 )) ]; then REASON="hatalar başladı ($N dinleyicide)"; break; fi
  if [[ $LOSS =~ ^[0-9]+(\.[0-9]+)?$ ]] && awk "BEGIN{exit !($LOSS > 2)}"; then REASON="ses kaybı %2'yi geçti ($N dinleyicide)"; break; fi
  LAST_OK=$N
  if [ "$AVG" -ge "$CPU_CAP" ]; then REASON="LiveKit işlemcisi %85'e ulaştı ($N dinleyicide)"; break; fi
  if [ $((AVG + GEN)) -ge $((CORES * 95)) ]; then REASON="makinenin tamamı doldu ($N dinleyicide; ölçüm aracı da aynı makinede)"; break; fi
  avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
  if [ "${avail:-0}" -lt 600 ]; then REASON="boş bellek azaldı ($N dinleyicide)"; break; fi
  sleep 5
done

say ""
say "SONUÇ: Sorunsuz geçen en yüksek kademe: $LAST_OK dinleyici ($PUBS konuşmacı, $([ "$MODE" = audio ] && echo sesli || echo görüntülü)). Durma sebebi: $REASON."
say "Not: Sahte dinleyiciler de bu sunucuda çalıştığı için gerçek kapasite bundan YÜKSEKTİR (ölçüm aracının işlemci payı tabloda)."
say "Bitti."
