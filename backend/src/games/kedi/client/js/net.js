/*
 * Ağ katmanı. İki taşıyıcı aynı protokolü konuşur:
 *   RemoteTransport : gerçek oyun sunucusu (WebSocket)
 *   LocalTransport  : tarayıcı içinde çalışan motor + botlar (demo / tasarım önizleme)
 * Arayüz: t.onMessage = fn; t.onStatus = fn('connecting'|'online'|'offline'|'demo'); t.request(msg) -> Promise<ack>
 */
(function () {
  let reqSeq = 0;

  class RemoteTransport {
    constructor(url) {
      this.url = url;
      this.pending = new Map();
      this.retry = 0;
      this.onMessage = () => {};
      this.onStatus = () => {};
      this.closedByServer = false;
    }
    connect() {
      this.onStatus('connecting');
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => { this.retry = 0; this.onStatus('online'); };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.type === 'ack' && this.pending.has(m.reqId)) {
          const p = this.pending.get(m.reqId); this.pending.delete(m.reqId); clearTimeout(p.to); p.resolve(m);
          return;
        }
        this.onMessage(m);
      };
      ws.onclose = (e) => {
        this.onStatus('offline');
        for (const [, p] of this.pending) { clearTimeout(p.to); p.resolve({ ok: false, error: 'DISCONNECTED' }); }
        this.pending.clear();
        if (e.code === 4001 || e.code === 4002) { this.closedByServer = e.code; this.onMessage({ type: 'fatal', code: e.code }); return; }
        const delay = Math.min(10000, 500 * Math.pow(2, this.retry++));
        setTimeout(() => this.connect(), delay);
      };
    }
    request(msg) {
      return new Promise((resolve) => {
        if (!this.ws || this.ws.readyState !== 1) return resolve({ ok: false, error: 'DISCONNECTED' });
        const reqId = ++reqSeq;
        const to = setTimeout(() => { this.pending.delete(reqId); resolve({ ok: false, error: 'TIMEOUT' }); }, 8000);
        this.pending.set(reqId, { resolve, to });
        this.ws.send(JSON.stringify(Object.assign({ reqId }, msg)));
      });
    }
  }

  class LocalTransport {
    constructor() {
      this.onMessage = () => {};
      this.onStatus = () => {};
      this.waiters = new Map();
    }
    connect() {
      const G = window.GameCore;
      const engine = new G.RoundEngine({ wallet: new G.MemoryWallet(1000000), config: { tickerMinWin: 20000 } });
      // Demo geçmişini doldur ki trend ekranı boş görünmesin
      const ids = engine.config.items.map((i) => ({ id: i.id, w: 1 / i.mult }));
      const sum = ids.reduce((s, e) => s + e.w, 0);
      for (let k = 0; k < 60; k++) {
        let r = Math.random() * sum, pick = ids[0].id;
        for (const e of ids) { r -= e.w; if (r <= 0) { pick = e.id; break; } }
        engine.history.push({ round: engine.round - k - 1, outcome: pick });
      }
      G.attachBots(engine, 14);
      engine.start();
      this.engine = engine;
      // Ağ gecikmesini taklit et; mesajı kopyala ki motor durumu paylaşılmasın
      this.session = G.createSession(engine, { id: 'demo_me', name: 'Sen (Demo)' }, (m) => {
        const copy = JSON.parse(JSON.stringify(m));
        setTimeout(() => this._incoming(copy), 30);
      });
      this.onStatus('demo');
    }
    _incoming(m) {
      if (m.type === 'ack' && this.waiters.has(m.reqId)) {
        const r = this.waiters.get(m.reqId); this.waiters.delete(m.reqId); r(m); return;
      }
      this.onMessage(m);
    }
    request(msg) {
      return new Promise((resolve) => {
        const reqId = ++reqSeq;
        this.waiters.set(reqId, resolve);
        this.session.handle(Object.assign({ reqId }, msg));
      });
    }
  }

  async function chooseTransport() {
    const ctx = window.TrLive.ctx;
    if (ctx.demo) return new LocalTransport();
    let wsUrl = ctx.server;
    if (!wsUrl && /^https?:$/.test(location.protocol)) wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws/kedi';
    if (!wsUrl) return new LocalTransport();
    const token = ctx.token || safeGet('kc_dev_token') || 'dev:' + Math.floor(Math.random() * 1e6) + ':Misafir';
    if (!ctx.token) safeSet('kc_dev_token', token);
    return new RemoteTransport(wsUrl + (wsUrl.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token));
  }
  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* yok */ } }

  window.KCNet = { chooseTransport, RemoteTransport, LocalTransport };
})();
