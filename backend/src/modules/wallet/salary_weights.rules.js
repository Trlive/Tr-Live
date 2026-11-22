// Maaş hak edişi — EŞİKLİ koşullar (sahibinin kuralı).
//
// ## Kural
//
//     hak edilen = temel maaş × Σ(tutan koşulların ağırlıkları)
//
// Koşul ya TUTAR ya TUTMAZ. Kısmi kredi YOKTUR. Sahibinin sözleri:
//
//     "21 gün 59 dk bile olsa maaşın yarısı yatacak!"
//     "gün ve yayın saati eksikse yaptığı kotanın yarısı yatacak,
//      tüm koşullar sağlanınca hepsi"
//
// Yani 22 gün isteniyorsa 21 gün EKSİKTİR; 80 saat isteniyorsa 79 sa 59 dk EKSİKTİR.
// Aradaki fark ne kadar küçük olursa olsun koşul tutmamıştır.
//
// ## Gün ve saat TEK koşuldur
//
// Sahibi bu ikisini her seferinde birlikte söyledi ("gün ve yayın saati eksikse yarısı").
// Bu yüzden ayrı ağırlıkları yok: ikisi birlikte "devam" (attendance) koşulunu oluşturuyor
// ve bu koşulun ağırlığı varsayılan olarak 5000 (= %50). Gün eksik olsa da, saat eksik olsa
// da, ikisi birden eksik olsa da sonuç aynı: maaşın yarısı.
//
// Ayrı ağırlık verseydik (gün 2500 + saat 2500) yalnızca günü eksik olan yayıncıya %75
// ödenirdi — sahibinin söylediği %50 değil.
//
// ## Önceki sürümde yanlış yapmıştım
//
// v2.150.0'da bu koşulları ORANLI kurmuştum: 22 günün 20'sini yapan, o koşulun payının
// %90'ını alıyordu. Sahibi düzeltti. Kayıt olarak bırakıyorum: oranlı hesap daha "adil"
// görünüyor ama istenen kural bu değil ve istenmeyen bir kuralı güzel diye uygulamak
// yanlış para ödemektir. Ağırlıklı hesap hiç ödemeye esas olmadığı (bayrak kapalı) için
// kimseye yanlış ödeme yapılmadı.
//
// ## Para matematiği tam sayıdır
//
// Ondalık yok. Ağırlıklar on binde (bps). Bölme tek yerde, en sonda, aşağı yuvarlama.
//
// ## Bu dosya saftır
//
// Veritabanı, istek, saat yok. Girdi verilir, sonuç döner.

/** Ağırlık anahtarları. Panelden bu üçünün ağırlığı değiştirilir. */
export const WEIGHT_KEYS = Object.freeze(['attendance', 'diamonds', 'tasks']);

export const WEIGHT_LABELS = Object.freeze({
  attendance: 'Gün ve yayın saati',
  diamonds: 'Elmas hedefi',
  tasks: 'Görev / etkinlik',
});

/**
 * Varsayılan ağırlıklar (on binde; toplamı 10000 = %100).
 *
 * devam 5000 → gün ya da saat eksikse tam olarak maaşın yarısı yatar (sahibinin kuralı).
 * Sahibi %60 isterse bu ağırlığı 4000'e indirir; panel sonucu canlı gösteriyor.
 */
export const DEFAULT_WEIGHTS = Object.freeze({ attendance: 5000, diamonds: 3000, tasks: 2000 });

export const TOTAL_BPS = 10000;

/** Ağırlıkları doğrular. Toplam 10000 DEĞİLSE hata: aksi halde kimse %100 alamaz ya da
 *  %100'den fazla alır ve bunu kimse fark etmez. */
export function validateWeights(input) {
  if (input === null || input === undefined) return { ...DEFAULT_WEIGHTS };
  if (typeof input !== 'object' || Array.isArray(input)) throw bad('Maaş ağırlıkları geçersiz.');
  const out = {};
  for (const k of WEIGHT_KEYS) {
    const v = input[k];
    const n = typeof v === 'string' && /^\d{1,5}$/.test(v.trim()) ? Number(v.trim()) : v;
    if (!Number.isInteger(n) || n < 0 || n > TOTAL_BPS) {
      throw bad(`"${WEIGHT_LABELS[k]}" ağırlığı 0-${TOTAL_BPS} arasında tam sayı olmalı.`);
    }
    out[k] = n;
  }
  for (const k of Object.keys(input)) {
    if (!WEIGHT_KEYS.includes(k)) throw bad(`Bilinmeyen maaş koşulu: ${k}`);
  }
  const sum = WEIGHT_KEYS.reduce((a, k) => a + out[k], 0);
  if (sum !== TOTAL_BPS) {
    throw bad(`Ağırlıkların toplamı ${TOTAL_BPS} olmalı (şu an ${sum}). Aksi halde kimse maaşının tamamını hak edemez.`);
  }
  return out;
}

function bad(message) {
  return Object.assign(new Error(message), { status: 400 });
}

/** Gösterim için oran (on binde). Hak edişi ETKİLEMEZ — yalnızca yayıncı "ne kadarını
 *  yaptım" görsün diye. Hak edişi `met` belirliyor. */
