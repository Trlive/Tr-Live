// Basım bütçeleri: sıfırdan üretilen Coin'in kategorisi ve aylık sınırı.
//
// Yönetici Coin yüklerken bir bütçe seçer; aylık sınır denetlenir.
//
// Eskiden her basım AYRI bir `coin_issuances` satırına da yazılıyordu. O tablo defterin birebir
// kopyasıydı (aynı transaction, aynı tutar, aynı bütçe anahtarı) ve kaldırıldı. Aylık kullanım
// artık doğrudan `wallet_transactions`'tan hesaplanıyor: tek kayıt, aynı sonuç.
//
// Defter satırı bu yüzden zorunlu: "bu ay bu bütçeden ne kadar basıldı" sorusunun cevabı odur.
// Satır olmazsa aylık sınır denetlenemez (sınırsız basım) ve günlük mutabakat her basımı kalıcı
// bir açık olarak görür. Satır duruyor ama hiçbir insanın baktığı listede görünmüyor —
// bkz. HIDDEN_TX_TYPES.
import { query } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';

/** Türkiye saatine göre dönem anahtarı (YYYY-MM). Ay sonu yüklemeleri doğru aya yazılsın. */
export function periodKey(date = new Date()) {
  const tr = new Date(date.getTime() + 3 * 3600 * 1000);
  return `${tr.getUTCFullYear()}-${String(tr.getUTCMonth() + 1).padStart(2, '0')}`;
}

/// Basımların defterdeki tür adı = bütçe anahtarının kendisi. Bu türler hiçbir insan listesinde
/// gösterilmez.
///
/// Liste **veritabanından** okunuyor, koda yazılmıyor: panelden beşinci bir bütçe eklendiğinde
/// onun satırlarının da gizlenmesi gerekir. Sabit liste, yeni bütçeyi sessizce görünür bırakırdı.
let hiddenCache = { at: 0, keys: [] };

export async function hiddenTxTypes() {
  if (Date.now() - hiddenCache.at < 60_000 && hiddenCache.keys.length) return hiddenCache.keys;
  try {
    const r = await query(`SELECT key FROM coin_budgets`);
    hiddenCache = { at: Date.now(), keys: r.rows.map((x) => x.key) };
  } catch {
    // Veritabanı okunamadıysa eldeki liste kullanılır; boşsa gizleme yapılmaz (liste görünür kalır,
    // veri kaybı ya da yanlış sayı olmaz).
  }
  return hiddenCache.keys;
}

/** Bütçe eklenip silindiğinde çağrılır. */
export function invalidateHidden() { hiddenCache = { at: 0, keys: [] }; }

/// Defterdeki satırın hangi aya yazıldığı (Türkiye saati). `periodKey` ile aynı kuralı SQL'de uygular.
const PERIOD_SQL = `to_char(created_at AT TIME ZONE 'Europe/Istanbul', 'YYYY-MM')`;

/** Bütçeler + bu ayın kullanımı (panel). Kullanım doğrudan defterden okunur. */
export async function listBudgets(period = periodKey()) {
  const r = await query(
    `SELECT b.key, b.name, b.monthly_limit, b.enabled, b.note, b.updated_at,
            COALESCE(u.used, 0) AS used, COALESCE(u.grants, 0) AS grants
       FROM coin_budgets b
       LEFT JOIN (SELECT transaction_type AS budget_key, SUM(coin_amount) AS used, COUNT(*)::int AS grants
                    FROM wallet_transactions
                   WHERE ${PERIOD_SQL} = $1
                   GROUP BY transaction_type) u ON u.budget_key = b.key
      ORDER BY b.name`, [period],
  );
  return r.rows.map((x) => ({
    key: x.key, name: x.name, monthlyLimit: String(x.monthly_limit), enabled: x.enabled, note: x.note,
    used: String(x.used), grants: x.grants,
    left: Number(x.monthly_limit) === 0 ? null : String(BigInt(x.monthly_limit) - BigInt(x.used)),
    updatedAt: x.updated_at,
  }));
}

/**
 * Bir Coin yüklemesini bütçeye yazar. Yükleme ile AYNI transaction içinde çağrılır:
 * sınır aşılırsa yükleme de geri alınır.
 * `delta` eksi olabilir (düzeltme/geri alma): o zaman bütçeye geri yazılır, sınır denetlenmez.
 */
export async function chargeBudget(c, { key, userId, adminId, delta, reason }) {
  const period = periodKey();
  // Aynı bütçeye eşzamanlı yüklemeler sıraya girer: iki istek sınırı birlikte aşamasın.
  await c.query(`SELECT pg_advisory_xact_lock(hashtext('coin_budget:' || $1::text))`, [key]);
  const b = (await c.query(`SELECT key, name, monthly_limit, enabled FROM coin_budgets WHERE key = $1`, [key])).rows[0];
  if (!b) throw fail('Bütçe bulunamadı.', 404);
  if (!b.enabled) throw fail(`"${b.name}" bütçesi kapalı.`, 403);
  if (delta > 0n && BigInt(b.monthly_limit) > 0n) {
    const used = BigInt((await c.query(
      `SELECT COALESCE(SUM(coin_amount), 0)::text AS n FROM wallet_transactions
        WHERE transaction_type = $1 AND ${PERIOD_SQL} = $2`, [key, period],
    )).rows[0].n);
    const left = BigInt(b.monthly_limit) - used;
    if (delta > left) {
      throw fail(`"${b.name}" bütçesinin bu ayki sınırı aşılıyor. Kalan: ${left > 0n ? left : 0n} Coin.`, 403);
    }
  }
  // Ayrı basım kaydı YAZILMAZ: defter satırı (wallet_transactions) zaten aynı transaction içinde,
  // aynı tutarla ve bütçe anahtarını tür adı olarak taşıyarak yazılıyor. İkinci kayıt kopyaydı.
  return { period, name: b.name };
}

// Aylık basım özeti ve "son basımlar" listesi KALDIRILDI (sahibin kararı): test, etkinlik,
// telafi ve pazarlama basımları hiçbir insan listesinde görünmüyor. Bütçe kartındaki
// "bu ay kullanılan / sınır" sayacı duruyor — o bir liste değil, sınırın kendisi.
