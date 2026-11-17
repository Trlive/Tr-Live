import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeGiftEvents, createGiftCoalescer, createKeyedThrottle, BURST_WINDOW_MS, BUSY_WINDOW_MS, BUSY_EVENTS_PER_SEC } from '../src/gift_burst.js';

// Sahte saat ve zamanlayıcı: süre elle ilerletilir.
function clock() {
  let t = 1_000_000;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
    pending: () => timers.size,
  };
}

const ev = (o = {}) => ({
  type: 'room_gift', roomId: 'r1', gift: { id: 'g1', name: 'Gül' }, quantity: 1, totalCoins: '20', combo: 1, lucky: null, roomTotal: '100',
  sender: { id: 's1' }, receivers: [{ user: { id: 'a' }, quantity: 1, coinAmount: '10' }, { user: { id: 'b' }, quantity: 1, coinAmount: '10' }], ...o,
});

test('hediye olayları birleşir: adet, tutar ve alıcılar toplanır; combo ve oda toplamı en güncel', () => {
  const m = mergeGiftEvents(ev(), ev({ combo: 2, roomTotal: '120', quantity: 3, totalCoins: '60', receivers: [{ user: { id: 'b' }, quantity: 3, coinAmount: '30' }, { user: { id: 'c' }, quantity: 3, coinAmount: 30 }] }));
  assert.equal(m.quantity, 4);
  assert.equal(m.totalCoins, '80');
  assert.equal(m.combo, 2);
  assert.equal(m.roomTotal, '120');
  assert.equal(m.merged, 2);
  assert.deepEqual(m.receivers, [
    { user: { id: 'a' }, quantity: 1, coinAmount: '10' },
    { user: { id: 'b' }, quantity: 4, coinAmount: '40' },
    { user: { id: 'c' }, quantity: 3, coinAmount: 30 },
  ]);
  const m3 = mergeGiftEvents(m, ev({ combo: 3, roomTotal: null }));
  assert.equal(m3.merged, 3);
  assert.equal(m3.quantity, 5);
  assert.equal(m3.roomTotal, '120', 'yeni olayda toplam yoksa eskisi korunur');
  assert.equal(m3.type, 'room_gift');
});

test('şanslı kazançlar birleşir: kazanç ve isabetler toplanır, en yüksek çarpan kalır', () => {
  const a = ev({ lucky: { win: '500', best: 5, wins: 1, units: 10, jackpot: false, hits: { 5: 1 }, pool: { v: 1 } } });
  const b = ev({ lucky: { win: '0', best: 0, wins: 0, units: 10, jackpot: false, hits: {}, pool: { v: 2 } } });
  const c = ev({ lucky: { win: '2000', best: 100, wins: 2, units: 10, jackpot: true, hits: { 5: 1, 100: 1 }, pool: { v: 3 } } });
  const m = mergeGiftEvents(mergeGiftEvents(a, b), c);
  assert.deepEqual(m.lucky, { win: '2500', best: 100, wins: 3, units: 30, jackpot: true, hits: { 5: 2, 100: 1 }, pool: { v: 3 } });
  assert.equal(mergeGiftEvents(ev(), ev()).lucky, null);
  assert.equal(mergeGiftEvents(ev(), a).lucky.win, '500');
  assert.equal(mergeGiftEvents(a, ev()).lucky.win, '500');
});

