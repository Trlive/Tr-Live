import { fail } from '../../shared/errors/http.js';

/// SDUI şeması: sunucunun uygulamaya ne söyleyebileceğinin **tam listesi**.
///
/// ## Niçin kapalı liste
///
/// SDUI, sunucuya uygulamanın arayüzünü değiştirme yetkisi verir. Bu yetki sınırsız olursa
/// uzaktan kod çalıştırmaya yaklaşır: sunucu (ya da sunucuya erişen biri) uygulamaya istediğini
/// yaptırır. Bu yüzden şema **beyaz liste** olarak yazıldı:
///
/// * Eylem türleri sabit. Uygulamanın zaten yaptığı şeylere işaret ederler, yenisini **üretmezler**.
/// * `openUrl` eylemi WebView izin listesinden geçer — SDUI, v2.139.0'da kurduğumuz alan adı
///   denetimini atlatmanın yolu olamaz.
/// * Simge adları sabit; uygulama bilmediği simgeyi varsayılanla çizer, çökmez.
///
/// ## Niçin aynı şema iki tarafta
///
/// Sunucu doğrular ki yönetici bozuk düzen kaydedemesin. Uygulama da doğrular ki eski bir APK,
/// sonradan eklenmiş bir düğüm türüyle karşılaşınca çökmesin — bilmediğini atlar.

/// Uygulamanın çizebildiği sekmeler. Yeni sekme eklemek APK gerektirir; SDUI yalnızca var olanları
/// gizler, sıralar ve yeniden adlandırır.
export const TAB_TARGETS = ['voice', 'feed', 'video', 'messages', 'profile'];

/// SDUI'den açılabilen uygulama ekranları.
///
/// Oda ekranı, cüzdan **işlem** akışı ve giriş BURADA YOK: ses, görüntü, kimlik doğrulama ve
/// finansal işlemler native kalır (mimari ilke). `wallet` ve `usd_wallet` yalnızca bakiye/hareket
/// ekranlarıdır — para hareketini sunucu kesinleştirir, SDUI yalnızca ekranı açar.
///
/// Liste, uygulamada **bağımsız açılabilen** ekranlarla sınırlı. Ayarlar ekranı profil nesnesi,
/// etkinlik ekranı grup parametresi ister; onları listeye yazmak, panelde seçilip hiçbir şey
/// olmaması demekti.
export const OPEN_SCREENS = ['store', 'wallet', 'usd_wallet', 'leaderboards', 'family'];

/// Uygulamada karşılığı olan simge adları.
export const ICONS = [
  'mic', 'feed', 'video', 'chat', 'person', 'store', 'wallet', 'gift', 'trophy', 'star',
  'event', 'group', 'settings', 'help', 'game', 'music', 'fire', 'crown',
];

export const SECTION_TYPES = ['banner', 'cards', 'notice'];

