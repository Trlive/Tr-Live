// Zorunlu güncelleme kapısının web paneli muafiyeti (bağımlılık yok, test edilebilir).
//
// Web yönetim/ajans paneli bir uygulama sürümü değildir; "en düşük sürüm"ün altında kalan uygulamalara uygulanan 426 ona uygulanmaz.
// Eskiden "X-Client: web-panel" başlığı HERHANGİ bir /api yolunda yeterliydi: eski bir uygulama bu başlığı ekleyerek zorunlu güncellemeyi
// atlayabiliyordu (rapor O-08). Artık muafiyet yalnızca panelin kendi API yollarında geçerlidir; oda, hediye, cüzdan gibi uygulama
// yollarında başlık işe yaramaz. Liste web/panel kaynağından çıkarıldı; update_gate.test.js panelin yeni bir yol parçası
// kullanmaya başlayıp bu listeyi güncellemeyi unutmasını CI'da yakalar.
//
// Kalan sınır: auth, me, users, dealer, broadcaster gibi uygulamayla ORTAK yollarda başlık hâlâ kapıyı atlatır; panelin giriş yapabilmesi için gerekli.
export const WEB_PANEL_PREFIXES = Object.freeze([
  'admin', 'agency-center', 'agencies', 'agency-requests', 'agency-transfers', 'announcements',
  'auth', 'broadcaster', 'dealer', 'me', 'users', 'wip',
]);

/** path: /api altındaki yol (req.path), ör. '/admin/users'. */
export function isWebPanelRequest(xClientHeader, path) {
  if (xClientHeader !== 'web-panel') return false;
  const first = String(path ?? '').split('/')[1] ?? '';
  return WEB_PANEL_PREFIXES.includes(first);
}
