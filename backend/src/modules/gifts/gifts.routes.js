import { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth } from '../../middleware/authentication/auth.js';
import { noteTask } from '../events/daily.service.js';
import { userLimit } from '../../middleware/security/firewall.js';
import { fail, uuid, uuidArray, positiveInt, oneOf } from '../../shared/errors/http.js';
import { publicUser, roomUser } from '../../shared/utils/views.js';
import { hub } from '../../infrastructure/websocket/realtime.js';
import { config } from '../../config.js';
import { distributeGift } from './gifts.rules.js';
import { levelFromExp, levelExp, giftDisplayLevel } from '../users/levels.rules.js';
import { scorePk, pkView } from '../rooms/pk.service.js';
import { scoreRoomPk, broadcastRoomPk } from '../rooms/room_pk.service.js';
import { scoreboardOf } from '../rooms/scoreboard.service.js';
import { loadPublicRows } from '../users/users.service.js';
import { idempotent } from '../../middleware/validation/idempotency.js';
import { COMBO_WINDOW_MS, LUCKY_COMBO_WINDOW_MS, nextCombo } from './combo.rules.js';
import { createGiftCoalescer, createKeyedThrottle } from './gift_burst.rules.js';

// Hediye yağmuru koruması: aynı serinin art arda olayları odaya birleştirilerek gider; skor tablosu ve PK puanı
// yayınları seyreltilir (ayrıntı: gift_burst.js). Para işlemleri etkilenmez.
const giftEvents = createGiftCoalescer({ send: (roomId, event) => hub.broadcastRoom(roomId, event) });
const lastState = createKeyedThrottle();
import { drawLuckyPool, LUCKY_BASE, luckyTables, poolView, JACKPOT_OPEN } from './lucky.rules.js';
import { getConfig } from '../system/app_config.service.js';
import { featuresFor, minLevelFor, wipLabel } from '../system/wip.service.js';
import { addGiftExp, CP_GIFT_MULTIPLIER_BPS } from '../relations/cp.service.js';
import { addGuardianPoints } from '../users/guardian.service.js';
import { addFamilyContribBatch } from '../families/family.service.js';

export const router = Router();
router.use(requireAuth);

// single: tek kişi · equal/random/selected: adet kişiler arasında bölünür · each: seçilen HER kişiye tam adet
// all_mic: mikrofondaki herkese (kendin hariç) tam adet · all_room: odadaki herkese (kendin hariç) tam adet
const DISTRIBUTIONS = ['single', 'equal', 'random', 'selected', 'each', 'all_mic', 'all_room'];
const MAX_BULK_RECIPIENTS = 50;
const giftJson = (g) => ({
  id: g.id, name: g.name, coinPrice: String(g.coin_price), iconUrl: g.icon_url, animationUrl: g.animation_url,
  animationFormat: g.animation_format, hasAlpha: g.has_alpha, category: g.category ?? 'popular', playMode: g.play_mode ?? 'full',
});

router.get('/gifts', async (req, res) => {
  const r = await query(`SELECT * FROM gifts WHERE is_active = TRUE ORDER BY coin_price`);
  const cfg = await getConfig();
  // Şanslı hediyeler kapalıyken sekme hiç görünmez.
  const rows = cfg.luckyEnabled ? r.rows : r.rows.filter((g) => g.category !== 'lucky');
  // Şanslı hediye olasılıkları (uygulama mağazası kuralı: rastgele ödüllerin olasılıkları kullanıcıya gösterilir).
  // Gönderim anındaki sınırlamanın aynısı uygulanır.
  const recvBps = Math.min(Math.max(Math.trunc(Number(cfg.luckyReceiverBps)) || 0, 0), 5000);
  const rtpBps = Math.min(Math.max(Math.trunc(Number(cfg.luckyRtpBps)) || 0, 0), 9500 - recvBps);
  const jackpotShare = Math.min(Math.max(Math.trunc(Number(cfg.luckyJackpotShareBps)) || 0, 0), 8000);
  const t = luckyTables(rtpBps, jackpotShare);
  // jackpot: true → yalnızca büyük ödül havuzu doluyken çıkabilir.
  const odds = [
    ...t.jackpot.map(([m, p]) => ({ multiplier: m, probability: Number(p.toFixed(8)), jackpot: true })),
    ...t.base.map(([m, p]) => ({ multiplier: m, probability: Number(p.toFixed(8)), jackpot: false })),
  ];
  const luckyGifts = rows.filter((g) => g.category === 'lucky');
  const pools = luckyGifts.length
    ? (await query(`SELECT gift_id, base_balance, jackpot_balance FROM lucky_pools WHERE gift_id = ANY($1::uuid[])`, [luckyGifts.map((g) => g.id)])).rows
    : [];
  const poolOf = new Map(pools.map((x) => [x.gift_id, { base: x.base_balance, jackpot: x.jackpot_balance }]));
  res.json({
    gifts: rows.map(giftJson), globalMinCoins: String(config.globalGiftMinCoins),
    lucky: {
      enabled: cfg.luckyEnabled, receiverBps: cfg.luckyReceiverBps, multipliers: LUCKY_BASE.map(([m]) => m),
      odds, rtpBps, maxWin: String(Math.max(Math.trunc(Number(cfg.luckyMaxWin)) || 1, 1)),
      comboSeconds: LUCKY_COMBO_WINDOW_MS / 1000, jackpotOpen: JACKPOT_OPEN,
      pools: luckyGifts.map((g) => poolView(g.id, g.coin_price, poolOf.get(g.id))),
    },
  });
});

