// SDUI v2 — sunucunun uygulamaya çizdirebileceği şeyin TAM listesi.
//
// v1 yalnızca ana ekranın sekmelerini ve üç bölüm türünü sürüyordu. v2 genel bir bileşen
// ağacı: liste, form, detay, yerleşim. Yani 12 ekran APK çıkmadan değişebilir hale geliyor.
//
// ## Bu dosya neden bu kadar kısıtlayıcı
//
// SDUI, sunucuya uygulamanın arayüzünü değiştirme yetkisi verir. Sınırsız olursa uzaktan kod
// çalıştırmaya yaklaşır: düzeni kaydedebilen biri (ya da sunucuya giren biri) bütün telefonlara
// istediğini yaptırır. Bu yüzden her şey BEYAZ LİSTE:
//
//   · Bileşen türleri sabit ve her türün alanları ayrı ayrı doğrulanır. Tanınmayan alan DÜŞER,
//     sessizce taşınmaz — yoksa yarın uygulamaya eklenen bir alan, dün kaydedilmiş bir düzende
//     beklenmedik biçimde canlanırdı.
//   · Eylemler sabit ve PARAMETRELİ ADLARDIR, adres değil. Aşağıdaki API_ACTIONS'ın tamamı
//     uygulamanın zaten yaptığı işlere işaret eder.
//   · Metin alanlarının tamamında uzunluk sınırı var; ağaç derinliği ve düğüm sayısı sınırlı.
//
// ## Üç karar, açık gerekçesiyle
//
// 1) **"API Action" serbest adres ALMAZ.** Plan "izinli API action" diyordu; burada izin,
//    adresin değil ADIN izinli olmasıdır. `{"type":"api","name":"markAllRead"}` yazılır;
//    hangi uca hangi yöntemle gideceğine sunucudaki kayıt karar verir. Serbest adres
//    olsaydı, düzeni kaydedebilen biri bütün telefonlara istediği yere istek attırabilirdi.
//
// 2) **Form doğrulaması yalnızca KULLANICI RAHATLIĞIDIR.** Buradaki `required`/`maxLength`
//    kuralları ekranda anında uyarı göstermek içindir. Formu alan uç, kuralları KENDİ
//    doğrular ve buradakilere hiç bakmaz. Aksi halde istemciden gelen kuralla istemciden
//    gelen veriyi doğrulamış olurduk; bu, doğrulama değildir.
//
// 3) **Eski uygulamaya bilmediği düğüm HİÇ GİTMEZ.** Her bileşenin bir `minApp` eşiği var ve
//    sunucu, ağacı isteyen uygulamanın sürümüne göre SÜZEREK gönderir. Uygulama ayrıca
//    tanımadığı türü atlar. İki kat koruma, çünkü tek kat yeterli olsaydı eski bir APK'nın
//    boş ekran göstermesi için tek bir yanlış kayıt yeterdi.
import { fail } from '../../../shared/errors/http.js';

/// Ağaç sınırları. Derin ya da devasa bir ağaç, telefonu kilitleyen en kolay yoldur.
export const LIMITS = { depth: 12, nodes: 400, children: 60, text: 2000, label: 120 };

/// Uygulamanın bağımsız açabildiği ekranlar. v1 ile aynı gerekçe: oda (ses/görüntü), giriş ve
/// para HAREKETİ burada yok. `wallet` yalnızca bakiye ekranıdır; parayı sunucu kesinleştirir.
export const OPEN_SCREENS = ['store', 'wallet', 'usd_wallet', 'leaderboards', 'family', 'settings', 'help', 'events', 'inbox', 'relations', 'agency', 'dealer', 'support'];

export const TAB_TARGETS = ['voice', 'feed', 'video', 'messages', 'profile'];

export const ICONS = [
  'mic', 'feed', 'video', 'chat', 'person', 'store', 'wallet', 'gift', 'trophy', 'star',
  'event', 'group', 'settings', 'help', 'game', 'music', 'fire', 'crown', 'info', 'warning',
  'check', 'close', 'clock', 'lock', 'mail', 'bell', 'heart', 'search', 'edit', 'trash',
];

