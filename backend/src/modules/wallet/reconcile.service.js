// F-02: Bakiye ↔ işlem defteri mutabakatı.
//
// Değişmez kural (28 para yolunun tamamında geçerli): bakiyeyi değiştiren her kod, aynı
// transaction içinde işaretli (harcama eksi, kazanç artı) bir `wallet_transactions` satırı yazar.
// Mutabakat her gün bunu doğrular. Doğrulanan eşitlik, kullanıcı başına:
//
//     users.coins - taban.coins  ==  Σ(tüm defter satırları) - taban.led_coins
//
// Taban kullanıcı başına bir kez alınır ve o andaki bakiyeyle o andaki defter toplamını birlikte
// saklar. İki taraf da TEK sorguda okunduğundan, sorgu sürerken işlenen bir hediye iki tarafta da
// görünür ya da iki tarafta da görünmez: zaman penceresinden doğan yanlış alarm olmaz.
//
// Ölçek notu: sorgu `wallet_transactions` tablosunun tamamını bir kez tarar. Günde bir çalıştığı
// için bugünkü boyutta sorun değil. Tablo ~50 milyon satırı geçerse artımlı yönteme geçilmeli
// (o zaman commit sırası / zaman damgası farkı için güvenlik payı gerekir).
import { query, tx } from '../../infrastructure/database/database.js';

/** Tam tablo taraması: genel 30 sn sorgu sınırı yerine yalnızca bu sorgu için 10 dk (bkz. database.js). */
const longQuery = (sql, params = []) => tx(async (c) => {
  await c.query(`SET LOCAL statement_timeout = '10min'`);
  return c.query(sql, params);
});

/** Son çalışma ve açık (çözülmemiş) fark sayısı — panel ve uyarı için. */
export async function reconcileStatus() {
  const last = (await query(
    `SELECT id, started_at, finished_at, users_checked, users_new, mismatches, coin_diff, diamond_diff,
            total_coins, total_diamonds, manual, failed, note
       FROM wallet_recon_runs ORDER BY id DESC LIMIT 1`,
  )).rows[0] ?? null;
  const open = (await query(`SELECT COUNT(*)::int AS n FROM wallet_recon_items WHERE NOT resolved`)).rows[0].n;
  return { last, openItems: open };
}

/**
 * Mutabakatı çalıştırır. Fark bulursa kaydeder ve mali denetim günlüğüne alarm yazar.
 * Fark kendiliğinden kaybolmaz: panelden incelenip "çözüldü" işaretlenir.
 */