// Uygulama açılışında şeridi doldurmak için son global hediyeler.
router.get('/gifts/global/recent', async (req, res) => {
  const r = await query(
    `SELECT e.id, e.coin_amount, e.display_level, e.created_at, e.sender_id, e.receiver_id, e.room_id,
            g.name AS gift_name, g.icon_url, g.animation_url, g.animation_format, gt.quantity
     FROM global_gift_events e
     JOIN gift_transactions gt ON gt.id = e.gift_transaction_id
     JOIN gifts g ON g.id = gt.gift_id
     WHERE e.created_at > NOW() - INTERVAL '10 minutes' ORDER BY e.created_at DESC LIMIT 20`,
  );
  const ids = [...new Set(r.rows.flatMap((x) => [x.sender_id, x.receiver_id]))];
  const users = new Map((await loadPublicRows(ids)).map((u) => [u.id, u]));
  res.json({
    events: r.rows.map((x) => ({
      id: x.id, roomId: x.room_id, coinAmount: String(x.coin_amount), displayLevel: x.display_level, quantity: x.quantity, createdAt: x.created_at,
      gift: { name: x.gift_name, iconUrl: x.icon_url, animationUrl: x.animation_url, animationFormat: x.animation_format },
      sender: publicUser(users.get(x.sender_id)), receiver: publicUser(users.get(x.receiver_id)),
    })),
  });
});