/// Uygulamanın tanıdığı renk rolleri. Serbest renk kodu YOK: sunucu okunmaz bir arayüz
/// (siyah üstüne siyah) üretemesin ve uygulama teması tek yerden değişebilsin.
export const TONES = ['default', 'muted', 'primary', 'success', 'warning', 'danger', 'gold'];

/// İzinli API eylemleri: ad → uygulamanın zaten yaptığı iş.
///
/// `needsAuth`: oturum ister. `confirm`: uygulama önce onay sorar (geri alınamaz işler).
/// Bu listeye bir şey eklemek APK gerektirir — bilerek. SDUI yeni bir iş ÜRETEMEZ, var olana
/// işaret eder.
export const API_ACTIONS = {
  markAllRead: { needsAuth: true, confirm: false },
  refreshProfile: { needsAuth: true, confirm: false },
  joinFamily: { needsAuth: true, confirm: true },
  leaveFamily: { needsAuth: true, confirm: true },
  followHost: { needsAuth: true, confirm: false },
  unfollowHost: { needsAuth: true, confirm: true },
  applyAgency: { needsAuth: true, confirm: true },
  claimTask: { needsAuth: true, confirm: false },
  savePreferences: { needsAuth: true, confirm: false },
};

/// Bileşen kataloğu. Her türün: izinli alanları, çocuk alıp almadığı ve en düşük uygulama sürümü.
///
/// `minApp` null ise bu tür v2'yi destekleyen her uygulamada var demektir.
export const COMPONENTS = {
  // ---- Yerleşim ----
  column: { children: true, props: { gap: 'int', padding: 'int', align: ['start', 'center', 'end', 'stretch'] } },
  row: { children: true, props: { gap: 'int', padding: 'int', align: ['start', 'center', 'end'], wrap: 'bool' } },
  grid: { children: true, props: { columns: 'int', gap: 'int', padding: 'int' } },
  scroll: { children: true, props: { padding: 'int' } },
  container: { children: true, props: { padding: 'int', radius: 'int', tone: 'tone' } },
  divider: { children: false, props: { padding: 'int' } },

  // ---- Bölüm ----
  title: { children: false, props: { text: 'label', subtitle: 'label', tone: 'tone' } },
  banner: { children: false, props: { image: 'asset', text: 'label', action: 'action', height: 'int' } },
  card: { children: true, props: { title: 'label', subtitle: 'label', image: 'asset', action: 'action', tone: 'tone' } },
  notice: { children: false, props: { text: 'text', icon: 'icon', tone: 'tone', action: 'action' } },

  // ---- Liste ----
  list: { children: true, props: { gap: 'int' } },
  listItem: { children: false, props: { title: 'label', subtitle: 'label', image: 'asset', icon: 'icon', badge: 'label', tone: 'tone', action: 'action' } },
  avatarRow: { children: false, props: { source: 'source', max: 'int', action: 'action' } },
  badge: { children: false, props: { text: 'label', tone: 'tone' } },
  emptyState: { children: false, props: { text: 'label', icon: 'icon' } },

  // ---- Detay ----
  keyValue: { children: false, props: { label: 'label', value: 'label', tone: 'tone' } },
  description: { children: false, props: { text: 'text' } },
  image: { children: false, props: { url: 'asset', height: 'int', radius: 'int' } },
  status: { children: false, props: { text: 'label', tone: 'tone', icon: 'icon' } },

  // ---- Form ----
  // Buradaki kurallar YALNIZCA ekranda anında uyarı içindir; formu alan uç kendi doğrular.
  form: { children: true, props: { submitLabel: 'label', action: 'action' } },
  textInput: { children: false, props: { name: 'name', label: 'label', hint: 'label', required: 'bool', maxLength: 'int', multiline: 'bool' } },
  select: { children: false, props: { name: 'name', label: 'label', required: 'bool', options: 'options' } },
  checkbox: { children: false, props: { name: 'name', label: 'label', required: 'bool' } },
  toggle: { children: false, props: { name: 'name', label: 'label', hint: 'label' } },

  // ---- Yerleşim mimarisi ----
  //
  // Bu dördü "sayfa her telefonda aynı oranlarda dursun" içindir. Sabit piksel yükseklik
  // veren bir kart, dar ekranda taşar, geniş ekranda sırıtır; `aspectRatio` oranı korur.
  // `maxWidth` ise geniş ekranda satırın okunamayacak kadar uzamasını engeller.
  aspectRatio: { children: true, props: { w: 'int', h: 'int' } },
  maxWidth: { children: true, props: { width: 'int', align: ['start', 'center', 'end'] } },
  safeArea: { children: true, props: { top: 'bool', bottom: 'bool' } },
  spacer: { children: false, props: { size: 'int' } },

  // ---- Vektörel ----
  //
  // Bunlar KOD İLE ÇİZİLİR, görsel indirmez. Üç kazanç:
  //   · Her ekran yoğunluğunda keskin durur (PNG 3x ekranda bulanıklaşır).
  //   · İndirme yok: ekran anında açılır, çevrimdışı da çizilir.
  //   · Rengi temadan alır; gece/gündüz ya da marka rengi değişince kendi uyar.
  // Bu yüzden simge ve süs için görsel yerine BUNLAR kullanılmalı; `image` yalnızca
  // gerçek fotoğraf (afiş, avatar) içindir.
  icon: { children: false, props: { name: 'icon', size: 'int', tone: 'tone' } },
  shape: { children: false, props: { kind: ['circle', 'ring', 'rounded', 'dot', 'line'], size: 'int', thickness: 'int', tone: 'tone' } },
  progress: { children: false, props: { value: 'int', kind: ['bar', 'ring'], tone: 'tone', size: 'int', label: 'label' } },

  // ---- Durum ----
  loading: { children: false, props: { } },
  error: { children: false, props: { text: 'label' } },

  // ---- Veriye bağlı ----
  // `source`: uygulamanın zaten çağırdığı, ADI İZİNLİ bir veri kaynağı. Serbest adres değil.
  //
  // Çocukları ŞABLONDUR: metin alanlarında {alan} yazılır, her öğe için o öğenin alanıyla
  // değiştirilir. Yalnızca düz alan adı; ifade, çağrı ya da iç içe erişim YOK — şablon dili
  // eklemek, sunucuya uygulama içinde kod çalıştırma yetkisi vermeye giden yoldur.
  repeater: { children: true, props: { source: 'source', max: 'int', emptyText: 'label' } },
};

