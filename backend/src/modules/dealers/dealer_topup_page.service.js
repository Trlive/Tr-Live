// Bayi bakiye talebi H5 sayfası (uygulamadaki WebView penceresinde açılır). Veritabanı gerektirmez: yalnızca HTML üretir.
// Sabit sayfa, herkes için aynı kurallar: yalnızca aktif bayi hesabı sahibi açabilir (route'ta doğrulanır). Uygulama içinde tahsilat yoktur.
export { safeVersion, renderErrorPage } from '../rooms/activities_page.routes.js';

export function renderDealerTopupPage({ appVersion, nonce }) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Bakiye Talep Et</title>
<style nonce="${nonce}">
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:#0b0906;color:#f6efdf;font:14px system-ui,-apple-system,sans-serif;padding:12px 14px calc(18px + env(safe-area-inset-bottom))}
h2{font-size:13px;color:#b3a584;font-weight:600;margin:16px 2px 8px}
.bal{display:flex;justify-content:space-between;align-items:center;background:#17130c;border:1px solid #4d3c1c;border-radius:14px;padding:12px 14px}
.bal span{color:#b3a584;font-size:12px}.bal b{color:#ffd54f;font-size:18px}
.pk{display:flex;justify-content:space-between;align-items:center;width:100%;background:#17130c;color:inherit;border:1px solid #4d3c1c;border-radius:14px;padding:12px;margin-bottom:8px;font:inherit;text-align:left}
.pk.sel{border-color:#f2b92a;background:#221b10}
.pk small{display:block;color:#b3a584;margin-top:2px}
.pk em{font-style:normal;font-size:11px;color:#1c1405;background:#f2b92a;border-radius:8px;padding:2px 8px}
textarea{width:100%;min-height:64px;background:#17130c;color:inherit;border:1px solid #4d3c1c;border-radius:12px;padding:10px;font:inherit;resize:none}
#go{width:100%;margin-top:10px;border:0;border-radius:14px;padding:13px;font:inherit;font-weight:700;color:#1c1405;background:#f2b92a}
#go:disabled{opacity:.45}
#msg{min-height:16px;font-size:12px;margin:8px 2px;color:#e5483d}#msg.ok{color:#22c55e}
.rq{display:flex;justify-content:space-between;background:#17130c;border:1px solid #4d3c1c;border-radius:12px;padding:10px 12px;margin-bottom:6px;font-size:13px}
.rq small{color:#b3a584}
.st-pending{color:#ffc43d}.st-approved{color:#22c55e}.st-rejected{color:#e5483d}
.note{color:#b3a584;font-size:12px;line-height:1.4;margin:6px 2px}
</style></head>
<body>
<div class="bal"><span id="dname">Bayi</span><b id="dbal">…</b></div>
<p class="note">Ödeme uygulama içinde alınmaz. Talebin, bedelin tarafımıza ulaştığı teyit edildikten sonra yönetici tarafından onaylanır.</p>
<h2>Toptan paket seç</h2>
<div id="pks"></div>
<h2>Not (havale referansı vb.)</h2>
<textarea id="note" maxlength="500"></textarea>
<button id="go" disabled>Talep gönder</button>
<div id="msg" role="status"></div>
<h2>Taleplerim</h2>
<div id="rqs"></div>
<script nonce="${nonce}">
(function () {
  var APP_VERSION = ${JSON.stringify(appVersion)};
  var token = null, selected = null, busy = false;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return Number(n).toLocaleString('tr-TR'); };
  var STATUS = { pending: 'Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' };
  function toApp(type) { try { window.TRLive && window.TRLive.postMessage(JSON.stringify({ type: type })); } catch (e) {} }
  function say(t, ok) { $('msg').textContent = t; $('msg').className = ok ? 'ok' : ''; }
  window.TRLiveAuth = { set: function (t) { token = t; load(); } };
  function api(path, opt) {
    opt = opt || {};
    var h = { Authorization: 'Bearer ' + token };
    if (APP_VERSION) h['X-App-Version'] = APP_VERSION;
    if (opt.body) { h['Content-Type'] = 'application/json'; h['Idempotency-Key'] = opt.key; }
    return fetch(path, { method: opt.body ? 'POST' : 'GET', headers: h, body: opt.body, cache: 'no-store' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.message || ('Hata ' + r.status));
        return d;
      });
    });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function renderPackages(list) {
    var box = $('pks'); box.textContent = '';
    list.forEach(function (p) {
      var b = el('button', 'pk' + (selected === p.code ? ' sel' : ''));
      var l = el('div'); l.appendChild(el('b', null, p.label));
      l.appendChild(el('small', null, 'Toptan bedel: ' + fmt(p.priceTry) + ' ₺ · Liste: ' + fmt(p.listTry) + ' ₺'));
      b.appendChild(l); if (p.discountPct > 0) b.appendChild(el('em', null, '%' + p.discountPct));
      b.onclick = function () { selected = p.code; $('go').disabled = busy; renderPackages(list); };
      box.appendChild(b);
    });
  }
  function renderRequests(list) {
    var box = $('rqs'); box.textContent = '';
    if (!list.length) { box.appendChild(el('p', 'note', 'Henüz talebin yok.')); return; }
    list.forEach(function (r) {
      var row = el('div', 'rq'); var l = el('div');
      l.appendChild(el('b', null, fmt(r.requestedCoins) + ' Coin'));
      l.appendChild(el('small', null, new Date(r.createdAt).toLocaleString('tr-TR')));
      row.appendChild(l); row.appendChild(el('span', 'st-' + r.status, STATUS[r.status] || r.status));
      box.appendChild(row);
    });
  }
  function load() {
    if (!token) return;
    Promise.all([api('/api/dealer/me'), api('/api/dealer/topup-requests')]).then(function (a) {
      var d = a[0].dealer || {};
      $('dname').textContent = d.name || 'Bayi'; $('dbal').textContent = fmt(d.coinBalance || 0) + ' Coin';
      renderPackages(a[1].packages || []); renderRequests(a[1].requests || []);
      toApp('refreshBalance');
    }).catch(function (e) { say(e.message); });
  }
  $('go').onclick = function () {
    if (!selected || busy) return;
    busy = true; $('go').disabled = true; say('');
    var key = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();
    api('/api/dealer/topup-requests', { body: JSON.stringify({ packageCode: selected, referenceNote: $('note').value }), key: key })
      .then(function () { say('Talebin alındı.', true); $('note').value = ''; selected = null; })
      .catch(function (e) { say(e.message); })
      .then(function () { busy = false; load(); });
  };
  toApp('getToken');
})();
</script>
</body></html>`;
}