export async function runReconciliation({ manual = false, startedBy = null } = {}) {
  const run = (await query(
    `INSERT INTO wallet_recon_runs(manual, started_by) VALUES($1,$2) RETURNING id, started_at`,
    [manual === true, startedBy],
  )).rows[0];
  try {
    // 1) Tabanı olmayan kullanıcılar için taban al. Bakiye ve defter toplamı aynı sorguda okunur.
    const added = await longQuery(
      `INSERT INTO wallet_recon_baseline(user_id, coins, diamonds, led_coins, led_diamonds)
       SELECT u.id, u.coins, u.diamonds, COALESCE(w.c, 0), COALESCE(w.d, 0)
         FROM users u
         LEFT JOIN (SELECT user_id, SUM(coin_amount) AS c, SUM(diamond_amount) AS d
                      FROM wallet_transactions GROUP BY user_id) w ON w.user_id = u.id
        WHERE NOT EXISTS (SELECT 1 FROM wallet_recon_baseline b WHERE b.user_id = u.id)
       ON CONFLICT (user_id) DO NOTHING`,
    );

    // 2) Denetim: tabanı olan her kullanıcı için eşitlik kontrolü (tek sorgu = tutarlı görüntü).
    const check = await longQuery(
      `WITH led AS (SELECT user_id, SUM(coin_amount) AS c, SUM(diamond_amount) AS d
                      FROM wallet_transactions GROUP BY user_id),
            calc AS (
              SELECT b.user_id,
                     (u.coins    - b.coins)    - (COALESCE(led.c, 0) - b.led_coins)    AS coin_diff,
                     (u.diamonds - b.diamonds) - (COALESCE(led.d, 0) - b.led_diamonds) AS diamond_diff,
                     u.coins AS actual_coins, u.diamonds AS actual_diamonds
                FROM wallet_recon_baseline b
                JOIN users u ON u.id = b.user_id
                LEFT JOIN led ON led.user_id = b.user_id
            )
       SELECT (SELECT COUNT(*)::int FROM calc)                      AS users_checked,
              (SELECT COALESCE(SUM(coins), 0)    FROM users)        AS total_coins,
              (SELECT COALESCE(SUM(diamonds), 0) FROM users)        AS total_diamonds,
              COALESCE(json_agg(json_build_object(
                'userId', user_id, 'coinDiff', coin_diff, 'diamondDiff', diamond_diff,
                'coins', actual_coins, 'diamonds', actual_diamonds
              )) FILTER (WHERE coin_diff <> 0 OR diamond_diff <> 0), '[]'::json) AS bad
         FROM calc`,
    );
    const row = check.rows[0];
    const bad = row.bad ?? [];

    // 3) Farkları kaydet.
    if (bad.length) {
      await query(
        `INSERT INTO wallet_recon_items(run_id, user_id, coin_diff, diamond_diff, actual_coins, actual_diamonds)
         SELECT $1, v.uid, v.cd, v.dd, v.c, v.d
           FROM unnest($2::uuid[], $3::bigint[], $4::bigint[], $5::bigint[], $6::bigint[]) AS v(uid, cd, dd, c, d)`,
        [run.id, bad.map((x) => x.userId), bad.map((x) => String(x.coinDiff)), bad.map((x) => String(x.diamondDiff)),
          bad.map((x) => String(x.coins)), bad.map((x) => String(x.diamonds))],
      );
      // Alarm: mali denetim günlüğüne tek satır (panelde "İşlem kaydı" sekmesinde de görünür).
      await query(
        `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
         VALUES($1,'reconcile_mismatch','reconcile',$2,$3,0,0,$4)`,
        [startedBy, String(run.id), String(bad.reduce((s, x) => s + BigInt(x.coinDiff), 0n)),
          JSON.stringify({ users: bad.length, sample: bad.slice(0, 20) })],
      ).catch((e) => console.error('[mutabakat] alarm yazılamadı:', e.message));
      console.error(`[mutabakat] ${bad.length} kullanıcıda fark bulundu (çalışma #${run.id}).`);
    }

    const coinDiff = bad.reduce((s, x) => s + BigInt(x.coinDiff), 0n);
    const diaDiff = bad.reduce((s, x) => s + BigInt(x.diamondDiff), 0n);
    await query(
      `UPDATE wallet_recon_runs SET finished_at = NOW(), users_checked = $2, users_new = $3, mismatches = $4,
              coin_diff = $5, diamond_diff = $6, total_coins = $7, total_diamonds = $8 WHERE id = $1`,
      [run.id, row.users_checked, added.rowCount, bad.length, coinDiff.toString(), diaDiff.toString(),
        String(row.total_coins), String(row.total_diamonds)],
    );
    return {
      runId: Number(run.id), usersChecked: row.users_checked, usersNew: added.rowCount,
      mismatches: bad.length, coinDiff: coinDiff.toString(), diamondDiff: diaDiff.toString(),
      totalCoins: String(row.total_coins), totalDiamonds: String(row.total_diamonds),
    };
  } catch (error) {
    await query(`UPDATE wallet_recon_runs SET finished_at = NOW(), failed = TRUE, note = $2 WHERE id = $1`,
      [run.id, String(error.message).slice(0, 400)]).catch(() => {});
    throw error;
  }
}

/** Günlük zamanlayıcı: son 20 saatte çalışma yoksa çalıştırır (yeniden başlatmalar işi tekrarlamasın). */
export function startReconcileTicker() {
  const tick = async () => {
    try {
      const r = await query(`SELECT 1 FROM wallet_recon_runs WHERE started_at > NOW() - INTERVAL '20 hours' LIMIT 1`);
      if (r.rowCount) return;
      const out = await runReconciliation();
      console.log(`[mutabakat] ${out.usersChecked} kullanıcı denetlendi, ${out.mismatches} fark.`);
    } catch (e) { console.error('[mutabakat] çalıştırılamadı:', e.message); }
  };
  const first = setTimeout(tick, 120000); // açılıştan 2 dk sonra
  first.unref();
  const timer = setInterval(tick, 3600e3); // saat başı bakar, günde bir çalışır
  timer.unref();
  return timer;
}
