// Yönetici paneli — Coin yükleme.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { SUPPORT_COIN_LIMIT, SUPPORT_COIN_LOADS_PER_HOUR, assertStaffTarget, bigAmount, budget, chargeBudget, config, fail, groupDigits, hitLimit, idempotent, text, tx, uuid } from './admin.shared.js';

export const router = Router();

// ---------------- Coin ----------------
// Yönetici: sınırsız ekler / düşer. Yardımcı admin: yalnızca normal kullanıcıya, tek seferde en fazla 100.000 Coin yükler (düşemez).
router.post('/users/:userId/coins', idempotent('admin_coins'), async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const delta = bigAmount(req.body?.amount, 'Coin miktarı', { allowNegative: true });
  const reason = text(req.body?.reason, 'Neden', { max: 300 }) || 'Admin Coin düzenlemesi';
  // Basım bütçesi (isteğe bağlı): sıfırdan üretilen Coin hangi bütçeden çıkıyor?
  // Seçilmezse bu bir satış/düzeltme kaydıdır ve bütçeye yazılmaz.
  const budgetKey = text(req.body?.budgetKey, 'Bütçe', { max: 40 }) || null;
  const support = req.user.system_role !== 'admin';
  if (support) {
    if (delta <= 0n) throw fail('Yardımcı admin yalnızca Coin yükleyebilir (düşemez).', 403);
    if (delta > SUPPORT_COIN_LIMIT) throw fail('Yardımcı admin tek seferde en fazla 100.000 Coin yükleyebilir.', 403);
    await assertStaffTarget(req, userId);
    // Kötüye kullanıma karşı hız sınırı: yardımcı admin saatte en fazla 30 yükleme yapar.
    if (!hitLimit(`support_coins:${req.user.id}`, SUPPORT_COIN_LOADS_PER_HOUR, 3600e3).allowed) throw fail('Çok fazla Coin yükleme yaptınız; biraz sonra tekrar deneyin.', 429);
  }
  const result = await tx(async (c) => {
    if (support) {
      // Kalıcı sınırlar (işlem kaydından): sunucu yeniden başlasa da sıfırlanmaz. Aynı yardımcı adminin eşzamanlı
      // yüklemeleri sırayla denetlenir (sınır iki istekle aşılamasın).
      await c.query(`SELECT pg_advisory_xact_lock(hashtext('support_coins:' || $1::text))`, [req.user.id]);
      const used = (await c.query(
        `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS hour_loads, COALESCE(SUM(amount_coins), 0)::text AS day_coins
         FROM financial_audit_logs WHERE admin_id = $1 AND action = 'admin_coin_adjustment' AND created_at > NOW() - INTERVAL '24 hours'`,
        [req.user.id],
      )).rows[0];
      if (used.hour_loads >= SUPPORT_COIN_LOADS_PER_HOUR) throw fail('Çok fazla Coin yükleme yaptınız; biraz sonra tekrar deneyin.', 429);
      const cap = config.supportCoinDailyLimit;
      if (cap === 0n) throw fail('Yardımcı adminin Coin yüklemesi sunucu ayarında kapalı.', 403);
      const left = cap - BigInt(used.day_coins);
      if (delta > left) {
        throw fail(`Yardımcı admin 24 saatte en fazla ${groupDigits(cap)} Coin yükleyebilir (kalan: ${groupDigits(left > 0n ? left : 0n)}).`, 403);
      }
    }
    const user = (await c.query(`SELECT coins FROM users WHERE id = $1 AND account_status = 'active' FOR UPDATE`, [userId])).rows[0];
    if (!user) throw fail('Kullanıcı bulunamadı.', 404);
    const before = BigInt(user.coins);
    const after = before + delta;
    if (after < 0n) throw fail('Bakiye negatife düşemez.');
    await c.query(`UPDATE users SET coins = $1, updated_at = NOW() WHERE id = $2`, [after.toString(), userId]);
    // Bütçe seçildiyse sınır burada denetlenir: aşılırsa yükleme de geri alınır (aynı transaction).
    const charged = budgetKey ? await chargeBudget(c, { key: budgetKey, userId, adminId: req.user.id, delta, reason }) : null;
    await c.query(
      `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, description) VALUES($1,$2,$3,$4)`,
      [userId, budgetKey ?? 'admin_adjustment', delta.toString(), reason],
    );
    // Basım bütçesinden yapılan yüklemeler (test, etkinlik ödülü, telafi, pazarlama) yönetici işlem
    // günlüğüne YAZILMAZ — sahibin kararı. Bunlar gerçek bir para hareketi değil, sıfırdan üretilen
    // sanal bakiye; günlüğü doldurup gerçek düzenlemeleri görünmez kılıyordu.
    // Satış ve düzeltme yüklemeleri (bütçesiz) her zamanki gibi kaydedilir.
    if (!budgetKey) {
      await c.query(
        `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, amount_coins, balance_before, balance_after, metadata)
         VALUES($1,$2,'admin_coin_adjustment','user',$3,$4,$5,$6)`,
        [req.user.id, userId, delta.toString(), before.toString(), after.toString(),
          JSON.stringify({ reason, by: req.user.system_role })],
      );
    }
    return { before: before.toString(), after: after.toString(), budget: budgetKey };
  });
  res.json(result);
});

// ---------------- Seviye ----------------
// Kullanıcı seviyesi (gönderilen Coin) veya yayıncı seviyesi (alınan Elmas) verilir: seviye için gereken exp farkı
// level_exp_bonus / host_level_exp_bonus'a yazılır; gerçek harcama / kazanç değişmez, sonraki hediyeler üstüne eklenir.
// Yönetici: 1-300 arası her seviye (düşürebilir de). Yardımcı admin: yalnızca normal kullanıcıya, en fazla 100. seviye ve yalnızca yükseltir.
