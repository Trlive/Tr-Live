# TR Live web: yönetim / ajans paneli (https://SUNUCU/yonetim) ve tanıtım sitesi (https://SUNUCU/).
# Panel, uygulama sunucusuyla aynı adresten yayınlanır; istekler aynı adrese gider (ayrı GitHub Pages gerekmez).
FROM node:20-alpine AS panel
WORKDIR /p
COPY panel/package.json ./
RUN npm install --no-audit --no-fund || echo "UYARI: panel paketleri kurulamadı"
COPY panel/ ./
ENV NEXT_PUBLIC_BASE_PATH=/yonetim NEXT_PUBLIC_API_BASE_URL=same-origin NEXT_TELEMETRY_DISABLED=1
# Panel derlenemezse sunucu güncellemesi DURMAZ: yerine "panel derlenemedi" sayfası konur, uygulama sunucusu güncellenir.
# Derleme çıktısı kaydedilir; başarısızsa son satırları fallback sayfasının yanına yazılır (/yonetim/derleme-hatasi.txt),
# böylece neden derlenemediği görülebilir.
RUN (npm run build > /tmp/build.log 2>&1 && test -f out/index.html) \
 || (tail -n 60 /tmp/build.log > /tmp/err.txt 2>/dev/null; rm -rf out && mkdir -p out && cp fallback.html out/index.html && cp /tmp/err.txt out/derleme-hatasi.txt && echo "UYARI: panel derlenemedi")

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY site/ /srv/site/
COPY --from=panel /p/out/ /srv/yonetim/
EXPOSE 8091
