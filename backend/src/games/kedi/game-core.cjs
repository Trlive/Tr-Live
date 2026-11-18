/*
 * Kedi Çarkı — ortak oyun çekirdeği
 * Hem Node sunucusunda (require) hem tarayıcıda (window.GameCore) çalışır.
 * Sunucu otoriterdir: sonuç, bakiye ve ödeme her zaman burada hesaplanır.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GameCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Varsayılan yapılandırma (sunucu tarafında env/JSON ile ezilebilir)
  // ---------------------------------------------------------------------------
  const DEFAULT_CONFIG = {
    gameId: 'kedi-carki',
    title: 'Kedi Çarkı',
    currency: { name: 'Coin' },
    // Çark sırası: tepeden başlayıp saat yönünde
    items: [
      { id: 'chicken', name: 'Tavuk',   group: 'meat', mult: 45, icon: '🐔' },
      { id: 'tomato',  name: 'Domates', group: 'veg',  mult: 5,  icon: '🍅' },
      { id: 'goat',    name: 'Kuzu',    group: 'meat', mult: 15, icon: '🐐' },
      { id: 'pepper',  name: 'Biber',   group: 'veg',  mult: 5,  icon: '🫑' },
      { id: 'fish',    name: 'Balık',   group: 'meat', mult: 25, icon: '🐟' },
      { id: 'carrot',  name: 'Havuç',   group: 'veg',  mult: 5,  icon: '🥕' },
      { id: 'shrimp',  name: 'Karides', group: 'meat', mult: 10, icon: '🦐' },
      { id: 'corn',    name: 'Mısır',   group: 'veg',  mult: 5,  icon: '🌽' },
    ],
    // Özel sonuçlar: o gruptaki TÜM bahisler kendi çarpanıyla kazanır
    specials: {
      salad: { id: 'salad', name: 'Salata', group: 'veg',  icon: '🥗' },
      pizza: { id: 'pizza', name: 'Pizza',  group: 'meat', icon: '🍕' },
    },
    chips: [200, 500, 1000, 4000, 10000, 30000, 100000],
    phases: { betting: 30000, drawing: 5000, result: 5000 }, // ms
    betCloseGuardMs: 300,          // son X ms'de gelen bahisler reddedilir
    maxBetPerRound: 0,             // 0 = limitsiz (kullanıcı başına tur toplamı)
    bettingEnabled: true,          // false = bakım modu: yeni bahis alınmaz (turlar dönmeye devam eder)
    // Kol sınırı: bir oyuncu AYNI TURDA en fazla bu kadar farklı yiyeceğe (çarkın koluna) bahis yapabilir
    maxItemsPerRound: 7,           // 1–8 (8 = sınırsız; çarkta 8 kol var)
    // Genel kasa payı kontrolü: oyuncuların yatırdığı TOPLAM paranın houseShare kadarı kasada kalır,
    // geri kalanı (1 - houseShare) oyunculara ödenir. Admin panelinden canlı değiştirilebilir.
    winControl: {
      enabled: true,
      houseShare: 0.80,            // 0.80 => kasa %80, oyuncular %20
    },
    // Sonuç seçimi (winControl kapalıyken eski davranış)
    rtpControl: 'none',            // 'none' | 'adaptive'
    targetRtp: 0.95,               // adaptive modda hedef geri ödeme oranı
    maxRoundPayout: 0,             // 0 = kapalı; tek turda kasadan çıkabilecek azami tutar
    // Ödül havuzu (Salata / Pizza)
    pool: {
      contribution: 0.02,          // her bahsin havuza giden payı
      seed: 2000000,               // başlangıç havuzu
      target: 20000000,            // havuz bu seviyeye gelince şans azami olur
      baseChance: 0.006,           // havuz boşken Salata/Pizza olasılığı
      maxChance: 0.05,             // havuz hedefteyken olasılık
    },
    // Günlük bahis sandıkları
    chests: [
      { need: 2000000,  reward: 20000 },
      { need: 8000000,  reward: 90000 },
      { need: 18000000, reward: 220000 },
      { need: 40000000, reward: 520000 },
      { need: 80000000, reward: 1100000 },
    ],
    historySize: 20,
    trendSize: 100,
    hotWindow: 20,
    tickerMinWin: 50000,
    leaderboardSize: 20,
    startRound: 0, // 0 => zamana göre otomatik
  };

  function deepMerge(a, b) {
    if (!b) return JSON.parse(JSON.stringify(a));
    const out = Array.isArray(a) ? a.slice() : Object.assign({}, a);
    for (const k of Object.keys(b)) {
      const v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') out[k] = deepMerge(a[k], v);
      else out[k] = v;
    }
    return out;
  }

  function dayKey(ts) {
    return new Date(ts).toISOString().slice(0, 10); // UTC gün
  }

  // ---------------------------------------------------------------------------
  // Ödeme hesapları (saf fonksiyonlar)
  // ---------------------------------------------------------------------------
  function winningItemIds(config, outcome) {
    const sp = config.specials[outcome];
    if (sp) return config.items.filter((i) => i.group === sp.group).map((i) => i.id);
    return [outcome];
  }

  /** bets: { itemId: amount } -> kazanç */
  function payoutFor(config, bets, outcome) {
    const ids = winningItemIds(config, outcome);
    let win = 0;
    for (const id of ids) {
      const amt = bets[id] || 0;
      if (!amt) continue;
      const item = config.items.find((i) => i.id === id);
      win += amt * item.mult;
    }
    return win;
  }

  /** Bir sonucun, turdaki tüm bahisler için toplam ödemesi */
  function totalPayout(config, totals, outcome) {
    return payoutFor(config, totals, outcome);
  }

  function weightedPick(rng, entries) {
    const sum = entries.reduce((s, e) => s + e.w, 0);
    let r = rng() * sum;
    for (const e of entries) {
      r -= e.w;
      if (r <= 0) return e.id;
    }
    return entries[entries.length - 1].id;
  }

  // ---------------------------------------------------------------------------
  // Bellek içi cüzdan (geliştirme / demo). Üretimde Tr-Live cüzdan adaptörü kullanılır.
  // ---------------------------------------------------------------------------
  class MemoryWallet {
    constructor(startBalance = 1000000) {
      this.start = startBalance;
      this.balances = new Map();
      this.tx = new Map();
    }
    _get(uid) {
      if (!this.balances.has(uid)) this.balances.set(uid, this.start);
      return this.balances.get(uid);
    }
    async balance(uid) { return this._get(uid); }
    async debit(uid, amount, txId) {
      if (this.tx.has(txId)) return this.tx.get(txId);
      const b = this._get(uid);
      const res = b < amount ? { ok: false, error: 'INSUFFICIENT_FUNDS', balance: b } : { ok: true, balance: b - amount };
      if (res.ok) this.balances.set(uid, res.balance);
      this.tx.set(txId, res);
      return res;
    }
    async credit(uid, amount, txId) {
      if (this.tx.has(txId)) return this.tx.get(txId);
      const res = { ok: true, balance: this._get(uid) + amount };
      this.balances.set(uid, res.balance);
      this.tx.set(txId, res);
      return res;
    }
  }

  // ---------------------------------------------------------------------------
  // Tur motoru
  // ---------------------------------------------------------------------------
  class RoundEngine {
    constructor(opts) {
      this.config = deepMerge(JSON.parse(JSON.stringify(DEFAULT_CONFIG)), opts.config || {}); // her motorun kendi kopyası
      this.wallet = opts.wallet;
      this.botWallet = opts.botWallet || new MemoryWallet(1e15); // botlar asla gerçek cüzdana dokunmaz
      this.rng = opts.rng || Math.random;
      this.now = opts.now || (() => Date.now());
      this.setTimer = opts.setTimer || ((fn, ms) => setTimeout(fn, ms));
      this.clearTimer = opts.clearTimer || ((t) => clearTimeout(t));
      this.log = opts.log || (() => {});

      this.listeners = {};
      // Sunucu her açılışta yeni bir epoch alır; txId'ler yeniden başlatmalarda çakışmaz
      this.epoch = opts.epoch || this.now().toString(36);
      this.round = this.config.startRound || Math.floor(this.now() / 40000) % 1000000;
      this.phase = 'idle';
      this.endsAt = 0;
      this.outcome = null;
      this.bets = new Map();        // userId -> { itemId: amount }
      this.users = new Map();       // userId -> { id, name, avatar, anon }
      this.totals = {};
      this.lastBets = new Map();    // userId -> önceki turun bahisleri (BET tekrarı)
      this.history = [];            // en yeni başta, trendSize kadar
      this.pool = this.config.pool.seed;
      this.ledger = { bet: 0, win: 0, rounds: 0 };
      this.stats = new Map();       // `${day}|${uid}` -> { bet, win, record, claimed: [] }
      this.daily = new Map();       // day -> Map(uid -> win)
      this.lastTop = [];
      this.lastSettle = null;
      this._totalsTimer = null;
      this._seq = 0;
      this._pending = new Set();    // devam eden debit işlemleri
      this.ctl = { bet: 0, pay: 0, rounds: 0, since: this.now() }; // kasa payı kontrol sayaçları (sıfırlanabilir)
      this.playerStats = { rounds: 0, wins: 0 };  // gerçek oyuncu-tur sayısı / kâra geçenler
      this.roundLog = [];           // son turların özeti (yönetim paneli)
      this.lastDecision = null;
      this.unpaid = new Map();      // txId -> ödenemeyen kazanç (yeniden denenir)
      this.dirty = false;
    }

    on(ev, fn) {
      (this.listeners[ev] = this.listeners[ev] || []).push(fn);
      return () => { this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn); };
    }
    emit(ev, data) {
      for (const fn of this.listeners[ev] || []) {
        try { fn(data); } catch (e) { this.log('listener error', e); }
      }
    }

    start() { this._enter('betting'); }
    stop() { if (this._timer) this.clearTimer(this._timer); this.phase = 'stopped'; }

    // ---- durum makinesi ----------------------------------------------------
    _enter(phase) {
      const dur = this.config.phases[phase];
      this.phase = phase;
      this.endsAt = this.now() + dur;
      if (phase === 'betting') {
        this.outcome = null;
      }
      if (phase === 'drawing') {
        this.outcome = this._pickOutcome();
      }
      this.emit('phase', this.phaseInfo());
      this._timer = this.setTimer(() => this._next(), dur);
    }

    async _next() {
      if (this.phase === 'betting') {
        // Sonuç, yoldaki debit'ler bittikten SONRA seçilir; yoksa geç işlenen bahisler kontrole dahil olmaz.
        if (this._pending.size) await Promise.allSettled([...this._pending]);
        return this._enter('drawing');
      }
      if (this.phase === 'drawing') {
        // Son debit'lerin bitmesini bekle, sonra öde
        if (this._pending.size) await Promise.allSettled([...this._pending]);
        try { await this._settle(); } catch (e) { this.log('settle error', e); }
        return this._enter('result');
      }
      if (this.phase === 'result') {
        this.round += 1;
        this.bets = new Map();
        this.totals = {};
        if (this._tickerQueue && this._tickerQueue.length) this.emit('ticker', this._tickerQueue);
        this._tickerQueue = [];
        return this._enter('betting');
      }
    }

    phaseInfo() {
      return {
        round: this.round,
        phase: this.phase,
        endsAt: this.endsAt,
        duration: this.config.phases[this.phase] || 0,
        now: this.now(),
        outcome: this.phase === 'betting' ? null : this.outcome,
        winItems: this.phase === 'betting' || !this.outcome ? [] : winningItemIds(this.config, this.outcome),
      };
    }

    // ---- sonuç seçimi -------------------------------------------------------
    /** Tüm olası sonuçlar, doğal olasılıkları ve bu turdaki toplam ödemeleriyle. */
    _candidates() {
      const cfg = this.config, pc = cfg.pool, totals = this.totals;
      const fill = Math.min(1, this.pool / pc.target);
      const chance = pc.baseChance + (pc.maxChance - pc.baseChance) * fill; // Salata/Pizza toplam olasılığı
      const raw = cfg.items.map((i) => (i.weight != null ? i.weight : 1 / i.mult));
      const sum = raw.reduce((s, v) => s + v, 0);
      const out = cfg.items.map((i, k) => ({ id: i.id, w: (1 - chance) * raw[k] / sum, pay: totalPayout(cfg, totals, i.id) }));
      for (const sp of Object.keys(cfg.specials)) {
        const pay = totalPayout(cfg, totals, sp);
        if (pay <= this.pool) out.push({ id: sp, w: chance / 2, pay }); // özel sonuçlar havuzdan ödenebilmeli
      }
      return out;
    }

    _roundBet() { return Object.values(this.totals).reduce((s, v) => s + v, 0); }

    _pickOutcome() {
      const cfg = this.config, wc = cfg.winControl || {};
      let pool = this._candidates();
      const cheapest = (list) => { const m = Math.min(...list.map((c) => c.pay)); return list.filter((c) => c.pay === m); };
      this.lastDecision = null;

      // 1) Kasa koruması: tek turda azami ödeme
      if (cfg.maxRoundPayout > 0) {
        const ok = pool.filter((c) => c.pay <= cfg.maxRoundPayout);
        pool = ok.length ? ok : cheapest(pool);
      }

      const B = this._roundBet();
      if (wc.enabled && B > 0) {
        // 2) Genel kasa payı: oyunculara ödenebilecek toplam, hedef geri ödeme oranını aşmamalı.
        //    bütçe = hedefRTP × (şimdiye kadarki bahis + bu tur bahis) − şimdiye kadarki ödeme
        const share = Math.min(1, Math.max(0, Number(wc.houseShare)));
        const target = 1 - share;
        const budget = target * (this.ctl.bet + B) - this.ctl.pay;
        const ok = pool.filter((c) => c.pay <= budget);
        this.lastDecision = { budget: Math.round(budget), affordable: ok.length, of: pool.length };
        pool = ok.length ? ok : cheapest(pool); // bütçe yetmiyorsa en az ödeyen sonuç(lar)
        return weightedPick(this.rng, pool);
      }

      // 3) winControl kapalıyken: isteğe bağlı eski RTP denetimi
      let pick = weightedPick(this.rng, pool);
      if (cfg.rtpControl === 'adaptive' && this.ledger.bet > 0 && this.ledger.win / this.ledger.bet > cfg.targetRtp) {
        const alt = weightedPick(this.rng, pool);
        const pay = (id) => pool.find((c) => c.id === id).pay;
        if (pay(alt) < pay(pick)) pick = alt;
      }
      return pick;
    }

    // ---- bahis --------------------------------------------------------------
    _userStats(uid, day = dayKey(this.now())) {
      const k = day + '|' + uid;
      if (!this.stats.has(k)) this.stats.set(k, { bet: 0, win: 0, record: 0, claimed: [] });
      return this.stats.get(k);
    }

    /** Kullanıcının kalıcı rekoru (gün bağımsız) */
    _record(uid) {
      if (!this._records) this._records = new Map();
      return this._records.get(uid) || 0;
    }

    _walletFor(uid) {
      const u = this.users.get(uid);
      return u && u.bot ? this.botWallet : this.wallet;
    }

    touchUser(user) {
      this.users.set(user.id, Object.assign({}, this.users.get(user.id), user));
    }

    _maxItems() {
      const n = Math.floor(Number(this.config.maxItemsPerRound));
      return n >= 1 ? Math.min(n, this.config.items.length) : this.config.items.length;
    }
    _armsBlocked(mine, itemId) {
      const used = Object.keys(mine).filter((k) => mine[k] > 0).length;
      return !(mine[itemId] > 0) && used >= this._maxItems();
    }
    armsState(uid) {
      const max = this._maxItems(), mine = this.bets.get(uid) || {};
      const used = Object.keys(mine).filter((k) => mine[k] > 0).length;
      return { max, used, left: Math.max(0, max - used) };
    }

    async placeBet(user, itemId, amount, round) {
      const cfg = this.config;
      this.touchUser(user);
      if (cfg.bettingEnabled === false) return { ok: false, error: 'GAME_PAUSED' };
      if (this.phase !== 'betting') return { ok: false, error: 'BETTING_CLOSED' };
      if (round != null && round !== this.round) return { ok: false, error: 'WRONG_ROUND' };
      if (this.endsAt - this.now() < cfg.betCloseGuardMs) return { ok: false, error: 'BETTING_CLOSED' };
      if (!cfg.items.some((i) => i.id === itemId)) return { ok: false, error: 'BAD_ITEM' };
      amount = Number(amount);
      if (!cfg.chips.includes(amount)) return { ok: false, error: 'BAD_AMOUNT' };
      const mine = this.bets.get(user.id) || {};
      const myTotal = Object.values(mine).reduce((s, v) => s + v, 0);
      if (cfg.maxBetPerRound > 0 && myTotal + amount > cfg.maxBetPerRound) return { ok: false, error: 'LIMIT' };
      // Kol sınırı: yeni bir yiyeceğe bahis açılıyorsa, açık kol sayısı sınırı aşmamalı
      if (!user.bot && this._armsBlocked(mine, itemId)) return { ok: false, error: 'ARM_LIMIT' };

      const roundAtStart = this.round;
      const txId = `${cfg.gameId}:${this.epoch}:${roundAtStart}:${user.id}:b${++this._seq}`;
      const p = this._walletFor(user.id).debit(user.id, amount, txId, { round: roundAtStart, item: itemId });
      this._pending.add(p);
      let res;
      try { res = await p; } catch (e) { res = { ok: false, error: 'WALLET_ERROR' }; }
      finally { this._pending.delete(p); }
      if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'WALLET_ERROR', balance: res && res.balance };

      // Debit sırasında bahis kapandıysa / tur değiştiyse iade et (sonuç seçilmiş turda bahis kabul edilmez).
      // Aynı anda gelen iki bahis farklı yeni kollara düşerse kol sınırı burada da kesinleştirilir.
      // (Eşzamanlı ilk bahislerde kayıt kaybolmasın diye bahis kaydı debit SONRASI yeniden okunur.)
      const cur = this.bets.get(user.id) || {};
      const closed = this.round !== roundAtStart || this.phase !== 'betting';
      const armsRace = !closed && !user.bot && this._armsBlocked(cur, itemId);
      if (closed || armsRace) {
        const r = await this._walletFor(user.id).credit(user.id, amount, txId + ':refund', { refund: true });
        return { ok: false, error: closed ? 'BETTING_CLOSED' : 'ARM_LIMIT', balance: r.balance };
      }

      cur[itemId] = (cur[itemId] || 0) + amount;
      this.bets.set(user.id, cur);
      this.totals[itemId] = (this.totals[itemId] || 0) + amount;
      this.pool += amount * cfg.pool.contribution;
      this.ledger.bet += amount;
      if (!user.bot) this._userStats(user.id).bet += amount;
      this.dirty = true;
      this._scheduleTotals();
      return { ok: true, balance: res.balance, myBets: Object.assign({}, cur) };
    }

    async repeatLast(user) {
      const last = this.lastBets.get(user.id);
      if (!last) return { ok: false, error: 'NO_LAST_BET' };
      let res = { ok: false, error: 'NO_LAST_BET' };
      for (const [item, amt] of Object.entries(last)) {
        // Tutarı çiplere ayır (büyükten küçüğe)
        let left = amt;
        const chips = this.config.chips.slice().sort((a, b) => b - a);
        for (const c of chips) {
          while (left >= c) {
            res = await this.placeBet(user, item, c);
            if (!res.ok) return res;
            left -= c;
          }
        }
      }
      return res;
    }

    _scheduleTotals() {
      if (this._totalsTimer) return;
      this._totalsTimer = this.setTimer(() => {
        this._totalsTimer = null;
        this.emit('totals', { round: this.round, totals: Object.assign({}, this.totals), pool: Math.floor(this.pool) });
      }, 250);
    }

    // ---- ödeme --------------------------------------------------------------
    async _settle() {
      const cfg = this.config;
      const outcome = this.outcome;
      const day = dayKey(this.now());
      const perUser = {};
      const credits = [];
      let roundWin = 0, roundBet = 0, winners = 0;
      const special = !!cfg.specials[outcome];

      for (const [uid, bets] of this.bets) {
        const bet = Object.values(bets).reduce((s, v) => s + v, 0);
        const win = payoutFor(cfg, bets, outcome);
        perUser[uid] = { bet, win, balance: null };
        roundBet += bet;
        if (win > 0) {
          roundWin += win;
          const txId = `${cfg.gameId}:${this.epoch}:${this.round}:${uid}:win`;
          const meta = { round: this.round, outcome };
          credits.push(
            this._walletFor(uid).credit(uid, win, txId, meta)
              .then((r) => {
                if (r && r.ok === false) throw new Error(r.error || 'CREDIT_REJECTED');
                perUser[uid].balance = r.balance;
              })
              .catch((e) => {
                // Ödenemeyen kazanç kaybolmaz: kuyruğa alınır, sunucu/panel yeniden dener (txId aynı → idempotent)
                this.log('credit failed', uid, e);
                perUser[uid].creditFailed = true;
                this.unpaid.set(txId, { uid, amount: win, txId, meta, round: this.round, at: this.now(), tries: 1, error: String(e && e.message) });
              })
          );
        }
        const u = this.users.get(uid) || {};
        if (!u.bot) {
          this.playerStats.rounds += 1;
          if (win > bet) this.playerStats.wins += 1;
        }
        if (win > bet) winners += 1;
        if (!u.bot) {
          const st = this._userStats(uid, day);
          st.win += win;
          if (!this._records) this._records = new Map();
          if (win > (this._records.get(uid) || 0)) this._records.set(uid, win);
        }
        if (win > 0) {
          if (!this.daily.has(day)) this.daily.set(day, new Map());
          const d = this.daily.get(day);
          d.set(uid, (d.get(uid) || 0) + win);
        }
      }
      await Promise.all(credits);

      if (special) this.pool = Math.max(cfg.pool.seed * 0.25, this.pool - roundWin);
      this.ledger.win += roundWin;
      this.ledger.rounds += 1;
      if (roundBet > 0) { this.ctl.bet += roundBet; this.ctl.pay += roundWin; this.ctl.rounds += 1; }
      this.roundLog.unshift({
        round: this.round, at: this.now(), outcome, bet: roundBet, pay: roundWin, net: roundBet - roundWin,
        players: this.bets.size, winners, decision: this.lastDecision,
      });
      if (this.roundLog.length > 200) this.roundLog.length = 200;
      this.dirty = true;

      // önceki bahisleri sakla (BET tekrarı için)
      for (const [uid, bets] of this.bets) this.lastBets.set(uid, Object.assign({}, bets));

      this.history.unshift({ round: this.round, outcome });
      if (this.history.length > cfg.trendSize) this.history.length = cfg.trendSize;

      const top = Object.entries(perUser)
        .filter(([, v]) => v.win > 0)
        .sort((a, b) => b[1].win - a[1].win)
        .slice(0, 3)
        .map(([uid, v]) => this._publicUser(uid, { win: v.win }));
      this.lastTop = top;

      this._tickerQueue = top
        .filter((t) => t.win >= cfg.tickerMinWin)
        .map((t) => ({ name: t.name, avatar: t.avatar, outcome, win: t.win }));

      this.lastSettle = {
        round: this.round,
        outcome,
        special,
        winItems: winningItemIds(cfg, outcome),
        top3: top,
        history: this.recentHistory(),
        hot: this.hotItem(),
        pool: Math.floor(this.pool),
        perUser,
      };
      this.emit('result', this.lastSettle);
    }

    _publicUser(uid, extra) {
      const u = this.users.get(uid) || { id: uid, name: 'Oyuncu' };
      return Object.assign({ id: u.anon ? null : uid, name: u.anon ? 'Gizli Kullanıcı' : u.name, avatar: u.anon ? null : u.avatar || null, anon: !!u.anon }, extra);
    }

    // ---- sorgular -----------------------------------------------------------
    recentHistory(n) { return this.history.slice(0, n || this.config.historySize).map((h) => h.outcome); }

    trend() {
      const counts = {};
      for (const i of this.config.items) counts[i.id] = 0;
      counts.salad = 0; counts.pizza = 0;
      for (const h of this.history) counts[h.outcome] = (counts[h.outcome] || 0) + 1;
      return { rounds: this.history.length, counts, recent: this.history.slice(0, 40).map((h) => h.outcome) };
    }

    hotItem() {
      const win = this.history.slice(0, this.config.hotWindow);
      if (win.length < 5) return null;
      // "Hot": beklenen sıklığına göre en çok çıkan kalem
      const totalW = this.config.items.reduce((s, i) => s + 1 / i.mult, 0);
      let best = null, bestScore = 1.2;
      for (const i of this.config.items) {
        const c = win.filter((h) => h.outcome === i.id).length;
        const exp = (win.length * (1 / i.mult)) / totalW;
        const score = c / Math.max(exp, 0.5);
        if (c >= 2 && score > bestScore) { best = i.id; bestScore = score; }
      }
      return best;
    }

    userState(uid) {
      const day = dayKey(this.now());
      const st = this._userStats(uid, day);
      const d = this.daily.get(day);
      let rank = null;
      if (d && d.has(uid)) {
        const sorted = [...d.entries()].sort((a, b) => b[1] - a[1]);
        rank = sorted.findIndex(([id]) => id === uid) + 1;
      }
      return {
        todayWin: st.win,
        todayBet: st.bet,
        record: this._record(uid),
        claimed: st.claimed.slice(),
        rank,
        myBets: Object.assign({}, this.bets.get(uid) || {}),
        hasLast: this.lastBets.has(uid),
        arms: this.armsState(uid),
        paused: this.config.bettingEnabled === false,
      };
    }

    leaderboard(which) {
      const now = this.now();
      const day = which === 'yesterday' ? dayKey(now - 86400000) : dayKey(now);
      const d = this.daily.get(day) || new Map();
      return [...d.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, this.config.leaderboardSize)
        .map(([uid, win], i) => this._publicUser(uid, { rank: i + 1, win }));
    }

    async claimChest(user, index) {
      const chest = this.config.chests[index];
      if (!chest) return { ok: false, error: 'BAD_CHEST' };
      const day = dayKey(this.now());
      const st = this._userStats(user.id, day);
      if (st.claimed.includes(index)) return { ok: false, error: 'ALREADY_CLAIMED' };
      if (st.bet < chest.need) return { ok: false, error: 'NOT_REACHED' };
      st.claimed.push(index);
      let r;
      try {
        r = await this.wallet.credit(user.id, chest.reward, `${this.config.gameId}:chest:${day}:${user.id}:${index}`, { chest: index });
        if (!r || r.ok === false) throw new Error((r && r.error) || 'CREDIT_REJECTED');
      } catch (e) {
        st.claimed = st.claimed.filter((i) => i !== index); // ödeme olmadıysa sandık yanmasın
        return { ok: false, error: 'WALLET_ERROR' };
      }
      this.dirty = true;
      return { ok: true, reward: chest.reward, balance: r.balance, claimed: st.claimed.slice() };
    }

    // ---- yönetim -------------------------------------------------------------
    /** Panelden gelen kısmi ayarı doğrulayıp canlı uygular. Geçersiz değer hata fırlatır. */
    updateConfig(patch) {
      const c = this.config, out = {};
      const num = (v, lo, hi, name) => {
        v = Number(v);
        if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name}: ${lo}–${hi} arasında olmalı`);
        return v;
      };
      if (patch.winControl) {
        const w = patch.winControl;
        if (w.enabled != null) c.winControl.enabled = !!w.enabled;
        if (w.houseShare != null) c.winControl.houseShare = num(w.houseShare, 0, 1, 'Kasa payı');
      }
      if (patch.maxItemsPerRound != null) c.maxItemsPerRound = Math.floor(num(patch.maxItemsPerRound, 1, c.items.length, 'Kol sayısı'));
      if (patch.bettingEnabled != null) c.bettingEnabled = !!patch.bettingEnabled;
      if (patch.maxBetPerRound != null) c.maxBetPerRound = num(patch.maxBetPerRound, 0, 1e12, 'Tur bahis limiti');
      if (patch.maxRoundPayout != null) c.maxRoundPayout = num(patch.maxRoundPayout, 0, 1e15, 'Tur ödeme sınırı');
      this.dirty = true;
      return this.editableConfig();
    }
    editableConfig() {
      const c = this.config;
      return {
        winControl: Object.assign({}, c.winControl), maxItemsPerRound: this._maxItems(),
        bettingEnabled: c.bettingEnabled !== false, maxBetPerRound: c.maxBetPerRound, maxRoundPayout: c.maxRoundPayout,
      };
    }
    resetControl() { this.ctl = { bet: 0, pay: 0, rounds: 0, since: this.now() }; this.dirty = true; }

    /** Panel özeti */
    adminOverview() {
      const k = this.ctl;
      // Henüz sonuçlanmamış turun bahisleri kâr hesabına katılmaz
      const open = this.phase === 'result' ? 0 : this._roundBet();
      const l = Object.assign({}, this.ledger, { bet: this.ledger.bet - open });
      const ratio = (a, b) => (b > 0 ? a / b : null);
      return {
        round: this.round, phase: this.phase, endsAt: this.endsAt, now: this.now(), pool: Math.floor(this.pool),
        ledger: { bet: l.bet, win: l.win, rounds: l.rounds, profit: l.bet - l.win, rtp: ratio(l.win, l.bet) },
        control: {
          since: k.since, rounds: k.rounds, bet: k.bet, pay: k.pay, profit: k.bet - k.pay,
          rtp: ratio(k.pay, k.bet), houseShare: k.bet > 0 ? 1 - k.pay / k.bet : null,
          targetHouseShare: this.config.winControl.houseShare, enabled: this.config.winControl.enabled,
        },
        playerWinRate: ratio(this.playerStats.wins, this.playerStats.rounds),
        playerRounds: this.playerStats.rounds,
        settings: this.editableConfig(),
        labels: Object.assign({}, ...this.config.items.map((i) => ({ [i.id]: { name: i.name, icon: i.icon, mult: i.mult } })), ...Object.values(this.config.specials).map((i) => ({ [i.id]: { name: i.name, icon: i.icon } }))),
        decision: this.lastDecision,
        trend: this.trend(),
        recent: this.roundLog.slice(0, 40),
        unpaid: [...this.unpaid.values()],
      };
    }
    playersReport(limit = 100) {
      const day = dayKey(this.now()), rows = [];
      for (const [uid, u] of this.users) {
        if (u.bot) continue;
        const st = this.stats.get(day + '|' + uid) || { bet: 0, win: 0 };
        rows.push({ id: uid, name: u.name, bet: st.bet, win: st.win, net: st.win - st.bet, record: this._record(uid), arms: this.armsState(uid) });
      }
      return rows.sort((a, b) => b.bet - a.bet).slice(0, limit);
    }

    /** Ödenemeyen kazançları yeniden dener */
    async retryUnpaid() {
      let paid = 0;
      for (const [txId, u] of [...this.unpaid]) {
        try {
          const r = await this._walletFor(u.uid).credit(u.uid, u.amount, txId, u.meta);
          if (r && r.ok === false) throw new Error(r.error || 'CREDIT_REJECTED');
          this.unpaid.delete(txId); paid++;
        } catch (e) { u.tries += 1; u.error = String(e && e.message); }
      }
      if (paid) this.dirty = true;
      return { paid, left: this.unpaid.size };
    }

    // ---- kalıcılık -----------------------------------------------------------
    exportState() {
      const keepDays = new Set([dayKey(this.now()), dayKey(this.now() - 86400000)]);
      return {
        v: 1, ledger: this.ledger, pool: this.pool, ctl: this.ctl, playerStats: this.playerStats,
        history: this.history, roundLog: this.roundLog,
        stats: [...this.stats].filter(([k]) => keepDays.has(k.split('|')[0])),
        daily: [...this.daily].filter(([d]) => keepDays.has(d)).map(([d, m]) => [d, [...m]]),
        records: this._records ? [...this._records] : [], unpaid: [...this.unpaid],
      };
    }
    importState(s) {
      if (!s || s.v !== 1) return;
      Object.assign(this.ledger, s.ledger || {});
      if (typeof s.pool === 'number') this.pool = s.pool;
      if (s.ctl) this.ctl = s.ctl;
      if (s.playerStats) this.playerStats = s.playerStats;
      this.history = s.history || []; this.roundLog = s.roundLog || [];
      this.stats = new Map(s.stats || []);
      this.daily = new Map((s.daily || []).map(([d, m]) => [d, new Map(m)]));
      this._records = new Map(s.records || []);
      this.unpaid = new Map(s.unpaid || []);
    }

    publicConfig() {
      const c = this.config;
      return {
        gameId: c.gameId, title: c.title, currency: c.currency, items: c.items, specials: c.specials,
        chips: c.chips, phases: c.phases, chests: c.chests, maxBetPerRound: c.maxBetPerRound,
        maxItemsPerRound: this._maxItems(),
      };
    }

    snapshot(uid) {
      return Object.assign(this.phaseInfo(), {
        totals: Object.assign({}, this.totals),
        history: this.recentHistory(),
        hot: this.hotItem(),
        pool: Math.floor(this.pool),
        top3: this.phase === 'result' ? this.lastTop : [],
      }, uid ? { me: this.userState(uid) } : {});
    }
  }

  // ---------------------------------------------------------------------------
  // Oturum: motor olaylarını tek bir kullanıcının protokol mesajlarına çevirir.
  // Sunucu her WebSocket bağlantısı için, istemci demo modunda yerelde kullanır.
  // ---------------------------------------------------------------------------
  function createSession(engine, user, send) {
    engine.touchUser(user);
    const offs = [];
    offs.push(engine.on('phase', (p) => send({ type: 'phase', ...p })));
    offs.push(engine.on('totals', (t) => send({ type: 'totals', ...t })));
    offs.push(engine.on('ticker', (list) => send({ type: 'ticker', list })));
    offs.push(engine.on('result', (r) => {
      const mine = r.perUser[user.id] || { bet: 0, win: 0, balance: null };
      send({
        type: 'result',
        round: r.round, outcome: r.outcome, special: r.special, winItems: r.winItems,
        top3: r.top3, history: r.history, hot: r.hot, pool: r.pool,
        me: Object.assign({ bet: mine.bet, win: mine.win, balance: mine.balance }, engine.userState(user.id)),
      });
    }));

    (async () => {
      const balance = await engine.wallet.balance(user.id);
      send({
        type: 'hello',
        user: { id: user.id, name: user.name, avatar: user.avatar || null },
        balance,
        config: engine.publicConfig(),
        state: engine.snapshot(user.id),
      });
    })().catch((e) => send({ type: 'error', error: 'HELLO_FAILED', detail: String(e && e.message) }));

    async function handle(msg) {
      const reply = (data) => send(Object.assign({ type: 'ack', reqId: msg.reqId, op: msg.type }, data));
      try {
        switch (msg.type) {
          case 'bet': {
            const r = await engine.placeBet(user, msg.item, msg.amount, msg.round);
            return reply(Object.assign(r, { me: engine.userState(user.id) }));
          }
          case 'repeat': {
            const r = await engine.repeatLast(user);
            return reply(Object.assign(r, { me: engine.userState(user.id) }));
          }
          case 'leaderboard':
            return reply({ ok: true, list: engine.leaderboard(msg.which), me: engine.userState(user.id) });
          case 'trend':
            return reply({ ok: true, trend: engine.trend() });
          case 'claimChest': {
            const r = await engine.claimChest(user, msg.index);
            return reply(r);
          }
          case 'balance':
            return reply({ ok: true, balance: await engine.wallet.balance(user.id) });
          case 'ping':
            return reply({ ok: true, now: engine.now() });
          default:
            return reply({ ok: false, error: 'UNKNOWN_OP' });
        }
      } catch (e) {
        return reply({ ok: false, error: 'SERVER_ERROR' });
      }
    }

    return { handle, close: () => offs.forEach((f) => f()) };
  }

  // ---------------------------------------------------------------------------
  // Test / demo botları (üretimde KAPALI tutun)
  // ---------------------------------------------------------------------------
  const BOT_NAMES = ['Derman', 'Fırat', 'Maviş', 'Sevda', 'Ozan', 'Yunus', 'Kenan', 'Elif', 'Musa', 'Zeynep', 'Baran', 'Ece', 'Kaan', 'Defne', 'Emir', 'Nehir', 'Arda', 'Duru'];
  function attachBots(engine, count = 12, rng = Math.random) {
    const bots = Array.from({ length: count }, (_, i) => ({ id: 'bot_' + i, name: BOT_NAMES[i % BOT_NAMES.length], bot: true, anon: rng() < 0.25 }));
    bots.forEach((b) => engine.touchUser(b));
    let timer = null;
    const tick = () => {
      if (engine.phase === 'betting') {
        const n = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const b = bots[Math.floor(rng() * bots.length)];
          const item = engine.config.items[Math.floor(rng() * engine.config.items.length)];
          const chips = engine.config.chips;
          const chip = chips[Math.min(chips.length - 1, Math.floor(Math.pow(rng(), 2.2) * chips.length))];
          engine.placeBet(b, item.id, chip);
        }
      }
      timer = engine.setTimer(tick, 300 + rng() * 700);
    };
    tick();
    return () => engine.clearTimer(timer);
  }

  return { DEFAULT_CONFIG, deepMerge, dayKey, winningItemIds, payoutFor, totalPayout, MemoryWallet, RoundEngine, createSession, attachBots };
});
