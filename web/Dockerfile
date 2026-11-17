# TR Live web: yönetim / ajans paneli (https://SUNUCU/yonetim) ve tanıtım sitesi (https://SUNUCU/).
# Panel, uygulama sunucusuyla aynı adresten yayınlanır; istekler aynı adrese gider (ayrı GitHub Pages gerekmez).
FROM node:20-alpine AS panel
WORKDIR /p
COPY panel/package.json ./
RUN npm install --no-audit --no-fund || echo "UYARI: panel paketleri kurulamadı"
COPY panel/ ./
ENV NEXT_PUBLIC_BASE_PATH=/yonetim NEXT_PUBLIC_API_BASE_URL=same-origin NEXT_TELEMETRY_DISABLED=1
# Panel derlenemezse sunucu güncellemesi DURMAZ: yerine "panel derlenemedi" sayfası konur, uygulama sunucusu güncellenir.
RUN (npm run build && test -f out/index.html) \
 || (rm -rf out && mkdir -p out && cp fallback.html out/index.html && echo "UYARI: panel derlenemedi")

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY site/ /srv/site/
COPY --from=panel /p/out/ /srv/yonetim/
EXPOSE 8091