/// İzinli veri kaynakları: ad → uygulamadaki MEVCUT çağrı. API_ACTIONS ile aynı gerekçe.
///
/// Buradaki her ad, uygulamanın gerçekten çağırabildiği ve LİSTE döndüren bir uca
/// karşılık gelir; `alanlar` da o listedeki öğelerin bağlanabilir alanlarıdır.
///
/// İlk yazımda `faq`, `tasks`, `familyMembers`, `agencyReport` da vardı; dördünün de
/// karşılığı YOKTU (ikisi hiç uç değil, ikisi liste değil nesne döndürüyor). Panelde
/// görünen ama seçilince boş ekran veren bir kaynak, olmayandan beterdir: yönetici
/// ekranı kurar, yayınlar, kullanıcı boş sayfa görür ve sebebi aranır.
export const SOURCE_SPECS = {
  events: { fields: ['id', 'title', 'subtitle', 'icon', 'ready'] },
  inbox: { fields: ['id', 'kind', 'title', 'body', 'createdAt'] },
  relations: { fields: ['id', 'displayName', 'username', 'avatarUrl'] },
  dealerCatalog: { fields: ['id', 'name', 'coins', 'priceText'] },
};
export const SOURCES = Object.keys(SOURCE_SPECS);

const str = (v, field, max) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw fail(`${field} metin olmalı.`);
  const s = v.trim();
  if (s.length > max) throw fail(`${field} en fazla ${max} karakter olabilir.`);
  return s;
};

