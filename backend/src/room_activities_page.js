// Oda içi etkinlikler H5 sayfası (uygulamadaki WebView penceresinde açılır). Veritabanı gerektirmez: yalnızca HTML üretir.
// Sayfa sabittir ve herkes için aynıdır; dış adres yüklemez. Tüm betik/stil sayfanın içindedir (nonce'lu CSP ile).

// Etkinlik kartları. Yeni etkinlik eklemek için buraya satır ekleyin (soon: true → "Yakında" görünür).
export const ACTIVITIES = [
  { id: 'memory', icon: '🃏', title: 'Hafıza Kartları', desc: 'Eşleşen kartları bul. Ücretsiz, bahissiz.', game: true },
  { id: 'daily', icon: '🎁', title: 'Günlük Ödül', desc: 'Her gün giriş yap, ödülünü al.', soon: true },
  { id: 'wheel', icon: '🎡', title: 'Şans Çarkı', desc: 'Çarkı çevir, sürpriz ödüller kazan.', soon: true },
  { id: 'rank', icon: '🏆', title: 'Haftalık Sıralama', desc: 'Odanın en cömert destekçileri.', soon: true },
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** X-App-Version başlığı yalnızca "2.91.1" gibi bir sürüm olabilir; değilse boş döner (sayfaya ham metin yazılmaz). */
export const safeVersion = (v) => (typeof v === 'string' && /^[0-9]{1,3}(\.[0-9]{1,4}){0,3}$/.test(v) ? v : '');

/** Hata sayfası (token yok/geçersiz, oda yok vb.). */
export function renderErrorPage(message, nonce) {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">body{margin:0;background:#0b0906;color:#b3a584;font:14px system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}</style>
</head><body><p>${esc(message)}</p></body></html>`;
}

/** Etkinlik sayfası. [roomId] doğrulanmış UUID, [appVersion] safeVersion'dan geçmiş olmalıdır. */
export function renderActivitiesPage({ roomId, appVersion, nonce }) {
  const cards = ACTIVITIES.map((a) => `
    <button class="card" data-id="${esc(a.id)}"${a.soon ? ' disabled' : ''}${a.game ? ' data-game="1"' : ''}>
      <span class="ico">${a.icon}</span>
      <span class="txt"><b>${esc(a.title)}</b><small>${esc(a.desc)}</small></span>
      ${a.soon ? '<em>Yakında</em>' : ''}
    </button>`).join('');
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Etkinlikler</title>
<style nonce="${nonce}">
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:#0b0906;color:#f6efdf;font:14px system-ui,-apple-system,sans-serif;padding:12px 14px calc(14px + env(safe-area-inset-bottom))}
.bal{display:flex;align-items:center;justify-content:space-between;background:#17130c;border:1px solid #4d3c1c;border-radius:14px;padding:12px 14px;margin-bottom:12px}
.bal span{color:#b3a584;font-size:12px}.bal b{color:#ffd54f;font-size:18px}
.card{display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#17130c;color:inherit;border:1px solid #4d3c1c;border-radius:14px;padding:12px;margin-bottom:10px;font:inherit}
.card:disabled{opacity:.7}
.ico{font-size:28px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:#221b10;border-radius:12px}
.txt{flex:1;display:flex;flex-direction:column;gap:2px}.txt small{color:#b3a584}
em{font-style:normal;font-size:11px;color:#1c1405;background:#f2b92a;border-radius:8px;padding:2px 8px}
#game{display:none}#game.on{display:block}#list.off{display:none}
.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.top button{background:#221b10;color:inherit;border:1px solid #4d3c1c;border-radius:10px;padding:6px 12px;font:inherit}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.tile{aspect-ratio:1;font-size:26px;background:#221b10;border:1px solid #4d3c1c;border-radius:12px;color:inherit}
.tile.up{background:#17130c;border-color:#f2b92a}.tile.done{opacity:.45}
#msg{color:#e5483d;font-size:12px;min-height:16px;margin:4px 2px}
</style></head>
<body>
<div class="bal"><span>Coin bakiyen</span><b id="coins">…</b></div>
<div id="msg" role="status"></div>
<div id="list">${cards}</div>
<div id="game"><div class="top"><b>Hafıza Kartları</b><span id="moves">Hamle: 0</span><button id="back">Geri</button></div><div class="grid" id="grid"></div><p id="win" class="bal"></p></div>
<script nonce="${nonce}">
(function () {
  var ROOM_ID = ${JSON.stringify(roomId)};
  var APP_VERSION = ${JSON.stringify(appVersion)};
  var token = null;
  var msg = document.getElementById('msg');
  function toApp(type) {
    try { window.TRLive && window.TRLive.postMessage(JSON.stringify({ type: type, roomId: ROOM_ID })); } catch (e) {}
  }
  // Uygulamadan oturum bileti: yalnızca bellekte tutulur, depolamaya yazılmaz.
  window.TRLiveAuth = { set: function (t) { token = t; loadBalance(); } };
  function api(path) {
    var h = { Authorization: 'Bearer ' + token };
    if (APP_VERSION) h['X-App-Version'] = APP_VERSION;
    return fetch(path, { headers: h, cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }
  function loadBalance() {
    if (!token) return;
    api('/api/me').then(function (d) {
      var c = d && d.user && d.user.coins;
      document.getElementById('coins').textContent = c == null ? '—' : Number(c).toLocaleString('tr-TR');
      msg.textContent = '';
    }).catch(function (e) {
      msg.textContent = e.message === '401' ? 'Oturum süresi doldu. Pencereyi kapatıp yeniden aç.' : 'Bakiye alınamadı.';
    });
  }
  // Etkinlikler açıldığında coin harcayan bir işlem sonrası uygulamaya haber ver: toApp('refreshBalance')
  window.TRLiveRefresh = function () { toApp('refreshBalance'); loadBalance(); };
  // Hafıza Kartları: tamamen istemcide, coin/bahis yok. Yeni oyun eklerken aynı biçimde bir bölüm ve data-game kartı ekleyin.
  var EMOJI = ['🎵', '🎤', '🎧', '🎹', '🥁', '🎸', '🎺', '🎻'];
  var open = [], lock = false, moves = 0, found = 0;
  function startMemory() {
    var cards = EMOJI.concat(EMOJI).map(function (e) { return { e: e, r: Math.random() }; }).sort(function (a, b) { return a.r - b.r; });
    var grid = document.getElementById('grid'); grid.textContent = '';
    open = []; lock = false; moves = 0; found = 0;
    document.getElementById('moves').textContent = 'Hamle: 0'; document.getElementById('win').textContent = '';
    cards.forEach(function (c) {
      var b = document.createElement('button'); b.className = 'tile'; b.textContent = '?';
      b.onclick = function () {
        if (lock || b.classList.contains('up') || b.classList.contains('done')) return;
        b.classList.add('up'); b.textContent = c.e; open.push({ b: b, e: c.e });
        if (open.length < 2) return;
        moves++; document.getElementById('moves').textContent = 'Hamle: ' + moves; lock = true;
        var x = open[0], y = open[1]; open = [];
        setTimeout(function () {
          if (x.e === y.e) { x.b.className = y.b.className = 'tile done'; found++; if (found === EMOJI.length) document.getElementById('win').textContent = 'Tebrikler! ' + moves + ' hamlede bitirdin.'; }
          else { x.b.className = y.b.className = 'tile'; x.b.textContent = y.b.textContent = '?'; }
          lock = false;
        }, 700);
      };
      grid.appendChild(b);
    });
  }
  document.querySelectorAll('[data-game]').forEach(function (b) {
    b.onclick = function () { document.getElementById('list').className = 'off'; document.getElementById('game').className = 'on'; startMemory(); };
  });
  document.getElementById('back').onclick = function () { document.getElementById('game').className = ''; document.getElementById('list').className = ''; };
  toApp('getToken');
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loadBalance(); });
})();
</script>
</body></html>`;
}
