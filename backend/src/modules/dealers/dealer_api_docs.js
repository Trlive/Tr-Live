// /dealer-api/docs: bayi API'si belgesi (tek HTML, betik yok). Bayinin yazılımcısı için.
export function renderDealerApiDocs() {
  const css = `body{margin:0;background:#0b0906;color:#f6efdf;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 60px}h1{font-size:24px}h2{font-size:18px;margin-top:32px;color:#ffd54f}
h3{font-size:15px;margin-top:22px}code{background:#17130c;border:1px solid #3a2f1a;border-radius:6px;padding:1px 6px;font-size:13px}
pre{background:#17130c;border:1px solid #3a2f1a;border-radius:10px;padding:12px;overflow:auto;font-size:13px;line-height:1.45}
pre code{border:0;padding:0;background:none}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #3a2f1a;padding:6px 8px;text-align:left;vertical-align:top}
.note{background:#1d170c;border-left:3px solid #f2b92a;padding:10px 12px;border-radius:6px;color:#e8dcc0}`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>TR Live Bayi API</title><style>${css}</style></head><body><main>
<h1>TR Live Bayi API · v1</h1>
<p>Kendi sitenizden, mağaza sisteminizden ya da sohbet botunuzdan, <b>bayi Coin stoğunuzdan</b> müşterinin hesabına (uygulamadaki ID'siyle) Coin yükleyin.
Uygulamadaki "Kullanıcıya Coins Yükle" ile aynı işlemdir: Coin stoğunuzdan düşer, müşteriye anında (ya da 5 dakika sonra) geçer.</p>
<div class="note">Anahtarınızı <b>Bayi Paneli → API anahtarları</b> bölümünden oluşturun. Anahtar yalnızca bir kez gösterilir; kimseyle paylaşmayın,
uygulama/tarayıcı koduna koymayın (yalnızca sunucunuzda). Sunucunuzun IP adresini anahtara ekleyin. Anahtar sızarsa hemen iptal edip yenisini oluşturun.
API erişimini yönetim açar.</div>

<h2>Temel</h2>
<table>
<tr><th>Adres</th><td><code>https://SUNUCU/dealer-api/v1</code></td></tr>
<tr><th>Kimlik</th><td><code>Authorization: Bearer trk_XXXXXXXX_...</code></td></tr>
<tr><th>Biçim</th><td>İstek ve yanıt JSON (<code>Content-Type: application/json</code>). Tutarlar metin olarak döner (büyük sayılar bozulmasın).</td></tr>
<tr><th>Hız sınırı</th><td>Anahtar başına dakikada 120 istek. Aşılırsa 429.</td></tr>
<tr><th>Hata</th><td><code>{"error":{"code":"...","message":"..."}}</code> — kodlar: <code>unauthorized</code>, <code>forbidden</code>, <code>ip_not_allowed</code>,
<code>api_disabled</code>, <code>contract_required</code>, <code>invalid_request</code>, <code>not_found</code>, <code>conflict</code>, <code>rate_limited</code>, <code>server_error</code></td></tr>
</table>

<h2>Tekrar güvenliği (önemli)</h2>
<p>Her yüklemeye kendi sisteminizdeki <b>benzersiz sipariş numarasını</b> <code>clientOrderId</code> olarak gönderin. Bağlantı koparsa <b>aynı</b>
<code>clientOrderId</code> ile tekrar gönderin: Coin ikinci kez yüklenmez, ilk sonuç döner (<code>"replay": true</code>). Aynı numarayı farklı kişi/miktarla
gönderirseniz 409 alırsınız.</p>

<h2>Uçlar</h2>
<h3>GET /me — stok ve anahtar bilgisi</h3>
<pre><code>{"dealer":{"name":"Örnek Bayi"},"balance":"6266600","key":{"prefix":"trk_Ab12Cd34","dailyLimit":"0","usedLast24h":"2000000"}}</code></pre>
<h3>GET /users/{userId} — alıcıyı doğrula</h3>
<p>Yüklemeden önce müşteriye adını göstermek için. <code>userId</code> uygulamadaki ID numarasıdır.</p>
<pre><code>{"user":{"userId":"79924405","displayName":"Gölge","avatarUrl":"https://..."}}</code></pre>
<h3>POST /recharges — Coin yükle</h3>
<table>
<tr><th>Alan</th><th>Zorunlu</th><th>Açıklama</th></tr>
<tr><td><code>clientOrderId</code></td><td>evet</td><td>1–64 karakter: harf, rakam, <code>-</code>, <code>_</code></td></tr>
<tr><td><code>userId</code></td><td>evet</td><td>Uygulamadaki ID</td></tr>
<tr><td><code>coins</code></td><td>evet</td><td>Yüklenecek Coin (tam sayı, metin ya da sayı)</td></tr>
<tr><td><code>delayMinutes</code></td><td>hayır</td><td><code>0</code> anında (varsayılan) · <code>5</code> beş dakika sonra (bu sürede iptal edilebilir)</td></tr>
<tr><td><code>priceTry</code></td><td>hayır</td><td>Müşteriden aldığınız tutar (TL) — Gelir-Gider raporunuz için</td></tr>
<tr><td><code>note</code></td><td>hayır</td><td>En çok 200 karakter</td></tr>
</table>
<pre><code>curl -X POST https://SUNUCU/dealer-api/v1/recharges \\
  -H "Authorization: Bearer $TRLIVE_KEY" -H "Content-Type: application/json" \\
  -d '{"clientOrderId":"SIP-10045","userId":"79924405","coins":"2000000","priceTry":"10000"}'

201 {"recharge":{"clientOrderId":"SIP-10045","userId":"79924405","coins":"2000000","status":"completed","deliverAt":null,"createdAt":"..."},
     "balance":"4266600","replay":false}</code></pre>
<p><code>status</code>: <code>completed</code> (yüklendi) · <code>scheduled</code> (5 dk sonra geçecek) · <code>cancelled</code> · <code>refunded</code> (alıcı hesabı kapandı, Coin stoğa döndü)</p>
<h3>GET /recharges/{clientOrderId} — durum</h3>
<h3>POST /recharges/{clientOrderId}/cancel — 5 dakikalık yüklemeyi iptal et</h3>
<p>Yalnızca <code>scheduled</code> durumundaki yükleme; Coin stoğunuza döner. Teslim edilmiş yükleme geri alınamaz.</p>
<h3>GET /recharges?limit=50 — son yüklemeler</h3>

<h2>Örnek: Node.js</h2>
<pre><code>const res = await fetch('https://SUNUCU/dealer-api/v1/recharges', {
  method: 'POST',
  headers: { Authorization: \`Bearer \${process.env.TRLIVE_KEY}\`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ clientOrderId: order.id, userId: order.appId, coins: String(order.coins), priceTry: String(order.total) }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error.message);</code></pre>
<h2>Örnek: PHP</h2>
<pre><code>$ch = curl_init('https://SUNUCU/dealer-api/v1/recharges');
curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . getenv('TRLIVE_KEY'), 'Content-Type: application/json'],
  CURLOPT_POSTFIELDS => json_encode(['clientOrderId' => $orderId, 'userId' => $appId, 'coins' => (string)$coins])]);
$data = json_decode(curl_exec($ch), true);</code></pre>
<p class="note">Kurallar: Coin yalnızca stoğunuzdan yüklenir; stok yetersizse istek reddedilir (400). Kendi bayi hesabınıza API ile yükleme yapılamaz.
Bayilik sözleşmesindeki tüm kurallar API işlemleri için de geçerlidir; tüm işlemler kayıt altındadır.</p>
</main></body></html>`;
}