// Hediye gönderimi: tek PostgreSQL işlemi. Kendine hediye serbesttir (gönderen alıcı olabilir):
//  - Coin düşer, Diamond artar (muhasebe kaydı tutulur).
//  - Kendine hediye; ajans/maaş hesabına ve liderlik tablolarına SAYILMAZ (suistimali önlemek için). PK puanına SAYILIR (Micolive gibi).
// Dakikada 180 gönderim (saniyede 3): şanslı hediye combo'sunda hızlı dokunan kullanıcı "çok hızlı" uyarısına takılmasın.
router.post('/rooms/:roomId/gifts/send', userLimit('gift', 180, 60e3), idempotent('gift_send'), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const giftId = uuid(req.body?.giftId, 'Hediye');
  const quantity = positiveInt(req.body?.quantity ?? 1, 'Hediye adedi', 10000);
  const distribution = oneOf(req.body?.distribution ?? 'single', DISTRIBUTIONS, 'Dağıtım tipi');
  const recipientId = distribution === 'single' ? uuid(req.body?.recipientId, 'Alıcı') : null;
  const selectedUserIds = distribution === 'selected' ? uuidArray(req.body?.selectedUserIds, 'Seçilen kullanıcılar', 20) : [];
  const eachIds = distribution === 'each' ? uuidArray(req.body?.recipientIds, 'Alıcılar', MAX_BULK_RECIPIENTS) : [];
  if (distribution === 'each' && !eachIds.length) throw fail('En az bir alıcı seçin.');
  const senderId = req.user.id;
  // Ayarlar işlem dışında okunur (önbellek süresi dolduysa havuzdan bağlantı ister; işlem içinde beklemek kilitlenmeye yol açar).
  const cfg = await getConfig();
  // Şanslı hediye değerleri çekiliş anında da sınırlanır (panel denetimini aşan/bozuk değerlere karşı): RTP + alıcı payı ≤ %95.
  const luckyRecvBps = Math.min(Math.max(Math.trunc(Number(cfg.luckyReceiverBps)) || 0, 0), 5000);
  const luckyRtpBps = Math.min(Math.max(Math.trunc(Number(cfg.luckyRtpBps)) || 0, 0), 9500 - luckyRecvBps);
  const luckyMaxWin = BigInt(Math.max(Math.trunc(Number(cfg.luckyMaxWin)) || 1, 1));
  const luckyJackpotShare = Math.min(Math.max(Math.trunc(Number(cfg.luckyJackpotShareBps)) || 0, 0), 8000);

  const result = await tx(async (c) => {
    const room = (await c.query(`SELECT id, is_hidden, owner_id, room_type FROM rooms WHERE id = $1 AND is_active = TRUE`, [roomId])).rows[0];
    if (!room) throw fail('Oda bulunamadı.', 404);
    const gift = (await c.query(`SELECT * FROM gifts WHERE id = $1 AND is_active = TRUE`, [giftId])).rows[0];
    if (!gift) throw fail('Hediye bulunamadı.', 404);
    // Vip sekmesindeki hediyeler WIP ayrıcalığıdır.
    if (gift.category === 'vip' && !(await featuresFor(senderId, (t, p) => c.query(t, p))).vipGifts) {
      const lvl = await minLevelFor('vipGifts', (t, p) => c.query(t, p));
      throw fail(`Vip hediyeleri ${lvl ? `${wipLabel(lvl)} ve üzeri` : 'WIP'} üyelere özeldir.`, 403);
    }
    const lucky = gift.category === 'lucky';
    if (lucky && cfg.luckyEnabled === false) throw fail('Şanslı hediyeler şu an kapalı.', 403);
    // Şanslı hediye (Yoho / Bigo kuralı): hediyenin "değeri" fiyatının alıcı payı kadardır (varsayılan %10). Alıcıya bu kadar
    // Elmas geçer; koltuk puanı, PK, sıralamalar, CP, koruyucu, aile katkısı ve gönderenin servet seviyesi de bu değerle
    // sayılır (geri kalanı gönderenin şans havuzudur; tam değerle saymak geri kazanılan Coin'le puan/seviye kasılmasına yol açar).
    const creditOf = (coinAmount) => (lucky ? (coinAmount * BigInt(luckyRecvBps)) / 10000n : coinAmount);

    // Hayalet (SWIP) dinleyiciler toplu hediyelerde alıcı olmaz (mikrofondaysa olur).
    const members = (await c.query(
      `SELECT rm.user_id, rm.microphone FROM room_members rm
       JOIN users u ON u.id = rm.user_id AND u.account_status = 'active'
       WHERE rm.room_id = $1 AND (rm.microphone OR rm.user_id = $2 OR NOT is_ghost(rm.user_id))`,
      [roomId, senderId],
    )).rows;
    if (!members.some((m) => m.user_id === senderId)) throw fail('Hediye göndermek için odada olmalısınız.', 403);

    let allocation;
    if (distribution === 'single') {
      if (!members.some((m) => m.user_id === recipientId)) throw fail('Alıcı odada değil.');
      allocation = [{ userId: recipientId, quantity }];
    } else if (distribution === 'each') {
      const inRoom = new Set(members.map((m) => m.user_id));
      if (!eachIds.every((id) => inRoom.has(id))) throw fail('Seçilen alıcılardan biri odada değil.');
      allocation = eachIds.map((userId) => ({ userId, quantity }));
    } else if (distribution === 'all_mic' || distribution === 'all_room') {
      const targets = members.filter((m) => m.user_id !== senderId && (distribution === 'all_room' || m.microphone === true));
      if (!targets.length) throw fail(distribution === 'all_mic' ? 'Mikrofonda başka kimse yok.' : 'Odada başka kimse yok.');
      if (targets.length > MAX_BULK_RECIPIENTS) throw fail(`Toplu hediye en fazla ${MAX_BULK_RECIPIENTS} kişiye gönderilebilir.`);
      allocation = targets.map((m) => ({ userId: m.user_id, quantity }));
    } else {
      allocation = distributeGift(members, quantity, distribution, selectedUserIds);
    }

    // Toplam tutar, dağıtılan toplam adede göre hesaplanır (bölünen modlarda = adet, "herkese" modlarında = adet × kişi).
    const totalUnits = allocation.reduce((s, a) => s + BigInt(a.quantity), 0n);
    const totalCoins = BigInt(gift.coin_price) * totalUnits;
    // Puan / seviye değeri (normal hediyede = harcanan Coin, şanslıda alıcı payı).
    const totalValue = allocation.reduce((s, a) => s + creditOf(BigInt(gift.coin_price) * BigInt(a.quantity)), 0n);
    // Kilitlenmeyi (deadlock) önlemek için ilgili tüm kullanıcı satırları TEK sorguda, sıralı kilitlenir.
    const lockIds = [...new Set([senderId, ...allocation.map((a) => a.userId)])];
    const locked = (await c.query(`SELECT id, coins FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [lockIds])).rows;
    const senderRow = locked.find((u) => u.id === senderId);
    if (!senderRow || BigInt(senderRow.coins) < totalCoins) throw fail('Yetersiz Coin.');

    const sent = (await c.query(
      `UPDATE users SET coins = coins - $1, total_sent_coins = total_sent_coins + $3, updated_at = NOW()
       WHERE id = $2 RETURNING coins, total_sent_coins, level_exp_bonus`,
      [totalCoins.toString(), senderId, totalValue.toString()],
    )).rows[0];
    // Seviye = gönderilen Coin + yönetimin verdiği seviye farkı (level_exp_bonus).
    await c.query(`UPDATE users SET coin_level = $1 WHERE id = $2`, [levelFromExp(levelExp(sent.total_sent_coins, sent.level_exp_bonus)), senderId]);

    const pkIds = new Set();
    let roomPkId = null;
    const transactions = [];
    const qualifying = [];
    const familyContrib = [];
    let selfValue = 0n;
    // Çok alıcılı gönderim ("Tüm Oda" / "Tüm Koltuk" / çoklu seçim): her alıcı için ~12 sorgu SIRAYLA yerine her adım
    // TEK sorguda tüm alıcılar için yapılır (50 kişide ~600 sorgu → ~12). Tek alıcıda eski (aşağıdaki) yol kullanılır.
    // Sonuç ve kayıtlar birebir aynıdır; alıcılar benzersiz olmalıdır (değilse eski yol).
    const uniqueRecipients = new Set(allocation.map((a) => a.userId)).size === allocation.length;
    if (allocation.length > 1 && uniqueRecipients) {
      const price = BigInt(gift.coin_price);
      const items = allocation.map((item) => {
        const coinAmount = price * BigInt(item.quantity);
        return { ...item, coinAmount, credit: creditOf(coinAmount) };
      });
      const ids = items.map((x) => x.userId);
      const recv = (await c.query(
        `UPDATE users u SET diamonds = u.diamonds + v.credit, total_received_diamonds = u.total_received_diamonds + v.credit, updated_at = NOW()
         FROM unnest($1::uuid[], $2::bigint[]) AS v(id, credit) WHERE u.id = v.id
         RETURNING u.id, u.total_received_diamonds, u.host_level_exp_bonus`,
        [ids, items.map((x) => x.credit.toString())],
      )).rows;
      await c.query(
        `UPDATE users u SET gift_level = v.lvl FROM unnest($1::uuid[], $2::int[]) AS v(id, lvl) WHERE u.id = v.id`,
        [recv.map((r) => r.id), recv.map((r) => levelFromExp(levelExp(r.total_received_diamonds, r.host_level_exp_bonus)))],
      );
      const gts = (await c.query(
        `INSERT INTO gift_transactions(room_id, sender_id, receiver_id, gift_id, quantity, coin_amount, diamond_amount, receiver_agency_id)
         SELECT $1, $2, v.rid, $3, v.qty, v.coin, v.dia,
                (SELECT b.agency_id FROM broadcasters b JOIN agencies a ON a.id = b.agency_id
                 WHERE b.user_id = v.rid AND b.status = 'approved' AND a.status = 'active')
         FROM unnest($4::uuid[], $5::bigint[], $6::bigint[], $7::bigint[]) WITH ORDINALITY AS v(rid, qty, coin, dia, ord)
         ORDER BY v.ord
         RETURNING id, receiver_id`,
        [roomId, senderId, gift.id, ids, items.map((x) => String(x.quantity)), items.map((x) => x.coinAmount.toString()),
          items.map((x) => (lucky ? x.credit.toString() : null))],
      )).rows;
      const gtOf = new Map(gts.map((g) => [g.receiver_id, g.id]));
      // Oda içi sayı tahtası.
      await c.query(
        `INSERT INTO room_gift_totals(room_id, user_id, total_coins, total_count)
         SELECT $1, v.uid, v.coins, v.n FROM unnest($2::uuid[], $3::bigint[], $4::bigint[]) AS v(uid, coins, n)
         ON CONFLICT (room_id, user_id) DO UPDATE SET total_coins = room_gift_totals.total_coins + EXCLUDED.total_coins,
           total_count = room_gift_totals.total_count + EXCLUDED.total_count, updated_at = NOW()`,
        [roomId, ids, items.map((x) => x.credit.toString()), items.map((x) => String(x.quantity))],
      );
      // CP yakınlığı ve koruyucu puanı (kendine hediye hariç; tek sorguda).
      const others = items.filter((x) => x.userId !== senderId && x.credit > 0n);
      if (others.length) {
        const pairs = others.map((x) => {
          let exp = x.credit;
          if (gift.category === 'cp') exp = (exp * BigInt(CP_GIFT_MULTIPLIER_BPS)) / 10000n;
          const [pa, pb] = senderId < x.userId ? [senderId, x.userId] : [x.userId, senderId];
          return { pa, pb, exp };
        }).filter((x) => x.exp > 0n);
        if (pairs.length) {
          await c.query(
            `INSERT INTO cp_pairs(user_a, user_b, exp) SELECT v.a, v.b, v.e FROM unnest($1::uuid[], $2::uuid[], $3::bigint[]) AS v(a, b, e)
             ON CONFLICT (user_a, user_b) DO UPDATE SET exp = cp_pairs.exp + EXCLUDED.exp, updated_at = NOW()`,
            [pairs.map((x) => x.pa), pairs.map((x) => x.pb), pairs.map((x) => x.exp.toString())],
          );
        }
        await c.query(
          `UPDATE guardians g SET points = g.points + v.amt, last_gift_at = NOW(), updated_at = NOW()
           FROM unnest($1::uuid[], $2::bigint[]) AS v(owner, amt) WHERE g.owner_id = v.owner AND g.guardian_id = $3`,
          [others.map((x) => x.userId), others.map((x) => x.credit.toString()), senderId],
        );
      }
      // PK'lar: odada süren PK yoksa alıcı başına sorgu hiç yapılmaz (çoğu durum).
      const pkLive = (await c.query(
        `SELECT EXISTS (SELECT 1 FROM pk_battles WHERE status = 'active' AND ends_at > NOW() AND (room_a = $1 OR room_b = $1)) AS pk,
                EXISTS (SELECT 1 FROM room_pk WHERE room_id = $1 AND status = 'active' AND ends_at > NOW()) AS rpk`,
        [roomId],
      )).rows[0];
      for (const x of items) {
        if (pkLive.pk) {
          const pkId = await scorePk(c, roomId, x.userId, senderId, x.credit, x.credit);
          if (pkId) pkIds.add(pkId);
        }
        if (pkLive.rpk) roomPkId = (await scoreRoomPk(c, roomId, x.userId, senderId, x.credit, x.credit)) ?? roomPkId;
      }
      // Cüzdan kayıtları (gönderen: alıcı başına bir satır, alıcılar: Elmas).
      await c.query(
        `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description)
         SELECT $1, 'gift_sent', v.amt, v.ref, v.descr FROM unnest($2::bigint[], $3::text[], $4::text[]) WITH ORDINALITY AS v(amt, ref, descr, ord) ORDER BY v.ord`,
        [senderId, items.map((x) => (-x.coinAmount).toString()), items.map((x) => String(gtOf.get(x.userId))), items.map((x) => `Hediye: ${gift.name} x${x.quantity}`)],
      );
      const credited = items.filter((x) => x.credit > 0n);
      if (credited.length) {
        await c.query(
          `INSERT INTO wallet_transactions(user_id, transaction_type, diamond_amount, reference_id, description)
           SELECT v.uid, 'gift_received', v.amt, v.ref, v.descr FROM unnest($1::uuid[], $2::bigint[], $3::text[], $4::text[]) AS v(uid, amt, ref, descr)`,
          [credited.map((x) => x.userId), credited.map((x) => x.credit.toString()), credited.map((x) => String(gtOf.get(x.userId))), credited.map((x) => `Hediye: ${gift.name} x${x.quantity}`)],
        );
      }
      // Global şerit (açık odalarda, eşiği geçen normal hediyeler).
      const global = !lucky && !room.is_hidden ? items.filter((x) => x.coinAmount >= config.globalGiftMinCoins) : [];
      if (global.length) {
        await c.query(
          `INSERT INTO global_gift_events(gift_transaction_id, room_id, sender_id, receiver_id, coin_amount, display_level)
           SELECT v.gt, $1, $2, v.rid, v.coin, v.lvl FROM unnest($3::uuid[], $4::uuid[], $5::bigint[], $6::int[]) AS v(gt, rid, coin, lvl)`,
          [roomId, senderId, global.map((x) => gtOf.get(x.userId)), global.map((x) => x.userId), global.map((x) => x.coinAmount.toString()),
            global.map((x) => giftDisplayLevel(x.coinAmount))],
        );
      }
      for (const x of items) {
        if (x.userId !== senderId) familyContrib.push({ userId: x.userId, points: x.credit }, { userId: senderId, points: x.credit });
        else selfValue += x.credit;
        if (global.includes(x)) qualifying.push({ userId: x.userId, coinAmount: x.coinAmount, quantity: x.quantity });
        transactions.push({
          id: gtOf.get(x.userId), receiverId: x.userId, quantity: x.quantity, coinAmount: x.coinAmount.toString(), diamondAmount: x.credit.toString(),
        });
      }
    } else {
      for (const item of allocation) {
        const coinAmount = BigInt(gift.coin_price) * BigInt(item.quantity);
        const credit = creditOf(coinAmount); // alıcıya geçen Elmas (normal hediyede = coinAmount)
        const recv = (await c.query(
          `UPDATE users SET diamonds = diamonds + $1, total_received_diamonds = total_received_diamonds + $1, updated_at = NOW()
           WHERE id = $2 RETURNING total_received_diamonds, host_level_exp_bonus`,
          [credit.toString(), item.userId],
        )).rows[0];
        await c.query(`UPDATE users SET gift_level = $1 WHERE id = $2`, [levelFromExp(levelExp(recv.total_received_diamonds, recv.host_level_exp_bonus)), item.userId]);

        const gt = (await c.query(
          `INSERT INTO gift_transactions(room_id, sender_id, receiver_id, gift_id, quantity, coin_amount, diamond_amount, receiver_agency_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT b.agency_id FROM broadcasters b JOIN agencies a ON a.id = b.agency_id
                                     WHERE b.user_id = $3 AND b.status = 'approved' AND a.status = 'active')) RETURNING id`,
          [roomId, senderId, item.userId, gift.id, item.quantity, coinAmount.toString(), lucky ? credit.toString() : null],
        )).rows[0];
        // Oda içi sayı tahtası (mikrofon koltuğu başına toplam). Kendine hediye de tahtada görünür.
        await c.query(
          `INSERT INTO room_gift_totals(room_id, user_id, total_coins, total_count) VALUES($1,$2,$3,$4)
           ON CONFLICT (room_id, user_id) DO UPDATE SET total_coins = room_gift_totals.total_coins + EXCLUDED.total_coins,
             total_count = room_gift_totals.total_count + EXCLUDED.total_count, updated_at = NOW()`,
          [roomId, item.userId, credit.toString(), item.quantity],
        );
        // CP yakınlığı: iki kişi arasındaki hediye Coin değeri kadar exp (CP hediyesi 1,5 kat).
        await addGiftExp((t, p) => c.query(t, p), senderId, item.userId, credit, gift.category === 'cp');
        // Koruyucu puanı: gönderen alıcının koruyucusuysa 1 Coin = 1 puan.
        await addGuardianPoints((t, p) => c.query(t, p), senderId, item.userId, credit);
        const pkId = await scorePk(c, roomId, item.userId, senderId, credit, credit);
        if (pkId) pkIds.add(pkId);
        // Oda içi PK: alıcı Kırmızı / Mavi takım koltuğundaysa takım puanı.
        roomPkId = (await scoreRoomPk(c, roomId, item.userId, senderId, credit, credit)) ?? roomPkId;
        await c.query(
          `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'gift_sent',$2,$3,$4)`,
          [senderId, (-coinAmount).toString(), gt.id, `Hediye: ${gift.name} x${item.quantity}`],
        );
        if (credit > 0n) {
          await c.query(
            `INSERT INTO wallet_transactions(user_id, transaction_type, diamond_amount, reference_id, description) VALUES($1,'gift_received',$2,$3,$4)`,
            [item.userId, credit.toString(), gt.id, `Hediye: ${gift.name} x${item.quantity}`],
          );
        }

        // Aile katkısı: alıcının ailesine alınan Elmas, gönderenin ailesine harcanan Coin (işlem sonunda toplu).
        // Kendine hediye aileye ve başkan indirimine sayılmaz.
        if (item.userId !== senderId) familyContrib.push({ userId: item.userId, points: credit }, { userId: senderId, points: credit });
        else selfValue += credit;

        // Gizli odanın kimliği tüm kullanıcılara yayılmasın: global şerit/kayıt yalnızca açık odalarda.
        // Şanslı hediye hediye şeridine girmez; büyük kazancı ayrı "şanslı kazanç" şeridiyle duyurulur.
        if (!lucky && coinAmount >= config.globalGiftMinCoins && !room.is_hidden) {
          await c.query(
            `INSERT INTO global_gift_events(gift_transaction_id, room_id, sender_id, receiver_id, coin_amount, display_level)
             VALUES($1,$2,$3,$4,$5,$6)`,
            [gt.id, roomId, senderId, item.userId, coinAmount.toString(), giftDisplayLevel(coinAmount)],
          );
          qualifying.push({ userId: item.userId, coinAmount, quantity: item.quantity });
        }
        transactions.push({
          id: gt.id, receiverId: item.userId, quantity: item.quantity, coinAmount: coinAmount.toString(), diamondAmount: credit.toString(),
        });
      }
    }
    // Aile katkısı ve başkan indirimi (aile satırları sıralı güncellenir).
    await addFamilyContribBatch((t, p) => c.query(t, p), familyContrib, { userId: senderId, coins: totalValue - selfValue });

    // Oda elması: odaya gelen toplam (kalıcı oda kaydında; oda kapanıp açılınca sıfırlanmaz). Kendine hediye de sayılır
    // (koltuk sayaçlarıyla aynı).
    const roomCredit = transactions.reduce((s, t) => s + BigInt(t.diamondAmount), 0n);
    const roomTotal = (await c.query(
      `UPDATE room_profiles SET total_diamonds = total_diamonds + $3 WHERE owner_id = $1 AND room_type = $2 RETURNING total_diamonds`,
      [room.owner_id, room.room_type, roomCredit.toString()],
    )).rows[0]?.total_diamonds ?? null;

    // Şanslı hediye çekilişi (havuzlu): bu gönderimin payı hediyenin havuzuna girer, her adet ayrı çekilir, kazanç
    // havuzdan ödenir (havuz yetmezse daha küçük çarpan). Havuz satırı EN SON kilitlenir (kullanıcı satırlarından sonra):
    // kilit sırası her gönderimde aynı, kilitlenme olmaz.
    let luckyResult = null;
    let balance = sent.coins;
    if (lucky) {
      await c.query(`INSERT INTO lucky_pools(gift_id) VALUES($1) ON CONFLICT (gift_id) DO NOTHING`, [gift.id]);
      const row = (await c.query(`SELECT base_balance, jackpot_balance FROM lucky_pools WHERE gift_id = $1 FOR UPDATE`, [gift.id])).rows[0];
      const draw = drawLuckyPool({
        units: Number(totalUnits), price: BigInt(gift.coin_price),
        pool: { base: BigInt(row.base_balance), jackpot: BigInt(row.jackpot_balance) },
        rtpBps: luckyRtpBps, jackpotShareBps: luckyJackpotShare, maxWin: luckyMaxWin,
      });
      const win = draw.win;
      await c.query(
        `UPDATE lucky_pools SET base_balance = $2, jackpot_balance = $3, total_in = total_in + $4, total_out = total_out + $5,
           jackpot_hits = jackpot_hits + $6, updated_at = NOW() WHERE gift_id = $1`,
        [gift.id, draw.pool.base.toString(), draw.pool.jackpot.toString(), (draw.added.base + draw.added.jackpot).toString(),
          (win * 10000n).toString(), draw.jackpotHits],
      );
      if (win > 0n) {
        balance = (await c.query(
          `UPDATE users SET coins = coins + $1, updated_at = NOW() WHERE id = $2 RETURNING coins`,
          [win.toString(), senderId],
        )).rows[0].coins;
        await c.query(
          `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,'lucky_gift_win',$2,$3,$4)`,
          [senderId, win.toString(), transactions[0].id, `Şanslı hediye kazancı: ${gift.name} (en yüksek x${draw.best})`],
        );
      }
      luckyResult = {
        win: win.toString(), best: draw.best, hits: draw.hits, wins: draw.wins, units: Number(totalUnits),
        jackpot: draw.jackpotHits > 0, pool: poolView(gift.id, gift.coin_price, draw.pool),
      };
    }
    return {
      gift, quantity, totalCoins, balance, transactions, qualifying, allocation, pkIds: [...pkIds], roomPkId, lucky: luckyResult,
      roomTotal: roomTotal === null ? null : String(roomTotal),
      // Duyuru: hem çarpan yüksek hem tek isabetin değeri global hediye eşiğinin üstünde olmalı (10 Coin'lik çanla toplu
      // gönderimde her seferinde x100 çıkıp tüm uygulamaya şerit düşmesin).
      announce: lucky && !room.is_hidden && luckyResult.best >= cfg.luckyAnnounceMultiplier
        && BigInt(luckyResult.best) * BigInt(gift.coin_price) >= BigInt(config.globalGiftMinCoins),
    };
  });

  // ---- Olaylar (işlem başarıyla bittikten sonra) ----
  // Para hareketi tamamlandı: buradan sonraki bir veritabanı hatası 500 döndürmesin (istemci tekrar dener ve iki kez öder).
  let userRows = [];
  try {
    userRows = await loadPublicRows([...new Set([senderId, ...result.allocation.map((a) => a.userId)])]);
  } catch (e) {
    console.error('Hediye sonrası kullanıcı bilgisi alınamadı:', e.message);
  }
  const byId = new Map(userRows.map((u) => [u.id, u]));
  const giftInfo = {
    id: result.gift.id, name: result.gift.name, iconUrl: result.gift.icon_url, animationUrl: result.gift.animation_url,
    animationFormat: result.gift.animation_format, category: result.gift.category, playMode: result.gift.play_mode ?? 'full',
  };
  // Odadakilere gizli kullanıcı gizli ID'siyle; tüm uygulamaya giden şeritlerde gizli ID gönderilmez.
  const sender = roomUser(byId.get(senderId));
  const senderGlobal = publicUser(byId.get(senderId));
  const receivers = result.transactions.map((t) => ({
    user: roomUser(byId.get(t.receiverId)), quantity: t.quantity, coinAmount: t.coinAmount,
  }));

  // Combo (Yoho): aynı kişiye aynı hediye birkaç saniye içinde tekrar gönderilirse sayaç artar (x2, x3 ...).
  // Şanslı hediyede combo penceresi daha uzundur (art arda dokunarak şans denenir).
  const seriesKey = `${roomId}|${senderId}|${giftId}|${distribution}|${result.allocation.map((a) => a.userId).sort().join(',')}`;
  const combo = nextCombo(seriesKey, Date.now(), result.gift.category === 'lucky' ? LUCKY_COMBO_WINDOW_MS : COMBO_WINDOW_MS);
  // Serinin ilk olayı hemen gider; hızlı combo'da sonrakiler ~1 sn'lik pencerede tek olayda birleşir.
  giftEvents.push(seriesKey, roomId, {
    type: 'room_gift', roomId, gift: giftInfo, quantity: result.quantity, totalCoins: result.totalCoins.toString(), sender, receivers, combo,
    lucky: result.lucky, roomTotal: result.roomTotal,
  });
  // Büyük şanslı kazanç tüm uygulamaya duyurulur (Yoho "çan" şeridi).
  if (result.announce) {
    hub.broadcastGlobal({
      type: 'lucky_gift_win', roomId, gift: giftInfo, sender: senderGlobal, multiplier: result.lucky.best, win: result.lucky.win,
    });
  }

  // "Son durum" yayınları: her hediyede değil, oda / PK başına en çok ~saniyede bir (son değer mutlaka gider).
  lastState(`sb|${roomId}`, 900, () => scoreboardOf(roomId).then((scoreboard) => hub.broadcastRoom(roomId, { type: 'room_scoreboard', roomId, scoreboard })));
  if (result.roomPkId) {
    const roomPkId = result.roomPkId;
    lastState(`rpk|${roomPkId}`, 600, () => broadcastRoomPk(roomPkId));
  }
  for (const id of result.pkIds) {
    lastState(`pk|${id}`, 600, () => pkView(id).then((pk) => {
      if (!pk) return;
      hub.broadcastRoom(pk.a.roomId, { type: 'pk_state', pk });
      hub.broadcastRoom(pk.b.roomId, { type: 'pk_state', pk });
    }));
  }

  let ribbon = null;
  if (result.qualifying.length) {
    const q = result.qualifying;
    ribbon = {
      type: 'global_gift_ribbon', roomId, gift: giftInfo,
      quantity: q.reduce((s, x) => s + x.quantity, 0),
      totalCoins: q.reduce((s, x) => s + x.coinAmount, 0n).toString(),
      sender: senderGlobal,
      receivers: q.map((x) => publicUser(byId.get(x.userId))),
    };
    hub.broadcastGlobal(ribbon);
  }

  noteTask(senderId, 'gift');
  res.json({
    gift: giftJson(result.gift), quantity: result.quantity, totalCoins: result.totalCoins.toString(),
    balance: String(result.balance), transactions: result.transactions, ribbon, combo, lucky: result.lucky,
  });
});
