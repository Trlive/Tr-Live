// Dönemin kendiliğinden kapanması (v2.152.22, sahibinin kararı: "elmaslar ay sonunda sıfırlanacak").
//
// Önceden dönem yalnızca yönetim panelindeki "Dönemi kapat" tuşuyla kapanıyordu; tuşa basılmazsa ay sonu maaşı yazılmıyor,
// kalan elmas Coin'e çevrilmiyordu. Artık biten dönem, bitişinden GRACE_MS sonra sunucu tarafından kapatılır.
//
// Bir kere çalışma güvencesi closePeriod'da: 'payout_close' danışma kilidi + payout_periods.period_key UNIQUE. İki sunucu
// örneği aynı anda denese de biri "zaten kapatılmış" (409) alır ve sessizce çıkar.
import { log } from '../../infrastructure/observability/log.js';
import { query } from '../../infrastructure/database/database.js';
import { previousPeriod } from '../games/settlement.service.js';
import { loadPayConfig } from '../agencies/agency_metrics.service.js';
import { closePeriod } from './payouts.service.js';
import { notifyUser } from '../notifications/notify.service.js';

/** Dönem bittikten sonra beklenen süre: sınırdaki hediye işlemleri ve avans turu bitsin. */
export const GRACE_MS = 10 * 60e3;

export async function runAutoClose({ now = new Date() } = {}) {
  const cfg = await loadPayConfig(query);
  if (cfg.settings.autoClosePeriod !== true) return { skipped: 'kapalı' };
  const prev = previousPeriod(cfg.settings.cycle, now);
  if (now.getTime() < prev.end.getTime() + GRACE_MS) return { skipped: 'bekleme' };
  if ((await query(`SELECT 1 FROM payout_periods WHERE period_key = $1`, [prev.key])).rowCount) return { skipped: 'kapalı dönem', periodKey: prev.key };
  try {
    const out = await closePeriod({ adminId: null, periodKey: prev.key });
    log.warn('payout_period_auto_closed', {
      periodKey: out.periodKey, hosts: out.hostStatements, salaryCents: out.totalSalaryCents, convertedUsers: out.convertedUsers, convertedCoins: out.convertedCoins,
    });
    notifyHosts(out).catch((e) => log.error('payout_auto_close_notify_failed', { message: e.message }));
    return out;
  } catch (e) {
    if (e.status === 409) return { skipped: e.message, periodKey: prev.key }; // başka örnek kapattı ya da çakışan dönem var
    throw e;
  }
}

/** Kapanıştan sonra: maaşı yatan ve elması Coin'e çevrilen yayıncılara bildirim (para işi bitmiştir; bildirim hatası onu bozmaz). */
async function notifyHosts(out) {
  const r = await query(
    `SELECT x.user_id, COALESCE(s.salary_cents, 0)::text AS cents, COALESCE(d.coins, 0)::text AS coins
     FROM (SELECT user_id FROM host_statements WHERE period_id = $1 UNION SELECT user_id FROM period_diamond_conversions WHERE period_id = $1) x
     LEFT JOIN host_statements s ON s.period_id = $1 AND s.user_id = x.user_id
     LEFT JOIN period_diamond_conversions d ON d.period_id = $1 AND d.user_id = x.user_id`,
    [out.periodId],
  );
  for (const row of r.rows) {
    const cents = BigInt(row.cents); const coins = BigInt(row.coins);
    if (cents <= 0n && coins <= 0n) continue;
    const parts = [];
    if (cents > 0n) parts.push(`maaşın ${(cents / 100n).toString()} Fasulye olarak hesaplandı (avans düşülmüş kalan)`);
    if (coins > 0n) parts.push(`kalan elmasın ${coins.toString()} Coin olarak hesabına eklendi`);
    await notifyUser(row.user_id, 'salary_period', `${out.periodKey} dönemi kapandı`, `${parts.join(', ')}.`, { periodKey: out.periodKey });
  }
}

/** 10 dakikada bir bakar; dönem bitip GRACE_MS geçtiyse kapatır. */
export function startAutoCloseTicker(nonOverlapping, intervalMs = 600e3) {
  const t = setInterval(
    nonOverlapping(() => runAutoClose().catch((e) => log.error('payout_auto_close_failed', { message: e.message }))),
    intervalMs,
  );
  t.unref();
  return t;
}
