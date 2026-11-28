FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
# Yüklenen videoları şeffaf yapmak ve hediye ikonunu otomatik çıkarmak için. Kurulamazsa derleme durmaz
# (bu özellikler kapalı kalır, uygulama çalışır).
RUN apk add --no-cache ffmpeg || echo "UYARI: ffmpeg kurulamadı"
COPY package*.json ./
# npm ci: yalnızca package-lock.json'daki sürümler kurulur (her derleme aynı paketleri alır; rapor Y-03).
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
# Yüklenen profil görselleri için kalıcı bir dizin (volume bağlayın: -v trlive-uploads:/app/uploads)
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1
# Migration'lar advisory lock ile korunur; her açılışta güvenle çalıştırılabilir.
# "exec": sunucu 1 numaralı süreç olur ve Docker'ın durdurma sinyalini (SIGTERM) kendisi alır. Eskiden sinyal kabukta
# (sh) kalıyor, sunucu düzgün kapanamıyor ve her güncellemede 10 sn bekleyip zorla öldürülüyordu.
CMD ["sh", "-c", "node src/infrastructure/database/migration_runner.js && exec node src/server.js"]
