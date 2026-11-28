import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { validateAllowlist } from './webview_policy.service.js';

// Uzaktan ayarlar: APK yayınlamadan yönetim panelinden değiştirilir. Okumalar 30 sn önbelleklenir.
export const CONFIG_DEFAULTS = Object.freeze({
  // Bu sürümün altındaki uygulamalar "Güncelleme gerekli" ekranı görür. 0.0.0 = kapalı.
  minAppVersion: '0.0.0',
  // Güncel sürüm (bilgi amaçlı: "yeni sürüm var" uyarısı) ve indirme bağlantısı.
  latestAppVersion: '0.0.0',
  updateUrl: '',
  updateMessage: 'Uygulamanın yeni bir sürümü var. Devam etmek için lütfen güncelleyin.',
  // Otomatik moderasyon
  blockLinks: true,
  blockPhones: true,
  strikeLimit: 3, // pencere içinde bu kadar ihlal → otomatik kısıtlama
  strikeWindowMin: 10,
  muteMinutes: 15, // ilk kısıtlama; 24 saat içinde tekrarlarsa ikiye katlanır
  maxMuteMinutes: 1440,
  // Şanslı hediye: gönderene ortalama geri dönüş (RTP, baz puan: 7000 = %70), alıcıya geçen Elmas payı (1000 = %10),
  // tek gönderimde en fazla kazanç ve tüm kullanıcılara duyurulan en düşük çarpan.
  luckyEnabled: true,
  // Havuza giden pay (uzun vadede gönderene dönen en fazla oran) ve bunun büyük ödül havuzuna ayrılan kısmı.
  luckyRtpBps: 6000,
  luckyJackpotShareBps: 2500,
  luckyReceiverBps: 1000,
  luckyMaxWin: 5000000,
  luckyAnnounceMultiplier: 100,
  // Odaya girince sohbetin başında görünen uygulama uyarı duyurusu (boş = gösterilmez).
  roomNotice: 'TR Live\'a hoş geldiniz! Odalarda hakaret, küfür, siyaset, +18 içerik, reklam ve dolandırıcılık yasaktır. '
    + 'Coin alım-satımını yalnızca uygulama içinden yapın; şifrenizi kimseyle paylaşmayın. '
    + 'Kurallara uymayan hesaplar uyarı yapılmadan kapatılır.',
  // Uçan yazı (odada ekranın üstünden geçen mesaj) ücreti, Coin. 0 = ücretsiz.
  flyTextCoins: 99,
  // Oda içi etkinlikler (WebView H5 sayfası + menü). Herkes için geçerli genel anahtar; kapalıyken menü gizlenir, /room-activities 404 verir.
  roomActivitiesEnabled: true,
  // TEK kart oyunu (oda içi, WebView). Herkes için geçerli genel anahtar; kapalıyken menüde görünmez, yeni oyun açılamaz.
  cardGameEnabled: true,
  ludoEntrySilver: 500, // Ludo'ya giriş (Gümüş); 0 = ücretsiz
  tekEntrySilver: 500, // TEK (Uno) oyununa giriş (Gümüş); 0 = ücretsiz
  // Günlük giriş (7 gün): gün gün Coin ödülü; 7. gün ayrıca çerçeve / araç (boşsa verilmez), eşya süresi gün.
  checkinEnabled: true,
  checkinCoins: '20,20,20,20,50,50,100',
  checkinSilver: '1000,1000,1000,1000,1000,1000,10000',
  checkinFrameId: '',
  checkinVehicleId: '',
  checkinItemDays: 7,
  // Yönetim paneli (Uygulama ayarları) bu iki anahtarı da gönderiyor; kaydın "Bilinmeyen ayar" ile reddedilmemesi için tanımlı.
  // İstemci henüz okumuyor (varsayılan kapalı, davranış değişmez).
  // Oda açıkken uygulamanın tüm sesi (oda müziği, hediye sesleri) görüşme yolundan çalınır.
  // Açık: Bluetooth kulaklıkta tek bağlantı kullanılır (ses kesilmesi biter) ve bu sesler yankı
  // gidericinin referansına girer (karşı tarafa yankı gitmez). Kapalı: eski davranış (medya yolu).
  // Bir cihazda ses bozulursa yeni APK beklemeden buradan kapatılabilir.
  voiceAudioPath: true,
  // WebView'de açılmasına izin verilen alan adları (satır ya da virgülle ayrılmış).
  // Boşken kısıt yok (bugünkü davranış); doldurulduğu anda hem kayıt hem açılış denetlenir.
  webviewAllowlist: '',
  // Nesne deposu (Cloudflare R2). Beşi birden dolu olmadan depo kapalıdır: yarım yapılandırma,
  // dosyaların yarısını R2'de yarısını veritabanında bırakır ve temizlemesi taşımaktan zordur.
  // Boşken sistem bugünkü gibi çalışır (medya veritabanından sunulur).
  r2AccountId: '',
  r2Bucket: '',
  r2AccessKey: '',
  r2SecretKey: '',
  r2PublicBase: '', // CDN kökü, ör. https://cdn.trlive.app
  // blockRooted / sslPinning KALDIRILDI (denetim S-04).
  //
  // İki ayar da tanımlıydı ama mobil tarafta onları okuyan tek satır yoktu. Hiçbir şey yapmayan
  // bir güvenlik ayarı, yapıyormuş gibi görünür: "SSL pinning açık" sanan bir yönetici, olmayan
  // bir korumaya güvenir. Yanlış güven, korumasızlıktan beterdir.
  //
  // Gerçek sertifika sabitleme, kendi alan adına geçildikten sonra ve YEDEK pin'le birlikte
  // eklenecek — tek pin'le, sertifika yenilendiği gün bütün uygulamalar sunucuya bağlanamaz.
  // Telefon doğrulaması (Firebase SMS). Proje kimliği boşken telefonla kayıt eskisi gibi kodsuz çalışır; doluysa ve
  // phoneVerifyRequired açıksa SMS kodu zorunludur. Bu değerler gizli değildir (uygulamaya da gönderilir).
  phoneVerifyRequired: true,
  firebaseProjectId: '',
  firebaseApiKey: '',
  firebaseAppId: '',
  firebaseSenderId: '',
  // E-posta doğrulama kodu ve şifre sıfırlama için gönderici (SMTP). Şifre yönetim panelinde maskeli görünür.
  // Sözleşmelerin tarafı olan işletmeci (unvan, vergi no, adres tek satırda). Boşsa sözleşmede "Madde 1.1'de belirtilen işletmeci" yazar.
  contractCompany: '',
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  // Dolar cüzdanı (yayıncı / ajans maaşları). Tutarlar sent: 1000 = 10 dolar.
  usdEnabled: true, // kapalıyken admin'e ve bayiye gönderim yapılamaz (bakiye ve geçmiş görünür)
  usdAutoCredit: true, // dönem kapatılınca maaş ve primler cüzdanlara otomatik yatar
  usdWithdrawMinCents: 1000, // admin'e gönderimde alt sınır
  usdDealerMinCents: 1000, // bayiye gönderimde alt sınır
  // Bayiye gönderimde 1 doların bayi stokuna geçen Coin karşılığı. GEÇİCİ değer: Coin fiyatı netleşince panelden ayarlanır.
  usdDealerCoinsPerUsd: 4000,
  // Fasulye → Coin (kendine çevirme ve başka kullanıcıya Coin gönderme): 1 Fasulye (1 dolar) kaç Coin eder ve alt sınır.
  // GEÇİCİ değer: bayi liste fiyatına (100 Coin ≈ 1 TL, 1 dolar ≈ 40 TL) göre, bayi kuruyla aynı seçildi; panelden ayarlanır.
  usdCoinsPerUsd: 4000,
  // Fasulye → başka kullanıcıya Coin gönderme kuru (YoHo "Diğerleri için"). 0 = kendine çevirmeyle aynı kur.
  usdCoinsPerUsdOthers: 0,
  usdExchangeMinCents: 100,
  // 24 saatte hesaptan dışarı çıkabilecek en çok Fasulye (başkasına Coin, bayiye, admine çekim). Sent: 500000 = 5.000 Fasulye. 0 = kapalı.
  usdDailyOutCents: 500000,
  // Coin satış kanalları (v2.153.0). Gizli anahtarlar ortam değişkeninde (PAYTR_*, USDT_TRC20_ADDRESS, TRONGRID_API_KEY);
  // burada yalnızca açık/kapalı ve gizli olmayan değerler. Anahtarı tanımlı olmayan yöntem açık olsa da görünmez.
  payPaytrEnabled: false, // kart (PayTR): ödeme onaylanınca Coin otomatik yazılır
  payUsdtEnabled: false, // USDT (TRC20): zincirde görülen transfer, tutarıyla siparişe eşlenir
  payBankEnabled: false, // havale / EFT: yönetici dekontu teyit edince yazılır
  payWebTopupEnabled: true, // web yükleme sayfasında kullanıcıların kendi ID'leriyle yükleme yapması
  payUsdtRateKurus: 4200, // 1 USDT kaç kuruş (4200 = 42,00 TL)
  payOrderTtlMin: 30, // kart ve USDT siparişinin geçerlilik süresi (dakika); havale 48 saat
  payBankInfo: '', // havale bilgisi (banka, IBAN, alıcı adı) — siparişte gösterilir
  // Medya bütçesi: hediye / çerçeve / efekt dosyalarının üst sınırları. Telefonun belleği ve video çözücüsü sınırlı;
  // sınırı aşan dosya yüklenirken (ve "Medya bütçesi" ekranından mevcutlarda) otomatik olarak bu sınıra indirilir.
  mediaBudgetAuto: true, // yüklenen dosyayı otomatik sınıra indir
  mediaMp4MaxWidth: 540, // mp4: görüntü (renk) kısmının en büyük genişliği; dosya yan yana şeffaflık içerir, toplam genişlik 2 katıdır
  mediaMp4MaxHeight: 960, // mp4: en büyük yükseklik
  mediaMp4MaxFps: 24, // mp4: en çok kare/sn
  mediaMp4MaxKb: 6144, // mp4: en büyük dosya boyutu (KB)
  mediaSvgaMaxKb: 10240, // svga: en büyük dosya boyutu (KB)
  mediaSvgaMaxSide: 720, // svga: içindeki görsellerin en uzun kenarı (px)
  mediaSvgaMaxDecodedMb: 48, // svga: görseller açılınca kaplayacağı bellek (MB)
  mediaImageMaxSide: 720, // webp / gif / png: en uzun kenar (px)
  mediaImageMaxKb: 3072, // webp / gif / png: en büyük dosya boyutu (KB)
  mediaSmallMaxSide: 480, // çerçeve ve mikte oynayan hediyeler: en uzun kenar (px; mp4'te görüntü kısmı)
  mediaIconMaxSide: 512, // hediye küçük resmi: en uzun kenar (px)
});