function ratioBps(completed, required) {
  const req = BigInt(required ?? 0);
  if (req <= 0n) return BigInt(TOTAL_BPS);
  const got = BigInt(completed ?? 0);
  if (got <= 0n) return 0n;
  const r = (got * BigInt(TOTAL_BPS)) / req;
  return r > BigInt(TOTAL_BPS) ? BigInt(TOTAL_BPS) : r;
}

/**
 * Hak edişi hesaplar.
 *
 * @param tier       Sözleşme kademesi: { level, days, hours, diamonds, salary1Cents }. Yoksa null.
 * @param metrics    { validDays, seconds, diamonds } — dönemde gerçekleşenler.
 * @param eventsOk   Görev / resmî etkinlik koşulu tuttu mu.
 * @param weights    validateWeights'ten geçmiş ağırlıklar.
 * @returns null (sözleşme kademesi yok) ya da hak ediş dökümü.
 */
export function evaluateWeightedSalary({ tier, metrics = {}, eventsOk = true, weights = DEFAULT_WEIGHTS }) {
  if (!tier) return null;

  const w = validateWeights(weights);
  const baseCents = BigInt(tier.salary1Cents ?? 0);

  // Saat karşılaştırması SANİYE üzerinden. Saate çevirip karşılaştırmak 79 sa 59 dk'yı
  // 79 saate yuvarlardı; biz tam sınırı istiyoruz.
  const requiredSeconds = tier.hours == null ? 0 : Number(tier.hours) * 3600;
  const completedSeconds = Number(metrics.seconds ?? 0);
  const requiredDays = tier.days == null ? 0 : Number(tier.days);
  const completedDays = Number(metrics.validDays ?? 0);
  const requiredDiamonds = BigInt(tier.diamonds ?? 0);
  const completedDiamonds = BigInt(metrics.diamonds ?? 0);

  // EŞİK: hedefe ULAŞILDI mı. Hedef aranmıyorsa (null/0) koşul tutmuş sayılır.
  const daysOk = requiredDays <= 0 || completedDays >= requiredDays;
  const hoursOk = requiredSeconds <= 0 || completedSeconds >= requiredSeconds;
  // Gün ve saat TEK koşul: biri eksikse devam koşulu tutmaz.
  const attendanceOk = daysOk && hoursOk;
  const diamondsOk = requiredDiamonds <= 0n || completedDiamonds >= requiredDiamonds;
  const tasksOk = eventsOk === true;

  const met = { attendance: attendanceOk, diamonds: diamondsOk, tasks: tasksOk };

  // Σ(tutan koşulların ağırlıkları).
  let earnedBps = 0;
  for (const k of WEIGHT_KEYS) if (met[k]) earnedBps += w[k];

  // Tek bölme, en sonda, aşağı yuvarlama.
  const earnedCents = (baseCents * BigInt(earnedBps)) / BigInt(TOTAL_BPS);

  const parts = [
    {
      key: 'attendance',
      label: WEIGHT_LABELS.attendance,
      weightBps: w.attendance,
      earnedBps: attendanceOk ? w.attendance : 0,
      met: attendanceOk,
      // Kırılım: hangisi eksik kaldı. Yayıncı neyi düzelteceğini bilsin.
      daysOk,
      hoursOk,
      completedDays,
      requiredDays,
      completedSeconds,
      requiredSeconds,
      // Yalnızca gösterim: "ne kadarını yaptım".
      daysRatioBps: Number(ratioBps(completedDays, requiredDays)),
      hoursRatioBps: Number(ratioBps(completedSeconds, requiredSeconds)),
    },
    {
      key: 'diamonds',
      label: WEIGHT_LABELS.diamonds,
      weightBps: w.diamonds,
      earnedBps: diamondsOk ? w.diamonds : 0,
      met: diamondsOk,
      ratioBps: Number(ratioBps(completedDiamonds, requiredDiamonds)),
    },
    {
      key: 'tasks',
      label: WEIGHT_LABELS.tasks,
      weightBps: w.tasks,
      earnedBps: tasksOk ? w.tasks : 0,
      met: tasksOk,
    },
  ];

  return {
    tierLevel: tier.level ?? null,
    baseCents,
    earnedBps,
    earnedCents,
    required: { days: requiredDays, seconds: requiredSeconds, diamonds: requiredDiamonds },
    completed: { days: completedDays, seconds: completedSeconds, diamonds: completedDiamonds },
    daysOk,
    hoursOk,
    attendanceOk,
    diamondTargetOk: diamondsOk,
    tasksOk,
    parts,
  };
}

/** Panel ve uygulama için JSON (BigInt dışarı çıkmaz). */
export const weightedJson = (r) => (r == null ? null : {
  tierLevel: r.tierLevel,
  baseCents: String(r.baseCents),
  earnedBps: r.earnedBps,
  earnedCents: String(r.earnedCents),
  required: { days: r.required.days, seconds: r.required.seconds, diamonds: String(r.required.diamonds) },
  completed: { days: r.completed.days, seconds: r.completed.seconds, diamonds: String(r.completed.diamonds) },
  daysOk: r.daysOk,
  hoursOk: r.hoursOk,
  attendanceOk: r.attendanceOk,
  diamondTargetOk: r.diamondTargetOk,
  tasksOk: r.tasksOk,
  parts: r.parts,
});
