# Dağıtım ve sertleştirme

Katmanlı savunma (her katman bir öncekini tamamlar, hiçbiri tek başına yeterli değildir):

| Katman | Nerede | Ne yapar |
|---|---|---|
| 1. Ağ güvenlik duvarı | `ufw.sh` | Yalnızca 22/80/443 ve LiveKit portları açık; 5432 ve 3000 kapalı |
| 2. Saldırgan engelleme | `fail2ban/` | Tekrarlayan tarayıcı/bot IP'lerini ağ düzeyinde banlar |
| 3. Ters vekil | `nginx.conf` | TLS, IP başına hız/bağlantı sınırı, zafiyet tarayıcı yollarına 444 |
| 4. **Uygulama güvenlik duvarı** | `backend/src/firewall*.js` | IP yasağı, WAF kuralları, kullanıcı/uç nokta başına limit, giriş kilidi, WebSocket sel koruması, otomatik yasaklama, denetim kaydı |
| 5. Veri katmanı | Postgres | Parametreli sorgular, CHECK kısıtları, transaction + satır kilitleri |

> **Dürüst not:** uygulama içi "güvenlik duvarı" bir WAF-lite'tır. Büyük çaplı DDoS'u durduramaz; bunun için
> Cloudflare (veya benzeri) önünüze konmalıdır. Cloudflare kullanırsanız nginx'te gerçek IP için
> `real_ip_header CF-Connecting-IP;` ve `set_real_ip_from` ile Cloudflare IP aralıklarını tanımlayın.

## Kurulum (tek sunucu)
```bash
sudo ./ufw.sh
cp .env.example .env && nano .env          # tüm CHANGE_ME değerlerini değiştirin
sudo certbot certonly --standalone -d api.example.com
# nginx.conf ve livekit.yaml içindeki alan adı/anahtarları düzenleyin
docker compose up -d --build
curl https://api.example.com/health
```
Mobil uygulamayı `--dart-define=API_URL=https://api.example.com` ile derleyin.

## Mutlaka kontrol edin
- `TRUST_PROXY=1` (compose'ta ayarlı). **Ayarlı değilse tüm kullanıcılar nginx'in IP'sinden geliyormuş gibi görünür ve IP bazlı sınırlar/yasaklar herkesi etkiler.**
- `FIREWALL_ALLOW_IPS` içine kendi yönetim IP'nizi ekleyin (yanlışlıkla kendinizi banlamayın).
- `JWT_SECRET` 32+ karakter; üretimde varsayılan değerle sunucu açılmaz.
- Yedekler: `backup.sh` cron'a ekleyin **ve `restore_test.sh`'i ayda bir çalıştırın** (aşağıya bakın).
- Birden fazla backend örneği çalıştıracaksanız WebSocket yayını, oda temizleyici ve güvenlik duvarı sayaçları bellek içi olduğundan Redis gerekir.
- Kullanıcı yüklemeleri `/app/uploads` volume'ündedir; yedeklemeye dahil edin.

## İzleme
`GET /api/admin/security/events` (yalnızca admin) son güvenlik olaylarını, `.../security/blocks` aktif IP yasaklarını gösterir.
Uygulama günlükleri JSON satırı olarak `security` alanıyla yazılır; Loki/ELK ile toplanabilir.

## Yedek ve geri yükleme provası

Denenmemiş yedek, yedek değildir. İki betik birlikte çalışır:

```bash
# Günlük yedek (alır, gzip bütünlüğünü ve dump'ın tamamlandığını doğrular, SHA-256 özeti yazar)
0 4 * * *   /opt/trlive/deploy/backup.sh >> /var/log/trlive-backup.log 2>&1

# Aylık prova (en son yedeği GEÇİCİ bir veritabanına geri yükler, doğrular, siler — üretime dokunmaz)
0 5 1 * *   /opt/trlive/deploy/restore_test.sh >> /var/log/trlive-restore-test.log 2>&1
```

`restore_test.sh` neyi kanıtlar:

| Kontrol | Ne anlama gelir |
|---|---|
| gzip + SHA-256 | Dosya bozulmamış, kopyalanan dosya aynı dosya |
| Geri yükleme | Yedek gerçekten açılıyor (yarım/bozuk dump değil) |
| Kritik tablolar | `users`, `rooms`, `gifts`, `wallet_transactions`, `schema_migrations` yerinde |
| Kullanıcı sayısı | Yedek boş değil |
| **Mutabakat** | Yedekteki bakiyeler ile işlem defteri **tutuyor** (bozuk veriyi geri yüklemiyorsunuz) |
| **Süre** | Felaket anında verinin kaç saniyede ayağa kalkacağı — ölçülmüş sayı |

Çıkış kodu 0 değilse yedekleriniz güvenilmez; sebebini görmeden başka işe geçmeyin.

> **Sunucu dışı kopya:** Bu yedekler sunucunun kendisinde durur. Sunucu kaybolursa yedek de kaybolur.
> En az ayda bir `/var/backups/trlive` içeriğini başka bir yere kopyalayın. `*.sha256` dosyalarını da
> kopyalayın: karşı tarafta aynı dosya olduğunu böyle doğrularsınız.