/** Yönetim paneline giden ayarlarda gizli anahtarlar gösterilmez; bu değer geri gelirse anahtar değiştirilmez. */
export const SECRET_MASK = '••••••••';
/** Panele asla ham gönderilmeyecek alanlar. Yeni bir gizli anahtar eklenince buraya da eklenmeli. */
const SECRET_FIELDS = ['smtpPass', 'r2SecretKey', 'r2AccessKey'];
export function maskSecrets(c) {
  const out = { ...c };
  for (const k of SECRET_FIELDS) out[k] = c[k] ? SECRET_MASK : '';
  return out;
}

/** Telefon doğrulaması açık mı (Firebase yapılandırılmış ve zorunlu). */
export const phoneVerifyOn = (c) => Boolean(c.firebaseProjectId) && c.phoneVerifyRequired !== false;
/** E-posta gönderimi yapılandırılmış mı. */
export const mailOn = (c) => Boolean(c.smtpHost && (c.smtpFrom || c.smtpUser));

const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const TTL_MS = 30e3;
let cache = null;
let cacheAt = 0;

export async function getConfig() {
  if (cache && Date.now() - cacheAt < TTL_MS) return cache;
  try {
    const r = await query(`SELECT key, value FROM app_config`);
    const next = { ...CONFIG_DEFAULTS };
    for (const row of r.rows) if (row.key in CONFIG_DEFAULTS) next[row.key] = row.value;
    cache = next;
    cacheAt = Date.now();
  } catch (_) {
    // Veritabanı geçici olarak erişilemezse son bilinen (yoksa varsayılan) ayarlarla devam edilir.
    cache ??= { ...CONFIG_DEFAULTS };
  }
  return cache;
}

