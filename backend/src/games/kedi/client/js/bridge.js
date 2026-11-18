/*
 * Tr-Live köprüsü — oyun ile Tr-Live uygulaması (WebView / iframe) arasındaki iletişim.
 *
 * Oyun → Tr-Live (host):
 *   ready            {gameId}                  Oyun yüklendi, yükleniyor ekranını kapatabilirsin
 *   close            {}                        Kullanıcı oyunu kapatmak istiyor
 *   recharge         {need}                    Bakiye yetersiz → yükleme ekranını aç
 *   balance          {balance}                 Bakiye değişti (yayın ekranındaki bakiyeyi güncelle)
 *   bigWin           {win, outcome, round}     Büyük kazanç (isteğe bağlı: yayında efekt/duyuru)
 *   haptic           {style: light|success|error}
 *
 * Tr-Live (host) → Oyun:
 *   window.KediCarki.onHostMessage({type, data})  veya  window.postMessage({target:'kedi-carki', type, data})
 *   balanceRefresh   {}                        Yükleme sonrası bakiyeyi sunucudan yeniden çek
 *   mute             {muted: bool}
 *   pause / resume   {}                        Uygulama arka plana gitti / geri geldi
 *
 * Desteklenen kanallar (sırayla denenir):
 *   Android : window.TrLiveBridge.postMessage(jsonString)      (addJavascriptInterface)
 *   iOS     : window.webkit.messageHandlers.trlive.postMessage(obj)
 *   Web     : window.parent.postMessage({source:'kedi-carki', type, data}, HOST_ORIGIN)
 */
(function () {
  const qs = new URLSearchParams(location.search);
  const HOST_ORIGIN = qs.get('hostOrigin') || '*';
  const handlers = {};

  function post(type, data) {
    const msg = { source: 'kedi-carki', type, data: data || {} };
    try {
      if (window.TrLiveBridge && typeof window.TrLiveBridge.postMessage === 'function') {
        window.TrLiveBridge.postMessage(JSON.stringify(msg));
        return true;
      }
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.trlive) {
        window.webkit.messageHandlers.trlive.postMessage(msg);
        return true;
      }
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, HOST_ORIGIN);
        return true;
      }
    } catch (e) { /* host yoksa sessiz geç */ }
    return false;
  }

  function dispatch(type, data) {
    (handlers[type] || []).forEach((fn) => { try { fn(data || {}); } catch (e) { console.error(e); } });
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    if (!m || m.target !== 'kedi-carki') return;
    if (HOST_ORIGIN !== '*' && e.origin !== HOST_ORIGIN) return;
    dispatch(m.type, m.data);
  });
  document.addEventListener('visibilitychange', () => dispatch(document.hidden ? 'pause' : 'resume', {}));

  const ctx = {
    token: qs.get('token') || null,
    server: qs.get('server') || window.KC_SERVER || null,
    lang: qs.get('lang') || 'tr',
    demo: qs.get('demo') === '1',
    roomId: qs.get('roomId') || null, // hangi canlı yayından açıldığı (istatistik için)
  };

  window.TrLive = {
    ctx,
    isEmbedded: () => !!(window.TrLiveBridge || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.trlive) || window.parent !== window),
    ready: () => post('ready', { gameId: 'kedi-carki' }),
    close: () => post('close'),
    recharge: (need) => post('recharge', { need }),
    balance: (balance) => post('balance', { balance }),
    bigWin: (info) => post('bigWin', info),
    haptic: (style) => { if (!post('haptic', { style }) && navigator.vibrate) navigator.vibrate(style === 'error' ? [30, 40, 30] : 15); },
    on: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
  };
  window.KediCarki = { onHostMessage: (m) => { const o = typeof m === 'string' ? JSON.parse(m) : m; dispatch(o.type, o.data); } };
})();