test('tek tek atılan hediye gecikmez; hızlı seri pencere başına tek olaya iner ve hiçbir adet kaybolmaz', () => {
  const c = clock();
  const out = [];
  const co = createGiftCoalescer({ send: (roomId, e) => out.push({ roomId, at: c.now(), e }), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  // Yavaş gönderim: her biri hemen gider.
  assert.equal(co.push('k', 'r1', ev({ combo: 1 })), 'sent');
  c.advance(BURST_WINDOW_MS + 50);
  assert.equal(co.push('k', 'r1', ev({ combo: 2 })), 'sent');
  assert.equal(out.length, 2);
  // Hızlı seri: saniyede 5 dokunuş, 4 sn.
  c.advance(BURST_WINDOW_MS + 50);
  out.length = 0;
  let sentQty = 0;
  for (let i = 0; i < 20; i++) {
    co.push('k', 'r1', ev({ combo: 3 + i }));
    sentQty += 1;
    c.advance(200);
  }
  c.advance(BURST_WINDOW_MS * 2);
  const total = out.reduce((n, x) => n + x.e.quantity, 0);
  assert.equal(total, sentQty, 'birleştirmede adet kaybolmaz');
  assert.ok(out.length <= 6, `20 dokunuş en çok 6 olay olmalı (oldu: ${out.length})`);
  assert.equal(out[0].e.quantity, 1, 'serinin ilk olayı tek başına ve hemen gider');
  assert.equal(out.at(-1).e.combo, 22, 'son olay en güncel combo sayacını taşır');
  for (let i = 1; i < out.length; i++) assert.ok(out[i].at - out[i - 1].at >= BURST_WINDOW_MS - 1, 'olaylar arasında en az bir pencere var');
  assert.equal(co.pendingCount(), 0);
  assert.equal(c.pending(), 0, 'bekleyen zamanlayıcı kalmaz');
});

test('farklı seriler birbirini bekletmez; oda yoğunken pencere uzar', () => {
  const c = clock();
  const out = [];
  const co = createGiftCoalescer({ send: (roomId, e) => out.push({ roomId, at: c.now(), key: e.sender.id }), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  assert.equal(co.push('k1', 'r1', ev({ sender: { id: 's1' } })), 'sent');
  assert.equal(co.push('k2', 'r1', ev({ sender: { id: 's2' } })), 'sent');
  assert.equal(co.push('k1', 'r1', ev({ sender: { id: 's1' } })), 'queued');
  assert.equal(co.push('k1', 'r1', ev({ sender: { id: 's1' } })), 'merged');
  assert.equal(co.push('k3', 'r2', ev({ roomId: 'r2', sender: { id: 's3' } })), 'sent');
  c.advance(BURST_WINDOW_MS);
  assert.deepEqual(out.map((x) => x.key), ['s1', 's2', 's3', 's1']);
  // Yoğun oda: aynı saniyede çok sayıda farklı gönderen.
  c.advance(5000);
  out.length = 0;
  for (let i = 0; i < BUSY_EVENTS_PER_SEC + 2; i++) co.push(`busy${i}`, 'r9', ev({ roomId: 'r9', sender: { id: `u${i}` } }));
  assert.equal(out.length, BUSY_EVENTS_PER_SEC + 2, 'her serinin ilk olayı yine hemen gider');
  const t0 = c.now();
  assert.equal(co.push('busy0', 'r9', ev({ roomId: 'r9', sender: { id: 'u0' } })), 'queued');
  c.advance(BURST_WINDOW_MS + 100);
  assert.equal(out.length, BUSY_EVENTS_PER_SEC + 2, 'yoğun odada kısa pencere sonunda gönderilmez');
  c.advance(BUSY_WINDOW_MS);
  assert.equal(out.length, BUSY_EVENTS_PER_SEC + 3);
  assert.ok(out.at(-1).at - t0 >= BUSY_WINDOW_MS - 1);
});

test('gönderim hatası birleştiriciyi bozmaz; flushAll bekleyenleri gönderir', () => {
  const c = clock();
  let n = 0;
  const co = createGiftCoalescer({ send: () => { n += 1; if (n === 1) throw new Error('bağlantı'); }, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  assert.equal(co.push('k', 'r', ev()), 'sent');
  assert.equal(co.push('k', 'r', ev()), 'queued');
  co.flushAll();
  assert.equal(n, 2);
  assert.equal(co.pendingCount(), 0);
  c.advance(10000);
  assert.equal(n, 2, 'iptal edilen zamanlayıcı yeniden göndermez');
});

test('son durum seyreltmesi: ilk çağrı hemen, aradakiler tek çağrı, son istek mutlaka çalışır', () => {
  const c = clock();
  const th = createKeyedThrottle({ now: c.now, setTimer: c.setTimer });
  const ran = [];
  assert.equal(th('a', 900, () => ran.push('1')), true);
  assert.equal(th('a', 900, () => ran.push('2')), false);
  assert.equal(th('a', 900, () => ran.push('3')), false);
  assert.equal(th('b', 900, () => ran.push('b1')), true, 'başka anahtar beklemez');
  assert.deepEqual(ran, ['1', 'b1']);
  c.advance(900);
  assert.deepEqual(ran, ['1', 'b1', '3'], 'yalnızca en son istek çalışır');
  c.advance(100);
  assert.equal(th('a', 900, () => ran.push('4')), false, 'sondaki çalışmadan sonra da aralık korunur');
  c.advance(900);
  assert.deepEqual(ran, ['1', 'b1', '3', '4']);
  c.advance(2000);
  assert.equal(th('a', 900, () => { throw new Error('x'); }), true, 'hata fırlatan yayın seyreltmeyi bozmaz');
  assert.equal(th('a', 900, () => Promise.reject(new Error('y'))), false);
  c.advance(900);
  assert.equal(c.pending(), 0);
});
