/* Kedi Çarkı — arayüz denetleyicisi */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const app = $('app');

  const S = {
    cfg: null, user: null, balance: 0,
    round: 0, phase: 'idle', endsAt: 0, duration: 0, offset: 0,
    totals: {}, myBets: {}, history: [], hot: null, me: {},
    chip: 0, outcome: null, winItems: [], muted: false,
    lastLit: 0, spin: null, lastSec: null, betRoundPending: 0,
  };
  let T = null;

  // --------------------------------------------------------------- yardımcılar
  const fmt = (n) => Math.floor(n || 0).toLocaleString('en-US');
  const short = (n) => {
    if (n >= 1e6) return +(n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M';
    if (n >= 1e3) return +(n / 1e3).toFixed(n % 1e3 ? 1 : 0) + 'K';
    return String(n);
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const coinSvg = '<svg class="coin"><use href="#i-coin"/></svg>';
  const serverNow = () => Date.now() + S.offset;
  const itemById = (id) => S.cfg.items.find((i) => i.id === id) || S.cfg.specials[id];
  const iconOf = (id) => (itemById(id) || {}).icon || '❔';
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yok */ } };

  const ERR = {
    BETTING_CLOSED: 'Bahisler kapandı, sonraki turu bekle',
    WRONG_ROUND: 'Tur değişti, tekrar dene',
    INSUFFICIENT_FUNDS: 'Yetersiz bakiye',
    LIMIT: 'Bu tur için bahis limitine ulaştın',
    NO_LAST_BET: 'Tekrarlanacak önceki bahis yok',
    DISCONNECTED: 'Bağlantı koptu, yeniden bağlanılıyor…',
    TIMEOUT: 'Sunucu yanıt vermedi',
    ALREADY_CLAIMED: 'Bu sandığı bugün zaten açtın',
    NOT_REACHED: 'Sandık seviyesine henüz ulaşmadın',
    RATE_LIMIT: 'Çok hızlı! Biraz yavaşla',
    ARM_LIMIT: 'Aynı turda en fazla ${N} kola bahis yapabilirsin',
    GAME_PAUSED: 'Oyun şu an bakımda, birazdan tekrar dene',
    WALLET_ERROR: 'Bakiye işlemi yapılamadı, tekrar dene',
  };
  const errText = (e) => { const m = ERR[e] || 'Bir hata oluştu (' + e + ')'; return m.includes('${N}') ? m.replace('${N}', armsInfo().max) : m; };

  function avatarHtml(el, user) {
    if (!el) return;
    if (user && user.avatar) { el.style.backgroundImage = `url("${encodeURI(user.avatar)}")`; el.textContent = ''; return; }
    const name = (user && user.name) || '?';
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    el.style.backgroundImage = '';
    el.style.backgroundColor = user && user.anon ? '#6c6f8f' : `hsl(${h} 55% 45%)`;
    el.textContent = user && user.anon ? '👤' : name.trim().charAt(0).toUpperCase();
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 1800);
  }

  // --------------------------------------------------------------- ses
  const Sound = {
    ctx: null,
    ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* yok */ } } return this.ctx; },
    beep(freq, dur = 0.06, type = 'square', vol = 0.05, when = 0) {
      if (S.muted) return;
      const c = this.ensure(); if (!c || c.state !== 'running') return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, c.currentTime + when);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
      o.connect(g).connect(c.destination);
      o.start(c.currentTime + when); o.stop(c.currentTime + when + dur + 0.02);
    },
    chip() { this.beep(900, 0.05, 'triangle', 0.07); },
    tick() { this.beep(1250, 0.025, 'square', 0.02); },
    count() { this.beep(700, 0.06, 'sine', 0.05); },
    win() { [523, 659, 784, 1046].forEach((f, i) => this.beep(f, 0.2, 'triangle', 0.07, i * 0.1)); },
    lose() { this.beep(330, 0.18, 'sine', 0.05); this.beep(247, 0.25, 'sine', 0.05, 0.16); },
  };
  document.addEventListener('pointerdown', () => { const c = Sound.ensure(); if (c && c.state === 'suspended') c.resume(); }, { passive: true });

  // --------------------------------------------------------------- inşa
  const R = 37, CX = 50, CY = 50, VB_H = 106; // çark geometrisi (viewBox birimi)
  function slotPos(i, n) {
    const a = (-90 + (360 / n) * i) * Math.PI / 180;
    return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  }

  function buildWheel() {
    const wheel = $('wheel');
    const n = S.cfg.items.length;
    // çerçeve: ayaklar, kollar, çiviler
    let svg = '';
    svg += `<g stroke="#6b3a12" stroke-width="1" stroke-linejoin="round">
      <path d="M47 52 L22 102 L29 102 L51 56Z" fill="url(#g-wood)"/>
      <path d="M53 52 L78 102 L71 102 L49 56Z" fill="url(#g-wood)"/>
      <path d="M30 86 H70" stroke-width="3.2" stroke="#8b5426"/>
      <rect x="16" y="101" width="20" height="3.4" rx="1.2" fill="#c98a4b"/>
      <rect x="64" y="101" width="20" height="3.4" rx="1.2" fill="#c98a4b"/>
    </g>`;
    for (let i = 0; i < n; i++) {
      const p = slotPos(i, n);
      svg += `<line x1="${CX}" y1="${CY}" x2="${p.x}" y2="${p.y}" stroke="#6b3a12" stroke-width="3.6" stroke-linecap="round"/>`;
      svg += `<line x1="${CX}" y1="${CY}" x2="${p.x}" y2="${p.y}" stroke="#c98a4b" stroke-width="2.2" stroke-linecap="round"/>`;
      const m = { x: CX + (p.x - CX) * 0.62, y: CY + (p.y - CY) * 0.62 };
      svg += `<circle cx="${m.x}" cy="${m.y}" r="1.1" fill="#fff3c4" stroke="#6b3a12" stroke-width=".5"/>`;
    }
    $('wheelFrame').innerHTML = svg;

    wheel.querySelectorAll('.slot').forEach((e) => e.remove());
    S.cfg.items.forEach((it, i) => {
      const p = slotPos(i, n);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'slot';
      el.dataset.id = it.id;
      el.dataset.idx = i;
      el.style.left = p.x + '%';
      el.style.top = (p.y / VB_H) * 100 + '%';
      el.setAttribute('aria-label', `${it.name} x${it.mult}`);
      el.innerHTML = `<div class="liquid"></div><span class="ico">${it.icon}</span><span class="mult">x${it.mult}</span>
        <span class="total"></span><span class="mine">${coinSvg}<b></b></span><span class="hot">Hot</span>`;
      el.addEventListener('click', () => placeBet(it.id));
      wheel.appendChild(el);
    });

    const bulbs = $('bulbs');
    bulbs.innerHTML = '';
    for (let i = 0; i < 14; i++) {
      const b = document.createElement('i');
      b.style.transform = `rotate(${i * (360 / 14)}deg) translate(13.2cqw)`;
      b.style.animationDelay = (i % 2) * 0.3 + 's';
      bulbs.appendChild(b);
    }
  }

  const CHIP_COLORS = [
    ['#8fe0ff', '#2a8fd6'], ['#9af07f', '#2fae3b'], ['#ffc879', '#f07a12'], ['#dba4ff', '#8e3fe0'],
    ['#ff9a9a', '#d8263c'], ['#ffe68a', '#d99a0b'], ['#ffaee6', '#c92a8f'],
  ];
  function buildChips() {
    const box = $('chips');
    box.innerHTML = '';
    S.cfg.chips.forEach((v, i) => {
      const [c1, c2] = CHIP_COLORS[i % CHIP_COLORS.length];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (i === S.chip ? ' on' : '');
      b.style.setProperty('--c1', c1); b.style.setProperty('--c2', c2);
      b.innerHTML = `<span class="tok"></span><span class="val">${v >= 10000 ? short(v) : fmt(v)}</span>`;
      b.addEventListener('click', () => { S.chip = i; safeSet('kc_chip', String(i)); renderChips(); Sound.chip(); });
      box.appendChild(b);
    });
  }

  function buildChests() {
    const box = $('chests');
    box.innerHTML = '<div class="track"><i></i></div>';
    S.cfg.chests.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chest'; b.dataset.idx = i;
      b.innerHTML = `<svg viewBox="0 0 48 40"><use href="#i-chest"/></svg><span>${short(c.need)}</span>`;
      b.addEventListener('click', () => onChest(i));
      box.appendChild(b);
    });
  }

  // --------------------------------------------------------------- çizim
  function renderSlots() {
    if (!S.cfg) return;
    const sum = Object.values(S.totals).reduce((s, v) => s + v, 0) || 1;
    document.querySelectorAll('.slot').forEach((el) => {
      const id = el.dataset.id;
      const tot = S.totals[id] || 0, mine = S.myBets[id] || 0;
      el.querySelector('.total').textContent = tot ? short(tot) : '';
      el.querySelector('.mine b').textContent = mine ? short(mine) : '';
      el.classList.toggle('has-bet', mine > 0);
      el.classList.toggle('is-hot', S.hot === id);
      el.style.setProperty('--lvl', (40 + Math.min(22, (tot / sum) * 40)) + '%');
    });
    renderArms();
  }

  function renderChips() {
    document.querySelectorAll('.chip').forEach((el, i) => {
      el.classList.toggle('on', i === S.chip);
      el.classList.toggle('poor', S.cfg.chips[i] > S.balance);
    });
  }

  function renderStrip(animate) {
    const box = $('resStrip');
    box.innerHTML = S.history.length ? '' : '<span class="res-empty">Henüz sonuç yok — ilk tur oynanıyor</span>';
    S.history.slice(0, 12).forEach((id, i) => {
      const d = document.createElement('span');
      d.className = 'res-dot' + (i === 0 ? ' new' : '') + (S.cfg.specials[id] ? ' special' : '') + (i === 0 && animate ? ' enter' : '');
      d.textContent = iconOf(id);
      box.appendChild(d);
    });
  }

  function renderStats() {
    const me = S.me || {};
    $('stToday').textContent = fmt(me.todayWin);
    $('stRecord').textContent = fmt(me.record);
    $('stBalance').textContent = fmt(S.balance);
    $('dailyBet').textContent = fmt(me.todayBet);
    const chests = S.cfg.chests;
    const bet = me.todayBet || 0;
    const next = chests.find((c) => c.need > bet);
    $('dailyNext').textContent = next ? fmt(next.need) : 'Tümü tamam 🎉';
    // ilerleme çubuğu (ilk sandıktan sona)
    let pct = 0;
    if (bet >= chests[chests.length - 1].need) pct = 100;
    else {
      const k = chests.findIndex((c) => c.need > bet);
      if (k > 0) pct = ((k - 1) + (bet - chests[k - 1].need) / (chests[k].need - chests[k - 1].need)) / (chests.length - 1) * 100;
    }
    const tr = document.querySelector('.chests .track i'); if (tr) tr.style.width = pct + '%';
    const claimed = me.claimed || [];
    document.querySelectorAll('.chest').forEach((el) => {
      const i = +el.dataset.idx;
      el.classList.toggle('done', claimed.includes(i));
      el.classList.toggle('ready', !claimed.includes(i) && bet >= chests[i].need);
    });
    $('rkNo').textContent = me.rank || '-';
    $('rkName').textContent = S.user ? S.user.name : '—';
    $('rkWin').textContent = fmt(me.todayWin);
    $('btnRepeat').disabled = !me.hasLast;
    renderArms();
    renderChips();
  }

  // Kol sınırı: aynı turda en fazla N farklı yiyeceğe bahis. Kalan kol üstte, dolunca boş kollar kilitlenir.
  function armsInfo() {
    const max = (S.me && S.me.arms && S.me.arms.max) || (S.cfg && S.cfg.maxItemsPerRound) || 8;
    const used = Object.keys(S.myBets).filter((k) => S.myBets[k] > 0).length;
    return { max, used, left: Math.max(0, max - used), full: used >= max && max < S.cfg.items.length };
  }
  function armBlocked(id) { const a = armsInfo(); return a.full && !(S.myBets[id] > 0); }
  function renderArms() {
    const a = armsInfo(), box = $('armsBox');
    box.hidden = a.max >= S.cfg.items.length;
    $('armsLeft').textContent = `${a.left}/${a.max}`;
    box.classList.toggle('empty', a.left === 0);
    $('helpLimit').hidden = box.hidden; $('helpArmsMax').textContent = a.max;
    document.querySelectorAll('.slot').forEach((el) => el.classList.toggle('locked', a.full && !(S.myBets[el.dataset.id] > 0)));
  }

  function setHub(title, time, badge) {
    $('hubTitle').textContent = title;
    $('hubTime').textContent = time || '';
    $('hubTime').hidden = !time;
    const b = $('hubBadge');
    if (badge != null) { b.hidden = false; b.textContent = badge; } else b.hidden = true;
  }

  function clearMarks() {
    document.querySelectorAll('.slot').forEach((e) => e.classList.remove('lit', 'win'));
    $('wheel').classList.remove('resolved');
    $('spSalad').classList.remove('win'); $('spPizza').classList.remove('win');
    $('hub').classList.remove('cheer');
  }
  function setLit(idx) {
    document.querySelectorAll('.slot').forEach((e) => e.classList.toggle('lit', +e.dataset.idx === idx));
  }
  function markWinners() {
    if (!S.outcome) return;
    document.querySelectorAll('.slot').forEach((e) => {
      e.classList.remove('lit');
      e.classList.toggle('win', S.winItems.includes(e.dataset.id));
    });
    $('wheel').classList.add('resolved');
    if (S.outcome === 'salad') $('spSalad').classList.add('win');
    if (S.outcome === 'pizza') $('spPizza').classList.add('win');
  }

  // --------------------------------------------------------------- faz yönetimi
  function applyPhase(p) {
    S.offset = p.now - Date.now();
    const newRound = p.round !== S.round;
    S.round = p.round; S.phase = p.phase; S.endsAt = p.endsAt; S.duration = p.duration;
    $('roundNo').textContent = p.round;
    $('bulbs').classList.toggle('run', p.phase !== 'betting');

    if (p.phase === 'betting') {
      if (newRound) { S.totals = {}; S.myBets = {}; }
      S.outcome = null; S.winItems = []; S.spin = null;
      clearMarks();
      $('resultSheet').hidden = true;
      setHub('Zamanı Seç', '');
      renderSlots(); renderStats();
    } else if (p.phase === 'drawing') {
      S.outcome = p.outcome; S.winItems = p.winItems || [];
      setHub('Sonuçlar geliyor…', '', '');
      startSpin(p);
    } else if (p.phase === 'result') {
      S.outcome = p.outcome; S.winItems = p.winItems || [];
      if (S.spin) finishSpin();
      setHub('Show Time', '');
      markWinners();
    }
  }

  function startSpin(p) {
    const n = S.cfg.items.length;
    const special = !!S.cfg.specials[p.outcome];
    const target = special ? (S.lastLit + 3) % n : S.cfg.items.findIndex((i) => i.id === p.outcome);
    const from = S.lastLit;
    S.spin = {
      start: p.endsAt - p.duration, dur: Math.max(800, p.duration - 450),
      from, total: 3 * n + ((target - from + n) % n), step: -1, target,
    };
  }
  function spinFrame(now) {
    const sp = S.spin; if (!sp) return;
    const t = Math.min(1, Math.max(0, (now - sp.start) / sp.dur));
    const e = 1 - Math.pow(1 - t, 3);
    const step = Math.floor(e * sp.total + 1e-6);
    if (step !== sp.step) {
      sp.step = step;
      setLit((sp.from + step) % S.cfg.items.length);
      Sound.tick();
    }
    if (t >= 1) finishSpin();
  }
  function finishSpin() {
    if (!S.spin) return;
    S.lastLit = S.spin.target;
    S.spin = null;
    markWinners();
  }

  // --------------------------------------------------------------- sonuç
  function onResult(m) {
    S.history = m.history; S.hot = m.hot; S.outcome = m.outcome; S.winItems = m.winItems;
    S.me = Object.assign({}, S.me, m.me);
    if (m.me && m.me.balance != null) S.balance = m.me.balance;
    if (S.spin) finishSpin();
    renderStrip(true); renderSlots(); renderStats();
    window.TrLive.balance(S.balance);

    const it = itemById(m.outcome);
    $('rsUser').textContent = S.user ? S.user.id : '—';
    $('rsItem').textContent = it.icon;
    $('rsItemSmall').textContent = it.icon;
    $('rsRound').textContent = m.round;
    const win = (m.me && m.me.win) || 0, bet = (m.me && m.me.bet) || 0;
    $('rsWin').textContent = fmt(win);
    $('rsWin').classList.toggle('pos', win > 0);
    $('rsBet').textContent = fmt(bet);
    renderPodium(m.top3 || []);
    const sheet = $('resultSheet');
    sheet.hidden = false;
    sheet.style.animation = 'none'; void sheet.offsetWidth; sheet.style.animation = '';
    if (win > 0) {
      confetti(); Sound.win(); window.TrLive.haptic('success');
      $('hub').classList.add('cheer');
      if (win >= 1000000) window.TrLive.bigWin({ win, outcome: m.outcome, round: m.round });
    } else if (bet > 0) Sound.lose();
    if (S.cfg.specials[m.outcome]) toast(`${it.name}! ${m.outcome === 'salad' ? 'Tüm sebzeler' : 'Tüm etler'} kazandı 🎉`);
  }

  function renderPodium(top) {
    const order = [1, 0, 2]; // 2. - 1. - 3.
    const crowns = ['👑', '🥈', '🥉'];
    $('podium').innerHTML = order.map((i) => {
      const u = top[i];
      if (!u) return `<div class="pd p${i + 1} empty"><div class="frame"><div class="av">–</div><span class="rk">${i + 1}</span></div><div class="nm">&nbsp;</div><div class="w">&nbsp;</div></div>`;
      return `<div class="pd p${i + 1}"><div class="frame">${i === 0 ? `<span class="crown">${crowns[0]}</span>` : ''}<div class="av" data-av="${i}"></div><span class="rk">${i + 1}</span></div>
        <div class="nm">${esc(u.name)}</div><div class="w">${coinSvg}${fmt(u.win)}</div></div>`;
    }).join('');
    $('podium').querySelectorAll('[data-av]').forEach((el) => avatarHtml(el, top[+el.dataset.av]));
  }

  function confetti() {
    const box = $('confetti');
    box.innerHTML = '';
    const cols = ['#ffd23f', '#ff5c8a', '#7ee36a', '#5cc8ff', '#fff'];
    for (let i = 0; i < 26; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = cols[i % cols.length];
      c.style.animationDelay = Math.random() * 0.5 + 's';
      c.style.animationDuration = 1 + Math.random() * 0.9 + 's';
      box.appendChild(c);
    }
  }

  // --------------------------------------------------------------- bahis
  function flyChip(fromEl, toEl) {
    if (!fromEl || !toEl) return;
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const f = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    f.setAttribute('class', 'fly-chip');
    f.innerHTML = '<use href="#i-coin"/>';
    f.style.left = a.left + a.width / 2 - 14 + 'px';
    f.style.top = a.top + a.height / 2 - 14 + 'px';
    document.body.appendChild(f);
    requestAnimationFrame(() => {
      f.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height * 0.7 - (a.top + a.height / 2)}px) scale(.8)`;
      f.style.opacity = '0.2';
    });
    setTimeout(() => f.remove(), 480);
  }
  function floatText(slot, text) {
    const s = document.createElement('span');
    s.className = 'float'; s.textContent = text;
    slot.appendChild(s); setTimeout(() => s.remove(), 900);
  }

  async function placeBet(id) {
    if (!S.cfg) return;
    if (S.phase !== 'betting' || S.endsAt - serverNow() < 400) { toast(ERR.BETTING_CLOSED); return; }
    if (armBlocked(id)) { toast(errText('ARM_LIMIT')); window.TrLive.haptic('error'); return; }
    if ((S.me || {}).paused) { toast(ERR.GAME_PAUSED); return; }
    const amt = S.cfg.chips[S.chip];
    if (S.balance < amt) { toast(ERR.INSUFFICIENT_FUNDS); window.TrLive.haptic('error'); window.TrLive.recharge(amt - S.balance); return; }
    const round = S.round;
    const slot = document.querySelector(`.slot[data-id="${id}"]`);
    // iyimser güncelleme
    S.balance -= amt;
    S.myBets[id] = (S.myBets[id] || 0) + amt;
    S.totals[id] = (S.totals[id] || 0) + amt;
    renderSlots(); renderStats();
    flyChip(document.querySelectorAll('.chip')[S.chip], slot);
    floatText(slot, '+' + short(amt));
    Sound.chip(); window.TrLive.haptic('light');

    const r = await T.request({ type: 'bet', item: id, amount: amt, round });
    if (r.ok) {
      S.balance = r.balance;
      if (S.round === round) S.myBets = r.myBets;
      S.me = Object.assign({}, S.me, r.me);
    } else {
      if (S.round === round) {
        S.myBets[id] = Math.max(0, (S.myBets[id] || 0) - amt);
        S.totals[id] = Math.max(0, (S.totals[id] || 0) - amt);
      }
      S.balance = r.balance != null ? r.balance : S.balance + amt;
      toast(errText(r.error));
      window.TrLive.haptic('error');
      if (r.me) S.me = Object.assign({}, S.me, r.me);
      if (r.error === 'INSUFFICIENT_FUNDS') window.TrLive.recharge(amt);
    }
    renderSlots(); renderStats();
    window.TrLive.balance(S.balance);
  }

  async function repeatBet() {
    if (S.phase !== 'betting') { toast(ERR.BETTING_CLOSED); return; }
    $('btnRepeat').disabled = true;
    const r = await T.request({ type: 'repeat' });
    if (r.me) { S.me = Object.assign({}, S.me, r.me); S.myBets = r.me.myBets || S.myBets; }
    if (r.balance != null) S.balance = r.balance;
    if (r.ok) { Sound.chip(); toast('Önceki bahis tekrarlandı'); }
    else toast(errText(r.error));
    renderSlots(); renderStats();
    window.TrLive.balance(S.balance);
  }

  async function onChest(i) {
    const c = S.cfg.chests[i];
    const me = S.me || {};
    if ((me.claimed || []).includes(i)) { toast(ERR.ALREADY_CLAIMED); return; }
    if ((me.todayBet || 0) < c.need) {
      showInfo(`<h3 class="deco-title">Hazine Sandığı</h3><p style="text-align:center;font-weight:700;margin:0">
        Bugün toplam <b>${fmt(c.need)}</b> bahis yaptığında bu sandığı açabilirsin.<br>
        Ödül: ${coinSvg} <b>${fmt(c.reward)}</b><br><span style="opacity:.8">Kalan: ${fmt(c.need - (me.todayBet || 0))}</span></p>`);
      return;
    }
    const r = await T.request({ type: 'claimChest', index: i });
    if (r.ok) {
      S.balance = r.balance; S.me.claimed = r.claimed;
      toast(`Sandık açıldı! +${fmt(r.reward)}`); Sound.win();
      renderStats(); window.TrLive.balance(S.balance);
    } else toast(errText(r.error));
  }

  // --------------------------------------------------------------- modallar
  function openModal(id) { $(id).hidden = false; }
  function showInfo(html) { $('infoBody').innerHTML = html; openModal('infoModal'); }
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.hidden = true; });
  });

  async function openTrend() {
    openModal('trendModal');
    $('trendBody').textContent = 'Yükleniyor…';
    const r = await T.request({ type: 'trend' });
    if (!r.ok) { $('trendBody').textContent = errText(r.error); return; }
    const tr = r.trend;
    const grid = tr.recent.map((id, i) => `<span class="${S.cfg.specials[id] ? 'sp' : ''} ${i === 0 ? 'first' : ''}">${iconOf(id)}</span>`).join('');
    const ids = S.cfg.items.map((i) => i.id).concat(['salad', 'pizza']);
    const max = Math.max(1, ...ids.map((id) => tr.counts[id] || 0));
    const bars = ids.map((id) => {
      const c = tr.counts[id] || 0;
      const it = itemById(id);
      return `<div class="bar"><span class="e">${it.icon}</span><span class="t"><i style="width:${(c / max) * 100}%"></i></span><span>${c} · ${tr.rounds ? Math.round((c / tr.rounds) * 100) : 0}%</span></div>`;
    }).join('');
    $('trendBody').innerHTML = `<div class="grid">${grid}</div><div class="bars">${bars}</div><div class="trend-note">Son ${tr.rounds} turun dağılımı · çerçeveli olan en yeni sonuç</div>`;
  }

  let lbWhich = 'today';
  async function loadLeaderboard() {
    $('lbList').textContent = 'Yükleniyor…';
    document.querySelectorAll('#lbTabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.which === lbWhich));
    const r = await T.request({ type: 'leaderboard', which: lbWhich });
    if (!r.ok) { $('lbList').textContent = errText(r.error); return; }
    if (!r.list.length) { $('lbList').innerHTML = '<div class="empty">Henüz kazanan yok</div>'; return; }
    $('lbList').innerHTML = r.list.map((u, i) => `<div class="lb-item"><span class="n ${i < 3 ? 'top' : ''}">${u.rank}</span><span class="av" data-i="${i}"></span>
      <span class="nm">${esc(u.name)}</span><span class="w">win: ${coinSvg}${fmt(u.win)}</span></div>`).join('');
    $('lbList').querySelectorAll('.av').forEach((el) => avatarHtml(el, r.list[+el.dataset.i]));
  }

  // --------------------------------------------------------------- kayan yazı
  const tickerQ = [];
  function tickerPush(list) {
    for (const t of list) {
      tickerQ.push(`Tebrikler! <span class="hl">${esc(t.name)}</span>, <span class="emo">${iconOf(t.outcome)}</span> aldı ve <span class="amt">${fmt(t.win)}</span> kazandı`);
    }
    while (tickerQ.length > 8) tickerQ.shift();
  }
  $('tickerText').addEventListener('animationiteration', () => {
    if (tickerQ.length) $('tickerText').innerHTML = tickerQ.shift();
  });

  // --------------------------------------------------------------- döngü
  function loop() {
    const now = serverNow();
    const remain = Math.max(0, S.endsAt - now);
    const secs = Math.ceil(remain / 1000);
    if (S.phase === 'betting') {
      $('hubTime').hidden = false;
      $('hubTime').textContent = secs + 's';
      $('hubTime').classList.toggle('urgent', secs <= 5);
      if (secs !== S.lastSec && secs <= 5 && secs > 0) Sound.count();
    } else if (S.phase === 'drawing') {
      $('hubBadge').textContent = secs + 's';
      spinFrame(now);
    } else if (S.phase === 'result') {
      $('rsCount').textContent = `(${secs})s`;
    }
    S.lastSec = secs;
    requestAnimationFrame(loop);
  }
  function clock() {
    const d = new Date();
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    const s = Math.max(0, Math.floor((next - serverNow()) / 1000));
    const p = (n) => String(n).padStart(2, '0');
    $('evCountdown').textContent = `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  // --------------------------------------------------------------- olaylar
  $('chipPrev').addEventListener('click', () => $('chips').scrollBy({ left: -140, behavior: 'smooth' }));
  $('chipNext').addEventListener('click', () => $('chips').scrollBy({ left: 140, behavior: 'smooth' }));
  $('btnRepeat').addEventListener('click', repeatBet);
  $('btnHelp').addEventListener('click', () => openModal('helpModal'));
  $('btnTrend').addEventListener('click', openTrend);
  $('btnMore').addEventListener('click', () => { openModal('lbModal'); loadLeaderboard(); });
  $('lbTabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) { lbWhich = t.dataset.which; loadLeaderboard(); } });
  $('btnMode').addEventListener('click', () => toast('Şu an yalnızca Standart Mod açık'));
  $('btnSound').addEventListener('click', () => { S.muted = !S.muted; safeSet('kc_muted', S.muted ? '1' : '0'); renderSound(); });
  function renderSound() { $('btnSound').querySelector('use').setAttribute('href', S.muted ? '#i-mute' : '#i-sound'); }
  const spInfo = (id) => () => {
    const sp = S.cfg.specials[id];
    const group = S.cfg.items.filter((i) => i.group === sp.group);
    showInfo(`<h3 class="deco-title">${sp.icon} ${sp.name}</h3><p style="text-align:center;font-weight:700;margin:0">
      ${sp.name} çıkarsa ${group.map((i) => `<span style="font-family:var(--emoji)">${i.icon}</span>`).join(' ')} yiyeceklerine bahis yapan herkes kendi çarpanıyla kazanır.<br>
      <span style="opacity:.85">Ödül havuzu büyüdükçe çıkma şansı artar.</span></p>`);
  };
  $('spSalad').addEventListener('click', spInfo('salad'));
  $('spPizza').addEventListener('click', spInfo('pizza'));

  window.TrLive.on('mute', (d) => { S.muted = !!d.muted; renderSound(); });
  window.TrLive.on('balanceRefresh', async () => {
    const r = await T.request({ type: 'balance' });
    if (r.ok) { S.balance = r.balance; renderStats(); }
  });

  // --------------------------------------------------------------- mesajlar
  function onMessage(m) {
    switch (m.type) {
      case 'hello': {
        const first = !S.cfg;
        S.cfg = m.config; S.user = m.user; S.balance = m.balance;
        const st = m.state;
        S.totals = st.totals || {}; S.history = st.history || []; S.hot = st.hot; S.me = st.me || {};
        S.myBets = (st.me && st.me.myBets) || {};
        S.round = st.round;
        if (first) {
          const c = +safeGet('kc_chip');
          if (c >= 0 && c < S.cfg.chips.length) S.chip = c;
          buildWheel(); buildChips(); buildChests();
          $('helpBetSec').textContent = Math.round(S.cfg.phases.betting / 1000);
        }
        avatarHtml($('meAvatar'), S.user); avatarHtml($('rkAv'), S.user);
        applyPhase(st);
        if (st.phase === 'result') markWinners();
        renderStrip(false); renderSlots(); renderStats();
        app.classList.remove('is-loading');
        if (first) window.TrLive.ready();
        window.TrLive.balance(S.balance);
        break;
      }
      case 'phase': applyPhase(m); break;
      case 'totals': if (m.round === S.round) { S.totals = Object.assign({}, m.totals); for (const k in S.myBets) S.totals[k] = Math.max(S.totals[k] || 0, S.myBets[k]); renderSlots(); } break;
      case 'result': onResult(m); break;
      case 'ticker': tickerPush(m.list); break;
      case 'error': if (m.error === 'RATE_LIMIT') toast(ERR.RATE_LIMIT); else if (m.error === 'AUTH_FAILED') fatal('Giriş doğrulanamadı. Oyunu yeniden aç.'); break;
      case 'fatal': fatal(m.code === 4002 ? 'Oyun başka bir cihazda açıldı.' : 'Oturum sona erdi. Oyunu yeniden aç.'); break;
    }
  }
  function fatal(msg) {
    app.classList.add('is-loading');
    document.querySelector('#loader div').textContent = msg;
  }

  // --------------------------------------------------------------- başlat
  (async function init() {
    S.muted = safeGet('kc_muted') === '1';
    renderSound();
    T = await window.KCNet.chooseTransport();
    T.onMessage = onMessage;
    T.onStatus = (s) => {
      const d = $('connDot');
      d.className = 'conn-dot' + (s === 'online' ? ' on' : s === 'demo' ? ' demo' : '');
      d.title = { online: 'Bağlı', demo: 'Demo modu (sunucusuz)', connecting: 'Bağlanıyor…', offline: 'Bağlantı yok' }[s] || s;
    };
    T.connect();
    requestAnimationFrame(loop);
    clock(); setInterval(clock, 1000);
  })();
})();
