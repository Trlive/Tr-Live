import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { getConfig } from '../system/app_config.service.js';
import { equipIfNone, announceUserChange } from './users.service.js';
import { parseCoins, nextStreak, progress, DEFAULT_SILVER } from './checkin.rules.js';

// Günlük giriş (7 gün): her gün bir kez "Giriş yap" → o günün Coin ödülü; 7. gün ayrıca çerçeve / araç (yönetim seçer).
// Gün İstanbul saatine göre. Aynı gün ikinci kez alınamaz (birincil anahtar: kullanıcı + gün).
const TODAY = `(NOW() AT TIME ZONE 'Europe/Istanbul')::date`;

async function lastCheckin(run, userId) {
  return (await run(
    `SELECT streak, (${TODAY} - day) AS gap FROM daily_checkins WHERE user_id = $1 ORDER BY day DESC LIMIT 1`, [userId],
  )).rows[0] ?? null;
}

/** 7. gün eşyaları (ayarda seçilmiş ve hâlâ etkin olanlar). */
async function day7Items(cfg, run = query) {
  const items = [];
  if (cfg.checkinFrameId) {
    const f = (await run(`SELECT id, name, image_url FROM frames WHERE id = $1 AND is_active = TRUE`, [cfg.checkinFrameId])).rows[0];
    if (f) items.push({ category: 'frame', key: f.id, name: f.name, imageUrl: f.image_url, days: cfg.checkinItemDays });
  }
  if (cfg.checkinVehicleId) {
    const v = (await run(`SELECT id, name, image_url FROM store_items WHERE id = $1 AND category = 'vehicle' AND is_active = TRUE`, [cfg.checkinVehicleId])).rows[0];
    if (v) items.push({ category: 'vehicle', key: v.id, name: v.name, imageUrl: v.image_url, days: cfg.checkinItemDays });
  }
  return items;
}

export async function checkinState(userId) {
  const cfg = await getConfig();
  const coins = parseCoins(cfg.checkinCoins);
  const silver = parseCoins(cfg.checkinSilver, DEFAULT_SILVER);
  const items = await day7Items(cfg);
  const { signedDays, signedToday } = progress(await lastCheckin(query, userId));
  return {
    enabled: cfg.checkinEnabled !== false,
    signedDays,
    signedToday,
    days: coins.map((c, i) => ({ day: i + 1, coins: String(c), silver: String(silver[i]), items: i === 6 ? items : [] })),
  };
}

export async function claimCheckin(userId) {
  const cfg = await getConfig();
  if (cfg.checkinEnabled === false) throw fail('Günlük giriş şu an kapalı.', 403);
  const coins = parseCoins(cfg.checkinCoins);
  const silverDays = parseCoins(cfg.checkinSilver, DEFAULT_SILVER);
  const result = await tx(async (c) => {
    const u = (await c.query(`SELECT coins, silver FROM users WHERE id = $1 FOR UPDATE`, [userId])).rows[0];
    if (!u) throw fail('Kullanıcı bulunamadı.', 404);
    const last = await lastCheckin((t, p) => c.query(t, p), userId);
    if (last && last.gap === 0) throw fail('Bugün zaten giriş yaptın. Yarın tekrar gel!', 409);
    const streak = nextStreak(last);
    const amount = BigInt(coins[streak - 1]);
    const silverAmount = BigInt(silverDays[streak - 1]);
    const items = streak === 7 ? await day7Items(cfg, (t, p) => c.query(t, p)) : [];
    await c.query(
      `INSERT INTO daily_checkins(user_id, day, streak, coins, silver, items) VALUES($1, ${TODAY}, $2, $3, $5, $4)`,
      [userId, streak, amount.toString(), JSON.stringify(items), silverAmount.toString()],
    );
    const before = BigInt(u.coins);
    const after = before + amount;
    if (amount > 0n) {
      await c.query(`UPDATE users SET coins = $2, updated_at = NOW() WHERE id = $1`, [userId, after.toString()]);
      await c.query(
        `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, description) VALUES($1,'daily_bonus',$2,$3)`,
        [userId, amount.toString(), `Günlük giriş ödülü (${streak}. gün)`],
      );
      await c.query(
        `INSERT INTO financial_audit_logs(user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
         VALUES($1,'daily_checkin','daily_checkin',$2,$3,$4,$5,$6)`,
        [userId, String(streak), amount.toString(), before.toString(), after.toString(), JSON.stringify({ streak })],
      );
    }
    let silverAfter = BigInt(u.silver);
    if (silverAmount > 0n) {
      silverAfter += silverAmount;
      await c.query(`UPDATE users SET silver = $2, updated_at = NOW() WHERE id = $1`, [userId, silverAfter.toString()]);
      await c.query(
        `INSERT INTO silver_transactions(user_id, amount, balance_after, type, reference, description) VALUES($1,$2,$3,'daily_checkin',$4,$5)`,
        [userId, silverAmount.toString(), silverAfter.toString(), String(streak), `Günlük giriş Gümüşü (${streak}. gün)`],
      );
    }
    for (const it of items) {
      // Aynı eşya zaten varsa süresi uzar; yoksa yeni kayıt (takılı yoksa kendiliğinden takılır).
      const ext = await c.query(
        `UPDATE inventory_items SET expires_at = GREATEST(expires_at, NOW()) + ($3::int * INTERVAL '1 day')
          WHERE id = (SELECT id FROM inventory_items WHERE user_id = $1 AND item_type = $2 AND item_key = $4 AND is_active = TRUE
                        AND expires_at IS NOT NULL AND expires_at > NOW() ORDER BY expires_at DESC LIMIT 1) RETURNING id`,
        [userId, it.category, it.days, it.key],
      );
      if (ext.rowCount) continue;
      const r = await c.query(
        `INSERT INTO inventory_items(user_id, item_type, item_key, item_name, expires_at, metadata)
         VALUES($1,$2,$3,$4, NOW() + ($5::int * INTERVAL '1 day'), $6) RETURNING id`,
        [userId, it.category, it.key, it.name, it.days, JSON.stringify({ assetUrl: it.imageUrl, source: 'daily_checkin' })],
      );
      await equipIfNone((t, p) => c.query(t, p), userId, it.category, r.rows[0].id);
    }
    return { streak, coins: amount.toString(), silver: silverAmount.toString(), items, balance: after.toString(), silverBalance: silverAfter.toString() };
  });
  if (result.items.length) announceUserChange(userId);
  return result;
}
