// Panel seçim sayfası kaldırıldı (v2.153.1): her panelin kendi gizli giriş bağlantısı var (sunucu panelinde). Bu adres
// sunucuda zaten 404 döner; statik dosya doğrudan açılırsa da hiçbir panel adı ya da bağlantı gösterilmez.
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 text-sm text-neutral-500">
      404
    </main>
  );
}
