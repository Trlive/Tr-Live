// Ay içi maaş ödemesi (avans) kuralları (bağımlılık yok, test edilebilir).
//
// Model (sahibinin kararı): kota dolunca yayıncıya maaşı AVANS olarak Fasulye (1 Fasulye = 1 dolar) yatar:
//  - tüm şartlar (elmas bozdurmama, gün, saat) tamamsa maaşın tamamı,
//  - biri bile eksikse maaşın %50'si, TAM DOLARA AŞAĞI yuvarlanarak (7,50$ → 7$; kalan şartlar tamamlanınca yatar).
// Dönem kapanırken tam hak ediş aynı kuralla yeniden hesaplanır, ödenen avanslar düşülür, kalan yatırılır.
// Kural ve yuvarlama paytable.rules.js'teki evaluateSimplePay'dedir; burası avansın "ne kadar daha" hesabıdır.

/** 1 dolar altındaki avanslar yazılmaz (cüzdan defterini küçük hareketlerle doldurmamak için). */
export const MIN_ADVANCE_CENTS = 100n;

const nonNeg = (v) => { const n = BigInt(v ?? 0); return n > 0n ? n : 0n; };

/** Bu turda ödenecek avans: hedef (şu anki hak ediş) − daha önce ödenen; minCents altıysa 0. */
export function advanceDue({ targetCents, alreadyCents, minCents = MIN_ADVANCE_CENTS }) {
  const due = nonNeg(targetCents) - nonNeg(alreadyCents);
  return due >= BigInt(minCents) ? due : 0n;
}

/** Dönem kapanışında yatırılacak kalan: hak ediş − avans (negatife düşmez). */
export function netOfAdvance({ entitledCents, advanceCents }) {
  const e = nonNeg(entitledCents);
  const a = nonNeg(advanceCents);
  return e > a ? e - a : 0n;
}
