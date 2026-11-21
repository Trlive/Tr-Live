// Ana sayfa bölge sekmeleri: Uzbekistan / Arap / Hindistan / Avrupa. Kullanıcının bölgesi, odasının hangi sekmede
// listeleneceğini belirler. Türkiye ve Orta Asya Uzbekistan sekmesindedir. Saf mantık: veritabanı gerektirmez.
export const REGIONS = ['uz', 'ar', 'in', 'eu'];

const CENTRAL = new Set(['UZ', 'TR', 'AZ', 'CY', 'KZ', 'KG', 'TM', 'TJ']);
const ARAB = new Set(['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE', 'IQ', 'SY', 'LB', 'JO', 'PS', 'EG', 'LY', 'TN', 'DZ', 'MA', 'SD', 'MR', 'SO', 'DJ', 'KM']);
const SOUTH_ASIA = new Set(['IN', 'PK', 'BD', 'NP', 'LK', 'BT', 'MV', 'AF']);

/** ISO ülke kodundan bölge. Avrupa ve diğer tüm ülkeler (ABD, Kanada, Avustralya…) Avrupa sekmesinde. */
export function regionForCountry(code) {
  const c = String(code ?? '').toUpperCase();
  if (!c || CENTRAL.has(c)) return 'uz';
  if (ARAB.has(c)) return 'ar';
  if (SOUTH_ASIA.has(c)) return 'in';
  return 'eu';
}
