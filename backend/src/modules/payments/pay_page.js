// /pay sayfası: tek dosya HTML (harici kaynak yok; CSP nonce). Akış: ID → alıcıyı gör → paket → yöntem → öde → durum.
export function renderPayPage({ nonce }) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>TR Live Coin Yükle</title>
<style nonce="${nonce}">
:root{--bg:#0b0906;--card:#17130c;--line:#4d3c1c;--gold:#f2b92a;--dim:#b3a584;--txt:#f6efdf;--ok:#22c55e;--bad:#e5483d}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--txt);font:15px system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:560px;margin:0 auto;padding:16px 16px calc(28px + env(safe-area-inset-bottom))}
h1{font-size:20px;margin:6px 0 2px}h2{font-size:13px;color:var(--dim);font-weight:600;margin:20px 2px 8px;text-transform:uppercase;letter-spacing:.04em}
p.sub{color:var(--dim);margin:0 0 8px;font-size:13px}
.row{display:flex;gap:8px}
input{flex:1;min-width:0;background:var(--card);color:inherit;border:1px solid var(--line);border-radius:12px;padding:12px;font:inherit}
button{font:inherit;cursor:pointer}
.btn{border:0;border-radius:12px;padding:12px 16px;font-weight:700;color:#1c1405;background:var(--gold)}
.btn:disabled{opacity:.45;cursor:default}
.who{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin-top:10px}
.who img,.who .av{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#2a2112}
.who b{display:block}.who small{color:var(--dim)}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
@media (max-width:380px){.grid{grid-template-columns:repeat(2,1fr)}}
.pk{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 6px;text-align:center;color:inherit}
.pk.sel{border-color:var(--gold);background:#221b10;box-shadow:0 0 0 1px var(--gold) inset}
.pk b{display:block;font-size:16px;color:#ffd54f}.pk .bn{display:block;font-size:11px;color:var(--ok);min-height:14px}.pk span{display:block;margin-top:4px;font-weight:700}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:9px 14px;color:inherit}
.chip.sel{border-color:var(--gold);color:var(--gold)}
#msg{min-height:18px;font-size:13px;margin:10px 2px;color:var(--bad)}#msg.ok{color:var(--ok)}
.pay{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:12px}
.pay .k{color:var(--dim);font-size:12px;margin-top:10px}.pay .v{font-size:16px;word-break:break-all;display:flex;justify-content:space-between;gap:8px;align-items:center}
.copy{background:transparent;border:1px solid var(--line);color:var(--gold);border-radius:8px;padding:4px 10px;font-size:12px}
.warn{color:#ffc43d;font-size:12px;margin-top:10px;line-height:1.45}
iframe{width:100%;height:640px;border:0;border-radius:12px;background:#fff;margin-top:12px}
.done{text-align:center;padding:28px 10px}.done b{font-size:22px;display:block;margin:8px 0;color:var(--ok)}
.hide{display:none}#em{margin-top:10px}.wide{width:100%;margin-top:16px}.pre{white-space:pre-wrap}
footer{color:var(--dim);font-size:11px;line-height:1.5;margin-top:26px}
</style></head>
<body><main>
<h1>Coin Yükle</h1>
<p class="sub">Uygulamadaki ID numaranla hesabına Coin yükle. Ödeme onaylanınca Coin otomatik eklenir.</p>
<section id="s-form">
  <h2>1 · Hesap</h2>
  <div class="row"><input id="pid" inputmode="numeric" autocomplete="off" placeholder="ID (Profil → ID numarası)" maxlength="12"><button class="btn" id="find">Ara</button></div>
  <div id="who" class="who hide"></div>
  <h2>2 · Paket</h2>
  <div id="pks" class="grid"></div>
  <h2>3 · Ödeme yöntemi</h2>
  <div id="pvs" class="chips"></div>
  <div id="em" class="hide"><input id="email" type="email" autocomplete="email" placeholder="E-posta (makbuz için, isteğe bağlı)"></div>
  <button class="btn wide" id="go" disabled>Öde</button>
  <div id="msg" role="status"></div>
</section>
<section id="s-pay" class="hide"></section>
<footer>Coin, dijital içeriktir ve yalnızca uygulama içinde kullanılır. Yükleme, belirtilen ID'ye yapılır; yanlış ID'ye yapılan yükleme geri alınamaz.
Sorun yaşarsan uygulamada Ayarlar → Destek'ten sipariş numarasıyla yaz.</footer>
</main>
<script nonce="${nonce}">
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var st = { user: null, pkg: null, prov: null, cfg: null, order: null, timer: null };
  var fmt = function (n) { return Number(n).toLocaleString('tr-TR'); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function say(t, ok) { $('msg').textContent = t || ''; $('msg').className = ok ? 'ok' : ''; }
  function api(path, body) {
    return fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.message || ('Hata ' + r.status)); return d; }); });
  }
  function ready() { $('go').disabled = !(st.user && st.pkg && st.prov); }
  function renderPkgs() {
    var box = $('pks'); box.textContent = '';
    (st.cfg.packages || []).forEach(function (p) {
      var b = el('button', 'pk' + (st.pkg === p.id ? ' sel' : ''));
      b.appendChild(el('b', null, fmt(p.coins)));
      b.appendChild(el('small', 'bn', Number(p.bonusCoins) > 0 ? '+' + fmt(p.bonusCoins) + ' ek' : ''));
      b.appendChild(el('span', null, fmt(p.priceTry) + ' ₺'));
      b.onclick = function () { st.pkg = p.id; renderPkgs(); ready(); };
      box.appendChild(b);
    });
  }
  function renderProvs() {
    var box = $('pvs'); box.textContent = '';
    var list = st.cfg.providers || [];
    if (!list.length) box.appendChild(el('p', 'sub', 'Şu an kullanılabilir ödeme yöntemi yok.'));
    list.forEach(function (p) {
      var b = el('button', 'chip' + (st.prov === p.id ? ' sel' : ''), p.name);
      b.onclick = function () { st.prov = p.id; $('em').className = p.id === 'paytr' ? '' : 'hide'; renderProvs(); ready(); };
      box.appendChild(b);
    });
  }
  function find() {
    var id = $('pid').value.replace(/\\D/g, ''); say('');
    if (!id) return say('ID numaranı gir.');
    st.user = null; ready();
    api('/pay/api/lookup?id=' + encodeURIComponent(id)).then(function (d) {
      st.user = d.user; var w = $('who'); w.textContent = ''; w.className = 'who';
      if (d.user.avatarUrl) { var i = el('img'); i.alt = ''; i.onerror = function () { i.replaceWith(el('div', 'av')); }; i.src = d.user.avatarUrl; w.appendChild(i); } else w.appendChild(el('div', 'av'));
      var t = el('div'); t.appendChild(el('b', null, d.user.displayName)); t.appendChild(el('small', null, 'ID: ' + d.user.publicId)); w.appendChild(t);
      ready();
    }).catch(function (e) { $('who').className = 'who hide'; say(e.message); });
  }
  function line(box, k, v, copy) {
    box.appendChild(el('div', 'k', k)); var r = el('div', 'v'); r.appendChild(el('span', null, v));
    if (copy) { var c = el('button', 'copy', 'Kopyala'); c.onclick = function () { try { navigator.clipboard.writeText(v); c.textContent = 'Kopyalandı'; } catch (e) {} }; r.appendChild(c); }
    box.appendChild(r);
  }
  function showOrder(o) {
    st.order = o; $('s-form').className = 'hide'; var s = $('s-pay'); s.className = ''; s.textContent = '';
    if (o.status === 'paid') {
      var d = el('div', 'done'); d.appendChild(el('div', null, '✅')); d.appendChild(el('b', null, fmt(o.totalCoins) + ' Coin yüklendi'));
      d.appendChild(el('p', 'sub', 'Sipariş: ' + o.orderNo)); s.appendChild(d); stop(); return;
    }
    if (o.status !== 'created') {
      var f = el('div', 'done'); f.appendChild(el('div', null, o.status === 'expired' ? '⌛' : '⚠️'));
      f.appendChild(el('p', null, o.status === 'expired' ? 'Siparişin süresi doldu. Ödeme yaptıysan birkaç dakika içinde yine eklenir; eklenmezse destekle iletişime geç.' : 'Ödeme tamamlanmadı.'));
      f.appendChild(el('p', 'sub', 'Sipariş: ' + o.orderNo)); var again = el('button', 'btn', 'Yeniden dene'); again.onclick = function () { location.href = '/pay'; };
      f.appendChild(again); s.appendChild(f); stop(); return;
    }
    var box = el('div', 'pay'); s.appendChild(box);
    box.appendChild(el('b', null, fmt(o.totalCoins) + ' Coin · ' + o.amount + ' ' + (o.currency === 'USDT' ? 'USDT' : '₺')));
    line(box, 'Sipariş numarası', o.orderNo, true);
    var p = o.pay || {};
    if (p.type === 'redirect' && p.url) {
      var fr = el('iframe'); fr.src = p.url; fr.setAttribute('allow', 'payment'); s.appendChild(fr);
    } else if (p.type === 'crypto') {
      line(box, 'Ağ', p.network); line(box, 'Adres', p.address, true); line(box, 'Gönderilecek tutar (USDT)', p.amount, true);
      box.appendChild(el('p', 'warn', p.warning)); box.appendChild(el('p', 'sub', 'Son geçerlilik: ' + new Date(o.expiresAt).toLocaleString('tr-TR') + ' · Ödeme ağda onaylanınca bu sayfa kendiliğinden güncellenir.'));
    } else if (p.type === 'bank') {
      box.appendChild(el('div', 'k', 'Havale bilgisi')); var pre = el('div', 'v pre'); pre.textContent = p.info; box.appendChild(pre);
      line(box, 'Tutar (₺)', p.amount, true); line(box, 'Açıklama', p.reference, true); box.appendChild(el('p', 'warn', p.warning));
    }
    poll();
  }
  function stop() { if (st.timer) clearTimeout(st.timer); st.timer = null; }
  function poll() {
    stop(); if (!st.order) return;
    st.timer = setTimeout(function () {
      api('/pay/api/orders/' + st.order.orderNo).then(function (d) { if (d.order.status !== st.order.status) showOrder(d.order); else poll(); }).catch(poll);
    }, 4000);
  }
  $('find').onclick = find;
  $('pid').addEventListener('keydown', function (e) { if (e.key === 'Enter') find(); });
  $('go').onclick = function () {
    if ($('go').disabled) return; $('go').disabled = true; say('');
    api('/pay/api/orders', { publicId: st.user.publicId, packageId: st.pkg, provider: st.prov, email: $('email').value.trim() || undefined })
      .then(function (d) { try { history.replaceState(null, '', '/pay/done?o=' + d.order.orderNo); } catch (e) {} showOrder(d.order); })
      .catch(function (e) { say(e.message); ready(); });
  };
  var q = new URLSearchParams(location.search);
  var o = q.get('o');
  if (o && /^TR[A-Z0-9]{16}$/.test(o)) {
    api('/pay/api/orders/' + o).then(function (d) { showOrder(d.order); }).catch(function (e) { say(e.message); });
  }
  api('/pay/api/config').then(function (c) {
    st.cfg = c;
    if (!c.enabled) { say('Web yüklemesi şu an kapalı.'); $('find').disabled = true; return; }
    renderPkgs(); renderProvs();
    var pre = q.get('id'); if (pre && /^\\d{5,12}$/.test(pre)) { $('pid').value = pre; find(); }
  }).catch(function (e) { say(e.message); });
})();
</script>
</body></html>`;
}
