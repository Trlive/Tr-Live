# TR Live web: yönetim / ajans paneli (https://SUNUCU/yonetim) ve tanıtım sitesi (https://SUNUCU/).
# Panel, uygulama sunucusuyla aynı adresten yayınlanır; istekler aynı adrese gider (ayrı GitHub Pages gerekmez).
FROM node:20-bookworm-slim AS panel
WORKDIR /p
# Kilit dosyasındaki sürümler kurulur (rapor Y-03); kilit yoksa eski davranış (npm install).
COPY panel/package.json panel/package-lock.json* ./
RUN (if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi) > /tmp/install.log 2>&1 || (echo "UYARI: panel paketleri kurulamadı"; tail -n 40 /tmp/install.log)
COPY panel/ ./
ENV NEXT_PUBLIC_BASE_PATH=/yonetim NEXT_PUBLIC_API_BASE_URL=same-origin NEXT_TELEMETRY_DISABLED=1
# Panel derlenemezse sunucu güncellemesi DURMAZ: yerine "panel derlenemedi" sayfası konur, uygulama sunucusu güncellenir.
# Derleme çıktısı kaydedilir; başarısızsa son satırları fallback sayfasının yanına yazılır (/yonetim/derleme-hatasi.txt),
# böylece neden derlenemediği görülebilir.
RUN (npm run build > /tmp/build.log 2>&1 && test -f out/index.html) \
 || ((echo "== npm install (son 30) =="; tail -n 30 /tmp/install.log; echo; echo "== next build (son 80) =="; tail -n 80 /tmp/build.log) > /tmp/err.txt 2>/dev/null; rm -rf out && mkdir -p out && cp fallback.html out/index.html && cp /tmp/err.txt out/derleme-hatasi.txt && echo "UYARI: panel derlenemedi")

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY site/ /srv/site/
COPY --from=panel /p/out/ /srv/yonetim/
EXPOSE 8091