export function clearConfigCache() { cache = null; }

/** Yönetici panelinden gelen değişiklikleri doğrular. Bilinmeyen anahtar reddedilir. */
export function validateConfigPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail('Ayarlar nesne olmalı.');
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (!(k in CONFIG_DEFAULTS)) throw fail(`Bilinmeyen ayar: ${k}`);
    const def = CONFIG_DEFAULTS[k];
    if (k === 'minAppVersion' || k === 'latestAppVersion') {
      if (typeof v !== 'string' || !VERSION_RE.test(v)) throw fail('Sürüm 1.2.3 biçiminde olmalı.');
    } else if (k === 'updateUrl') {
      if (typeof v !== 'string' || (v && !/^https:\/\/[^\s]{4,300}$/.test(v))) throw fail('İndirme bağlantısı https ile başlamalı.');
    } else if (k === 'updateMessage') {
      if (typeof v !== 'string' || v.length > 300) throw fail('Mesaj en fazla 300 karakter olmalı.');
    } else if (k === 'roomNotice') {
      if (typeof v !== 'string' || v.length > 500) throw fail('Oda uyarı duyurusu en fazla 500 karakter olmalı.');
    } else if (k === 'checkinCoins' || k === 'checkinSilver') {
      if (typeof v !== 'string' || !/^\s*\d{1,9}(\s*,\s*\d{1,9}){6}\s*$/.test(v)) throw fail('Günlük giriş ödülleri 7 sayı olmalı (ör. 20,20,20,20,50,50,100).');
    } else if (k === 'firebaseProjectId') {
      if (typeof v !== 'string' || (v && !/^[a-z0-9][a-z0-9-]{3,38}[a-z0-9]$/.test(v))) throw fail('Firebase proje kimliği geçersiz (ör. trlive-12345).');
    } else if (k === 'firebaseApiKey') {
      if (typeof v !== 'string' || (v && !/^[A-Za-z0-9_-]{20,80}$/.test(v))) throw fail('Firebase API anahtarı geçersiz.');
    } else if (k === 'firebaseAppId') {
      if (typeof v !== 'string' || (v && !/^1:\d{5,20}:android:[0-9a-f]{6,40}$/.test(v))) throw fail('Firebase uygulama kimliği 1:...:android:... biçiminde olmalı.');
    } else if (k === 'firebaseSenderId') {
      if (typeof v !== 'string' || (v && !/^\d{5,20}$/.test(v))) throw fail('Firebase gönderici numarası yalnızca rakam olmalı.');
    } else if (k === 'webviewAllowlist') {
      if (typeof v !== 'string' || v.length > 4000) throw fail('İzin listesi çok uzun.');
      out[k] = validateAllowlist(v);
      continue;
    } else if (k === 'r2PublicBase') {
      if (typeof v !== 'string' || (v && !/^https:\/\/[^\s/]{4,200}$/.test(v))) throw fail('CDN kökü https ile başlamalı ve yol içermemeli (ör. https://cdn.alanadi.com).');
    } else if (k === 'r2AccountId' || k === 'r2Bucket' || k === 'r2AccessKey' || k === 'r2SecretKey') {
      if (typeof v !== 'string' || v.length > 200) throw fail(`${k} en fazla 200 karakter olmalı.`);
    } else if (k === 'payBankInfo') {
      if (typeof v !== 'string' || v.length > 500) throw fail('Havale bilgisi en fazla 500 karakter olmalı.');
    } else if (k === 'contractCompany') {
      if (typeof v !== 'string' || v.length > 500 || /[\u0000-\u001f]/.test(v)) throw fail('İşletmeci bilgisi en fazla 500 karakterlik tek satır olmalı.');
    } else if (k === 'smtpHost') {
      if (typeof v !== 'string' || (v && !/^[A-Za-z0-9.-]{3,200}$/.test(v))) throw fail('SMTP sunucusu geçersiz (ör. smtp-relay.brevo.com).');
    } else if (k === 'smtpUser' || k === 'smtpPass' || k === 'smtpFrom') {
      if (typeof v !== 'string' || v.length > 200) throw fail(`${k} en fazla 200 karakter olmalı.`);
      if (k === 'smtpFrom' && v && !/^([^<>@]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/.test(v.trim())) {
        throw fail('Gönderen adresi "TR Live <no-reply@alanadi.com>" ya da e-posta biçiminde olmalı.');
      }
    } else if (k === 'checkinFrameId' || k === 'checkinVehicleId') {
      if (typeof v !== 'string' || (v && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v))) throw fail('7. gün eşyası geçersiz.');
    } else if (typeof def === 'boolean') {
      if (typeof v !== 'boolean') throw fail(`${k} true/false olmalı.`);
    } else if (typeof def === 'number') {
      const limits = {
        strikeLimit: [1, 20], strikeWindowMin: [1, 1440], muteMinutes: [1, 1440], maxMuteMinutes: [1, 10080],
        luckyRtpBps: [0, 9000], luckyJackpotShareBps: [0, 8000], luckyReceiverBps: [0, 5000], luckyMaxWin: [1, 1000000000], luckyAnnounceMultiplier: [10, 1000],
        flyTextCoins: [0, 1000000], ludoEntrySilver: [0, 100000000], tekEntrySilver: [0, 100000000], checkinItemDays: [1, 90], smtpPort: [1, 65535],
        usdWithdrawMinCents: [100, 100000000], usdDealerMinCents: [100, 100000000], usdDealerCoinsPerUsd: [1, 100000000],
        usdCoinsPerUsd: [1, 100000000], usdExchangeMinCents: [1, 100000000], payUsdtRateKurus: [100, 100000000], usdCoinsPerUsdOthers: [0, 100000000], usdDailyOutCents: [0, 100000000000], payOrderTtlMin: [5, 1440],
        mediaMp4MaxWidth: [180, 1080], mediaMp4MaxHeight: [180, 1920], mediaMp4MaxFps: [10, 30], mediaMp4MaxKb: [256, 40960],
        mediaSvgaMaxKb: [256, 40960], mediaSvgaMaxSide: [128, 2048], mediaSvgaMaxDecodedMb: [8, 256],
        mediaImageMaxSide: [128, 2048], mediaImageMaxKb: [64, 20480], mediaSmallMaxSide: [128, 1024], mediaIconMaxSide: [64, 1024],
      }[k];
      if (!limits) throw fail(`${k} için sınır tanımlı değil.`);
      if (!Number.isInteger(v) || v < limits[0] || v > limits[1]) throw fail(`${k} ${limits[0]}-${limits[1]} arasında tam sayı olmalı.`);
    }
    out[k] = v;
  }
  return out;
}