const str = (v, field, max) => {
  if (typeof v !== 'string') throw fail(`${field} metin olmalı.`);
  const s = v.trim();
  if (s.length > max) throw fail(`${field} en fazla ${max} karakter olabilir.`);
  return s;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/// Sunucudaki yüklü görsel ya da https adres. Düz http kabul edilmez.
const ASSET_RE = /^(\/media\/[0-9a-f-]{36}(\.s\d{3})?\.[a-z0-9]{2,5}|https:\/\/[^\s"'<>]{4,400})$/i;

function readAction(a, field) {
  if (a === undefined || a === null) return { type: 'noop' };
  if (typeof a !== 'object' || Array.isArray(a)) throw fail(`${field}: eylem nesne olmalı.`);
  const type = str(a.type ?? 'noop', `${field}.type`, 20);
  switch (type) {
    case 'noop':
      return { type };
    case 'tab': {
      const target = str(a.target ?? '', `${field}.target`, 20);
      if (!TAB_TARGETS.includes(target)) throw fail(`${field}: bilinmeyen sekme "${target}".`);
      return { type, target };
    }
    case 'openScreen': {
      const screen = str(a.screen ?? '', `${field}.screen`, 30);
      if (!OPEN_SCREENS.includes(screen)) throw fail(`${field}: bu ekran SDUI'den açılamaz: "${screen}".`);
      return { type, screen };
    }
    case 'openActivity': {
      const id = str(a.id ?? '', `${field}.id`, 40);
      if (!UUID_RE.test(id)) throw fail(`${field}: etkinlik kimliği geçersiz.`);
      return { type, id };
    }
    case 'openUrl': {
      // Adres burada da, uygulamada da WebView izin listesinden geçer. SDUI, alan adı denetimini
      // atlatmanın yolu olamaz.
      const url = str(a.url ?? '', `${field}.url`, 400);
      if (!/^https:\/\//i.test(url)) throw fail(`${field}: adres https ile başlamalı.`);
      return { type, url, external: a.external === true };
    }
    default:
      throw fail(`${field}: bilinmeyen eylem türü "${type}".`);
  }
}

function readTab(t, i) {
  if (typeof t !== 'object' || t === null || Array.isArray(t)) throw fail(`Sekme ${i + 1} nesne olmalı.`);
  const target = str(t.target ?? '', `Sekme ${i + 1} hedefi`, 20);
  if (!TAB_TARGETS.includes(target)) throw fail(`Sekme ${i + 1}: bilinmeyen hedef "${target}".`);
  const icon = str(t.icon ?? '', `Sekme ${i + 1} simgesi`, 20);
  if (icon && !ICONS.includes(icon)) throw fail(`Sekme ${i + 1}: bilinmeyen simge "${icon}".`);
  return {
    target,
    label: str(t.label ?? '', `Sekme ${i + 1} adı`, 24),
    icon: icon || null,
    hidden: t.hidden === true,
  };
}

function readSection(s, i) {
  if (typeof s !== 'object' || s === null || Array.isArray(s)) throw fail(`Bölüm ${i + 1} nesne olmalı.`);
  const type = str(s.type ?? '', `Bölüm ${i + 1} türü`, 20);
  if (!SECTION_TYPES.includes(type)) throw fail(`Bölüm ${i + 1}: bilinmeyen tür "${type}".`);
  const out = {
    id: str(s.id ?? `s${i}`, `Bölüm ${i + 1} kimliği`, 40),
    type,
    title: str(s.title ?? '', `Bölüm ${i + 1} başlığı`, 80),
    hidden: s.hidden === true,
  };
  if (type === 'notice') {
    out.text = str(s.text ?? '', `Bölüm ${i + 1} metni`, 400);
    out.action = readAction(s.action, `Bölüm ${i + 1}`);
    return out;
  }
  const items = Array.isArray(s.items) ? s.items : [];
  if (items.length > 20) throw fail(`Bölüm ${i + 1}: en fazla 20 öğe.`);
  out.items = items.map((it, j) => {
    if (typeof it !== 'object' || it === null) throw fail(`Bölüm ${i + 1}, öğe ${j + 1} nesne olmalı.`);
    const image = it.image ? str(it.image, `Bölüm ${i + 1}, öğe ${j + 1} görseli`, 400) : '';
    if (image && !ASSET_RE.test(image)) throw fail(`Bölüm ${i + 1}, öğe ${j + 1}: görsel adresi geçersiz (yüklenmiş görsel ya da https).`);
    return {
      id: str(it.id ?? `i${j}`, `Bölüm ${i + 1}, öğe ${j + 1} kimliği`, 40),
      title: str(it.title ?? '', `Bölüm ${i + 1}, öğe ${j + 1} başlığı`, 60),
      subtitle: str(it.subtitle ?? '', `Bölüm ${i + 1}, öğe ${j + 1} açıklaması`, 120),
      image: image || null,
      action: readAction(it.action, `Bölüm ${i + 1}, öğe ${j + 1}`),
    };
  });
  return out;
}

/**
 * Panelden gelen düzeni doğrular ve **normalleştirir**.
 *
 * Normalleştirme önemli: kaydedilen her düzen aynı biçimde yazılır, böylece sürüm özeti
 * yalnızca gerçek değişiklikte değişir. Aksi halde boşluk farkı bile bütün telefonlara
 * yeniden indirtirdi.
 */
export function validateLayout(screen, payload) {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(String(screen || ''))) throw fail('Ekran adı geçersiz.');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw fail('Düzen nesne olmalı.');

  const tabsIn = Array.isArray(payload.tabs) ? payload.tabs : [];
  if (tabsIn.length > TAB_TARGETS.length) throw fail('Sekme sayısı fazla.');
  const tabs = tabsIn.map(readTab);

  // Aynı sekme iki kez yazılırsa uygulama aynı ekranı iki yerde gösterir: kullanıcı için anlamsız,
  // ve hangisinin seçili olduğu belirsizleşir.
  const seen = new Set();
  for (const t of tabs) {
    if (seen.has(t.target)) throw fail(`"${t.target}" sekmesi birden fazla kez yazılmış.`);
    seen.add(t.target);
  }
  // Görünür sekme kalmazsa uygulama gezinemez hale gelir. Bu, sunucudan gönderilebilecek en
  // zararlı düzen — kaydedilmesine izin verilmez.
  if (tabs.length && !tabs.some((t) => !t.hidden)) throw fail('En az bir sekme görünür olmalı.');

  const secIn = Array.isArray(payload.sections) ? payload.sections : [];
  if (secIn.length > 10) throw fail('En fazla 10 bölüm.');
  return { tabs, sections: secIn.map(readSection) };
}
