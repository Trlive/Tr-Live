// Avans defteri yardımcıları (bağımlılık yok): henüz bir döneme işlenmemiş avansların elmas düşümü.
// run: (sql, params) => Promise<{ rows }> (havuz sorgusu ya da işlemdeki bağlantının query'si).

/** Dönem aralığında avansla Fasulyeye çevrilmiş (bakiyeden düşülmüş) elmas toplamı: Map(user_id → BigInt). */
export async function consumedDiamondsByUser(run, userIds, from, to) {
  const out = new Map();
  if (!userIds.length) return out;
  const rows = (await run(
    `SELECT user_id, SUM(diamonds_consumed)::text AS s FROM salary_advances
     WHERE user_id = ANY($1::uuid[]) AND applied_period_id IS NULL AND created_at >= $2 AND created_at < $3
     GROUP BY user_id`, [userIds, from, to],
  )).rows;
  for (const r of rows) out.set(r.user_id, BigInt(r.s));
  return out;
}