const ASSET_RE = /^(\/media\/[0-9a-f-]{36}(\.s\d{3})?\.[a-z0-9]{2,5}|https:\/\/[^\s"'<>]{4,400})$/i;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readAction(a, field) {
  if (a === undefined || a === null) return null;
  if (typeof a !== 'object' || Array.isArray(a)) throw fail(`${field}: eylem nesne olmalı.`);
  const type = str(a.type, `${field}.type`, 20);
  switch (type) {
    case 'noop':
      return { type };
    case 'tab': {
      const target = str(a.target, `${field}.target`, 20);
      if (!TAB_TARGETS.includes(target)) throw fail(`${field}: bilinmeyen sekme "${target}".`);
      return { type, target };
    }
    case 'openScreen': {
      const screen = str(a.screen, `${field}.screen`, 30);
      if (!OPEN_SCREENS.includes(screen)) throw fail(`${field}: bu ekran SDUI'den açılamaz: "${screen}".`);
      return { type, screen, arg: str(a.arg, `${field}.arg`, 60) || null };
    }
    case 'openActivity': {
      const id = str(a.id, `${field}.id`, 40);
      if (!UUID_RE.test(id)) throw fail(`${field}: etkinlik kimliği geçersiz.`);
      return { type, id };
    }
    case 'openUrl': {
      // Adres uygulamada ayrıca WebView izin listesinden geçer: SDUI, alan adı denetimini
      // atlatmanın yolu olamaz.
      const url = str(a.url, `${field}.url`, 400);
      if (!/^https:\/\//i.test(url)) throw fail(`${field}: adres https ile başlamalı.`);
      return { type, url, external: a.external === true };
    }
    case 'api': {
      // Serbest adres YOK. Yalnızca ad; uca eşlemeyi sunucu bilir.
      const name = str(a.name, `${field}.name`, 40);
      if (!Object.hasOwn(API_ACTIONS, name)) throw fail(`${field}: izinli olmayan işlem "${name}".`);
      return { type, name, arg: str(a.arg, `${field}.arg`, 60) || null };
    }
    case 'modal': {
      const screen = str(a.screen, `${field}.screen`, 30);
      if (!OPEN_SCREENS.includes(screen)) throw fail(`${field}: bu ekran açılamaz: "${screen}".`);
      return { type, screen, arg: str(a.arg, `${field}.arg`, 60) || null };
    }
    case 'refresh':
      return { type };
    default:
      throw fail(`${field}: bilinmeyen eylem türü "${type}".`);
  }
}

function readProp(kind, value, field) {
  if (Array.isArray(kind)) {
    const s = str(value, field, 24);
    if (!s) return null;
    if (!kind.includes(s)) throw fail(`${field}: "${s}" geçersiz (${kind.join(', ')}).`);
    return s;
  }
  switch (kind) {
    case 'int': {
      if (value === undefined || value === null || value === '') return null;
      const n = Number(value);
      if (!Number.isInteger(n) || n < 0 || n > 2000) throw fail(`${field}: 0–2000 arası tam sayı olmalı.`);
      return n;
    }
    case 'bool':
      return value === true;
    case 'label':
      return str(value, field, LIMITS.label) || null;
    case 'text':
      return str(value, field, LIMITS.text) || null;
    case 'name': {
      const s = str(value, field, 40);
      if (s && !NAME_RE.test(s)) throw fail(`${field}: alan adı harfle başlamalı, harf/rakam/alt çizgi içermeli.`);
      return s || null;
    }
    case 'icon': {
      const s = str(value, field, 20);
      if (s && !ICONS.includes(s)) throw fail(`${field}: bilinmeyen simge "${s}".`);
      return s || null;
    }
    case 'tone': {
      const s = str(value, field, 20);
      if (s && !TONES.includes(s)) throw fail(`${field}: bilinmeyen renk rolü "${s}".`);
      return s || null;
    }
    case 'asset': {
      const s = str(value, field, 400);
      if (s && !ASSET_RE.test(s)) throw fail(`${field}: görsel adresi geçersiz (yüklenmiş görsel ya da https).`);
      return s || null;
    }
    case 'source': {
      const s = str(value, field, 40);
      if (s && !SOURCES.includes(s)) throw fail(`${field}: izinli olmayan veri kaynağı "${s}".`);
      return s || null;
    }
    case 'options': {
      if (!Array.isArray(value)) return [];
      if (value.length > 40) throw fail(`${field}: en fazla 40 seçenek.`);
      return value.map((o, i) => ({
        value: str(o?.value, `${field}[${i}].value`, 60),
        label: str(o?.label, `${field}[${i}].label`, LIMITS.label),
      }));
    }
    case 'action':
      return readAction(value, field);
    default:
      throw fail(`${field}: bilinmeyen alan türü.`);
  }
}

/**
 * Bir düğümü doğrular ve normalleştirir.
 *
 * Normalleştirme: yalnızca katalogda yazan alanlar geçer, gerisi DÜŞER. Böylece kaydedilen
 * her düzen aynı biçimde yazılır (sürüm özeti yalnızca gerçek değişiklikte değişir) ve
 * yarın eklenecek bir alan, dün kaydedilmiş bir düzende beklenmedik biçimde canlanmaz.
 */
function readNode(n, field, depth, counter) {
  if (++counter.n > LIMITS.nodes) throw fail(`Düzen çok büyük: en fazla ${LIMITS.nodes} bileşen.`);
  if (depth > LIMITS.depth) throw fail(`Düzen çok derin: en fazla ${LIMITS.depth} kat.`);
  if (typeof n !== 'object' || n === null || Array.isArray(n)) throw fail(`${field}: bileşen nesne olmalı.`);
  const type = str(n.type, `${field}.type`, 24);
  const spec = Object.hasOwn(COMPONENTS, type) ? COMPONENTS[type] : null;
  if (!spec) throw fail(`${field}: bilinmeyen bileşen "${type}".`);

  const out = { type };
  const id = str(n.id, `${field}.id`, 40);
  if (id) out.id = id;
  for (const [key, kind] of Object.entries(spec.props)) {
    const v = readProp(kind, n[key], `${field}.${key}`);
    if (v !== null && v !== undefined && !(Array.isArray(v) && !v.length) && v !== false) out[key] = v;
  }
  // Her bileşen bir özellik bayrağına bağlanabilir: riskli bir ekran %1'e açılır.
  const flag = str(n.flag, `${field}.flag`, 60);
  if (flag) out.flag = flag;
  // Bileşen bazında en düşük uygulama sürümü; sunucu süzerken kullanır.
  const minApp = str(n.minApp, `${field}.minApp`, 20);
  if (minApp) {
    if (!/^\d+\.\d+\.\d+$/.test(minApp)) throw fail(`${field}.minApp: sürüm 1.2.3 biçiminde olmalı.`);
    out.minApp = minApp;
  }

  if (spec.children) {
    const kids = Array.isArray(n.children) ? n.children : [];
    if (kids.length > LIMITS.children) throw fail(`${field}: en fazla ${LIMITS.children} alt bileşen.`);
    out.children = kids.map((k, i) => readNode(k, `${field}.children[${i}]`, depth + 1, counter));
  } else if (Array.isArray(n.children) && n.children.length) {
    throw fail(`${field}: "${type}" alt bileşen alamaz.`);
  }
  return out;
}

/** Form alan adları ekran içinde tekil olmalı; yoksa gönderilen veri birbirini ezer. */
function assertUniqueFieldNames(root) {
  const seen = new Set();
  const walk = (n) => {
    if (n.name) {
      if (seen.has(n.name)) throw fail(`Form alanı "${n.name}" birden fazla kez kullanılmış.`);
      seen.add(n.name);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
}

/**
 * Panelden gelen ekran düzenini doğrular ve normalleştirir.
 * @returns {{schemaVersion: 2, screenId: string, root: object}}
 */
export function validateScreen(screenId, payload) {
  if (!/^[a-z][a-z0-9_]{1,30}$/.test(String(screenId || ''))) throw fail('Ekran adı geçersiz.');
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw fail('Düzen nesne olmalı.');
  const rootIn = payload.root ?? payload.layout;
  if (!rootIn) throw fail('Düzende kök bileşen (root) yok.');
  const counter = { n: 0 };
  const root = readNode(rootIn, 'root', 0, counter);
  assertUniqueFieldNames(root);
  return { schemaVersion: 2, screenId: String(screenId), root };
}

/** Bir düzende geçen tüm adresler (WebView izin listesi denetimi için). */
export function urlsOf(root) {
  const out = [];
  const walk = (n) => {
    for (const v of Object.values(n)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && v.type === 'openUrl' && v.url) out.push(v.url);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return out;
}

/** Bir düzende geçen tüm özellik bayrakları (panelde "bu ekran neye bağlı" göstermek için). */
export function flagsOf(root) {
  const out = new Set();
  const walk = (n) => { if (n.flag) out.add(n.flag); for (const c of n.children ?? []) walk(c); };
  walk(root);
  return [...out];
}
