// Ay başı otomatik dolar aktarımı.
//
// Sahibinin tasarımı: "Tamamlanan ayı izleyen ay başı 1–3 arası, dolar hesaplarına otomatik
// aktarılacak. Talep oluşturmaya gerek olmayacak." Yani ne yayıncı talep açıyor ne yönetici
// tuşa basıyor; hak edilmiş maaş kendiliğinden dolar bakiyesine geçiyor.
//
// ## En sert şart: BİR KERE
//
// "1–3 aktarımı bir kere çalışmalı. Sistem yeniden başlasa ya da işlem tekrarlansa bile
// yayıncıya iki defa dolar yazılmamalı."
//
// Bunu kodla garanti etmek mümkün değil: sunucu iki örnekte çalışabilir, işlem yarıda
// kesilebilir, zamanlanmış iş iki kez tetiklenebilir, süreç aktarımın ortasında ölebilir.
// Güvence VERİTABANINDA, üç kat:
//
//   1. `salary_transfer_runs` tablosuna satır EKLEME. `period_key` birincil anahtar, yani
//      ikinci deneme çakışır ve aktarım hiç başlamaz. Satır aktarımla AYNI transaction
//      içinde eklenir: aktarım geri alınırsa satır da gider, böylece yarım kalan bir
//      çalışma dönemi sonsuza kadar kilitlemez.
//   2. `host_statements.status = 'pending'` koşulu. Ödenen satır 'paid' oluyor; aynı satır
//      ikinci kez seçilemez. Aktarım iki kez başlasa bile ödenecek satır kalmaz.
//   3. Danışma kilidi (advisory lock). İki örnek aynı anda başlarsa biri bekler, sonra
//      1. kattaki çakışmayı görüp çıkar.
//
// Üç kattan herhangi biri tek başına yeterli olurdu; üçü birlikte, birinin varsayımı
// yanlış çıktığında diğerinin tutmasını sağlıyor. Para işinde bu fazlalık değil.
//
// ## Ne ödenir
//
// Yalnızca KAPANMIŞ dönemlerin bekleyen özetleri. Kapanmamış dönem ödenmez: tutar daha
// kesinleşmedi. Telefonu doğrulanmamış yayıncı atlanır ve özeti 'pending' kalır — parası
// kaybolmaz, telefonunu doğruladıktan sonraki çalışmada ödenir.
import { tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { creditPeriod } from './usd_wallet.service.js';
import { loadPayConfig } from '../agencies/agency_metrics.service.js';
import { log } from '../../infrastructure/observability/log.js';

/** Ayın kaçıncı günündeyiz (yerel değil, UTC — sunucu saat dilimi değişse de aynı davransın). */
const dayOfMonth = (now) => now.getUTCDate();

/**
 * Aktarımın şu an çalışması gerekiyor mu?
 * Saf fonksiyon: sınanabilsin diye tarih ve ayarlar dışarıdan veriliyor.
 */
export function shouldRun({ settings, now }) {
  if (settings.salaryAutoTransfer !== true) return { run: false, reason: 'kapalı' };
  const d = dayOfMonth(now);
  const from = settings.salaryTransferDayFrom ?? 1;
  const to = settings.salaryTransferDayTo ?? 3;
  if (d < from || d > to) return { run: false, reason: `ayın ${d}. günü, aktarım penceresi ${from}–${to}` };
  return { run: true, reason: null };
}

/**
 * Bir dönemin maaşlarını dolar bakiyesine aktarır. BİR KERE çalışır.
 *
 * @param periodKey  Aktarılacak (kapanmış) dönem.
 * @param trigger    'auto' (zamanlanmış iş) ya da 'manual' (yönetici başlattı).
 * @param actorId    Elle başlatıldıysa yöneticinin kimliği.
 * @returns { already: true } ya da { periodKey, paidCount, paidCents, skippedCount }
 */
export async function transferPeriod({ periodKey, trigger = 'auto', actorId = null }) {
  return tx(async (c) => {
    // 3. kat: iki örnek aynı anda girmesin.
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('salary_transfer'))`);

    const period = (await c.query(
      `SELECT id, period_key FROM payout_periods WHERE period_key = $1`, [periodKey],
    )).rows[0];
    // Kapanmamış dönem ödenmez: tutar kesinleşmedi.
    if (!period) throw fail('Bu dönem kapatılmamış; aktarım yapılamaz.', 409);

    // 1. kat: satırı eklemeyi dene. Zaten varsa aktarım daha önce yapıldı.
    const claim = await c.query(
      `INSERT INTO salary_transfer_runs(period_key, period_id, started_by, trigger)
       VALUES($1,$2,$3,$4) ON CONFLICT (period_key) DO NOTHING RETURNING period_key`,
      [period.period_key, period.id, actorId, trigger],
    );
    if (!claim.rowCount) {
      // Bu, hata değil DOĞRU davranış: ikinci çağrı sessizce hiçbir şey yapmıyor.
      return { already: true, periodKey: period.period_key };
    }

    // Ödemeden önce atlanacakları say: panelde "kaç kişi telefonunu doğrulamadı" görünsün.
    const pendingBefore = Number((await c.query(
      `SELECT COUNT(*)::int AS n FROM host_statements
        WHERE period_id = $1 AND status = 'pending' AND salary_cents > 0`, [period.id],
    )).rows[0].n);

    // 2. kat: creditPeriod yalnızca 'pending' satırları ödeyip 'paid' yapıyor.
    const out = await creditPeriod(c, period.id, actorId, { kinds: ['host'], note: `${period.period_key} maaşı otomatik aktarıldı` });

    const skipped = Math.max(0, pendingBefore - out.count);
    await c.query(
      `UPDATE salary_transfer_runs SET finished_at = NOW(), paid_count = $2, paid_cents = $3, skipped_count = $4
        WHERE period_key = $1`,
      [period.period_key, out.count, out.cents.toString(), skipped],
    );

    log.info('salary_transfer', {
      periodKey: period.period_key, trigger, paidCount: out.count, paidCents: String(out.cents), skippedCount: skipped,
    });
    return { periodKey: period.period_key, paidCount: out.count, paidCents: out.cents.toString(), skippedCount: skipped };
  });
}

/**
 * Zamanlanmış iş: pencere içindeyse ve bayrak açıksa, aktarılmamış kapanmış dönemleri aktarır.
 *
 * Tek dönem değil, aktarılmamış TÜM kapanmış dönemleri geziyor: sunucu ayın 1–3'ünde kapalı
 * kalmışsa o ayın maaşı atlanmış olurdu. Böyle bir dönem bir sonraki pencerede ödenir.
 */
export async function runAutoTransfer({ now = new Date() } = {}) {
  const cfg = await loadPayConfig();
  const gate = shouldRun({ settings: cfg.settings, now });
  if (!gate.run) return { skipped: true, reason: gate.reason };

  const { query } = await import('../../infrastructure/database/database.js');
  const due = (await query(
    `SELECT p.period_key FROM payout_periods p
      LEFT JOIN salary_transfer_runs r ON r.period_key = p.period_key
      WHERE r.period_key IS NULL
        AND EXISTS (SELECT 1 FROM host_statements s WHERE s.period_id = p.id AND s.status = 'pending' AND s.salary_cents > 0)
      ORDER BY p.ends_at`,
  )).rows;

  const results = [];
  for (const d of due) {
    try {
      results.push(await transferPeriod({ periodKey: d.period_key, trigger: 'auto' }));
    } catch (e) {
      // Bir dönem patlarsa diğerleri ödenmeye devam etsin; kaldığı yerden sürer.
      log.error('salary_transfer_error', { periodKey: d.period_key, message: e.message });
      results.push({ periodKey: d.period_key, error: e.message });
    }
  }
  return { skipped: false, periods: results };
}

/**
 * Zamanlanmış iş: saatte bir bakar, pencere içindeyse aktarımı yapar.
 *
 * Saatte bir YETERLİ: pencere üç gün (ayın 1–3'ü), yani 72 fırsat var. Daha sık bakmanın
 * faydası yok; daha seyrek bakmak, sunucu yeniden başlatmalarıyla birleşince pencereyi
 * kaçırma riskini artırırdı.
 *
 * `nonOverlapping` ile sarılıyor: bir tur uzun sürerse ikincisi başlamıyor. Buna ek olarak
 * `transferPeriod` kendi içinde zaten "bir kere" güvencesine sahip — bu sarmalayıcıya
 * güvenmiyoruz, yalnızca gereksiz işi önlüyor.
 */
export function startSalaryTransferTicker(nonOverlapping, intervalMs = 3600e3) {
  const t = setInterval(
    nonOverlapping(() => runAutoTransfer().then((r) => {
      if (!r.skipped && r.periods?.length) {
        log.info('salary_transfer_tick', { periods: r.periods.length });
      }
    }).catch((e) => log.error('salary_transfer_tick_failed', { message: e.message }))),
    intervalMs,
  );
  t.unref();
  return t;
}
