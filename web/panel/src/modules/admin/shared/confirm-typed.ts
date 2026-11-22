/** "SİL" yazdırarak kalıcı işlem onayı. Vazgeçilirse false, hatalı yazılırsa hata fırlatır.
 *
 *  YALNIZCA YÖNETİM PANELİ. Burada durmasının sebebi, `window.prompt` kullanması:
 *  yönetim paneli masaüstü tarayıcıda açılıyor, adresi kullanıcı kendisi yazdı ve adres
 *  çubuğunda görüyor; tarayıcı kutusu orada sorun değil.
 *
 *  Ajans ve Yayıncı Merkezi ise uygulamanın İÇİNDE WebView'de açılıyor. Orada tarayıcı
 *  kutusu, başlığında sunucu adresini gösteriyor ("https://...-sslip.io adresindeki
 *  sayfada şunlar belirtiliyor:"). Bu yüzden bu yardımcı paylaşılan kit.tsx'ten buraya
 *  taşındı: uygulama içi sayfalar kit.tsx'i import ediyor, bu dosyayı etmiyor.
 *  Uygulama içi onaylar için `shared/components/confirm.tsx` → `useConfirm()`.
 */
export function confirmTyped(message: string, word = "SİL"): boolean {
  const typed = window.prompt(`${message}\n\nOnay için ${word} yazın.`);
  if (typed === null) return false;
  if (typed.trim().toLocaleUpperCase("tr-TR") !== word) throw new Error("Onay metni hatalı; işlem yapılmadı.");
  return true;
}
