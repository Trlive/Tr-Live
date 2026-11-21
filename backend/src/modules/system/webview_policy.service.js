import { fail } from '../../shared/errors/http.js';

/// WebView alan adı izin listesi.
///
/// ## Tehdit
///
/// Oda etkinlikleri ve oyunlar WebView'de açılıyor ve bu pencerelere bir JavaScript kanalı
/// bağlanıyor. Sayfanın adresini yönetici panelden yapıştırıyor. Yönetici hesabı ele geçirilirse
/// ya da adres yanlış yazılırsa (`trlve.app` gibi), kullanıcılar **uygulamanın içinde**, uygulama
/// penceresi gibi görünen bir yabancı sayfaya gider. Kullanıcı adres çubuğu görmediği için
/// aradaki farkı anlayamaz.
///
/// ## Savunma
///
/// Adres hem **kaydedilirken** (yönetici yanlış adresi kaydedemez) hem de **açılırken** (eski
/// kayıtlar ve sunucudan gelen her bağlantı için) listeye karşı denetlenir. İki taraflı denetim
/// bilinçli: tek taraf, diğerinin atlanabildiği her durumda açık kapı bırakır.
///
/// ## Boş liste
///
/// Liste boşsa kısıt uygulanmaz — bugünkü davranış. Doldurulduğu anda devreye girer. Varsayılanı
/// "her şey yasak" yapmak, panelde kayıtlı çalışan etkinlikleri bir anda bozardı; bu kararı
/// kapatma düğmesi olmadan veremeyiz.

/// `*.alanadi.com` ve `alanadi.com` biçimleri kabul edilir. Yol, port ve şema yazılmaz:
/// izin listesi **alan adı** listesidir; yol tabanlı izin, tek bir açık yönlendirmeyle delinir.
const HOST_RE = /^(\*\.)?[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Panelden gelen metni temizlenmiş alan adı listesine çevirir. */
export function parseAllowlist(raw) {
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function validateAllowlist(raw) {
  const list = parseAllowlist(raw);
  if (list.length > 100) throw fail('En fazla 100 alan adı yazılabilir.');
  for (const h of list) {
    if (!HOST_RE.test(h)) {
      throw fail(`Alan adı geçersiz: ${h.slice(0, 60)} — yalnızca alan adı yazın (ör. oyun.alanadi.com ya da *.alanadi.com); https://, yol ve port yazılmaz.`);
    }
  }
  return list.join('\n');
}

/**
 * Adres listeye uyuyor mu.
 *
 * `*.alanadi.com` alt alan adlarını kapsar ama **`alanadi.com`'un kendisini kapsamaz**: ikisini
 * birden isteyen ikisini de yazar. Bu bilinçli — `*.` yazan kişi genellikle alt alan adlarını
 * kastediyor ve kökü sessizce eklemek, listeyi okuyan kişiyi yanıltır.
 *
 * Eşleşme yalnızca **tam etiket** sınırında olur: `*.alanadi.com`, `kotualanadi.com`'u kapsamaz.
 */
export function hostAllowed(url, list) {
  if (!list || list.length === 0) return true; // liste boş: kısıt yok
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  if (u.protocol !== 'https:') return false; // liste doluyken http hiçbir koşulda kabul edilmez
  const host = u.hostname.toLowerCase();
  for (const entry of list) {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1); // ".alanadi.com"
      if (host.endsWith(suffix) && host.length > suffix.length) return true;
    } else if (host === entry) {
      return true;
    }
  }
  return false;
}

/** Yapılandırmadan okunmuş liste. */
export const allowlistOf = (c) => parseAllowlist(c?.webviewAllowlist);