export async function saveConfig(patch, adminId) {
  // Tek işlem: birbirine bağlı ayarlar (ör. şanslı hediye oranları) yarım kaydedilmesin.
  // Denetim işlemden ÖNCE: işlem içinde ayar/tablo okumak havuzdan ikinci bağlantı ister (küçük havuzda kilitlenme).
  if ('usdCoinsPerUsd' in patch || 'usdDealerCoinsPerUsd' in patch || 'usdCoinsPerUsdOthers' in patch) await assertNoSalaryLoop(query, patch);
  await tx(async (c) => {
    for (const [k, v] of Object.entries(patch)) {
      await c.query(
      `INSERT INTO app_config(key, value, updated_by, updated_at) VALUES($1, $2::jsonb, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [k, JSON.stringify(v), adminId],
      );
    }
  });
  clearConfigCache();
  return getConfig();
}

/**
 * Fasulye→Coin kurları maaş tablosuyla para döngüsü kurmasın (bkz. paytable.rules.js salaryLoopError).
 * rates verilmezse kayıtlı kurlar, levels verilmezse kayıtlı tablolar kullanılır. Döngü varsa 400 fırlatır.
 * Dinamik import: ajans modülleri bu dosyayı dolaylı olarak içe aktarabilir (döngüsel import olmasın).
 */
export async function assertNoSalaryLoop(run, rates = {}, levels = null) {
  const [{ loadPayConfig }, { cheapestDiamondsPerUsd, salaryLoopError }] = await Promise.all([
    import('../agencies/agency_metrics.service.js'), import('../games/paytable.rules.js'),
  ]);
  const cfg = await getConfig();
  const pay = levels ?? await loadPayConfig(run);
  const diamondsPerUsd = cheapestDiamondsPerUsd(pay.levels, pay.videoLevels);
  for (const [k, label] of [['usdCoinsPerUsd', 'Fasulye → Coin kuru'], ['usdDealerCoinsPerUsd', 'Bayiye gönderim kuru'], ['usdCoinsPerUsdOthers', 'Başkasına Coin gönderme kuru']]) {
    const v = rates[k] ?? cfg[k];
    if (k === 'usdCoinsPerUsdOthers' && !(Number(v) > 0)) continue; // 0 = kendine kuruyla aynı (o zaten denetlendi)
    const msg = salaryLoopError({ coinsPerUsd: v, diamondsPerUsd, label });
    if (msg) throw fail(msg);
  }
}

/** "2.36.0" < "2.40.1" karşılaştırması. Geçersiz sürüm 0.0.0 sayılır. */
export function compareVersions(a, b) {
  const pa = VERSION_RE.test(a ?? '') ? a.split('.').map(Number) : [0, 0, 0];
  const pb = VERSION_RE.test(b ?? '') ? b.split('.').map(Number) : [0, 0, 0];
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  return 0;
}
