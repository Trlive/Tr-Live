# TR Live web (sunucuda yayınlanır)

| Adres | Ne |
|---|---|
| `https://SUNUCU/yonetim/` | Panel seçimi |
| `https://SUNUCU/yonetim/admin/login/` | Yönetim paneli (yönetici, yardımcı admin) |
| `https://SUNUCU/yonetim/agency/login/` | Ajans paneli (ajans sahibi, asistan) |
| `https://SUNUCU/` | Tanıtım sitesi ve yasal metinler |

- `panel/`: eski **Trlive-Web** deposu (Next.js, statik). `site/`: eski **Trlive.github.io** deposu.
- Sunucu her güncellemede `web` kabını derler (`Dockerfile`). Panel derlenemezse güncelleme durmaz; panel yerine
  "derlenemedi" sayfası görünür ve uygulama sunucusu yine güncellenir.
- Panel istekleri aynı adrese gider (`NEXT_PUBLIC_API_BASE_URL=same-origin`); giriş uygulamadaki hesapla yapılır.
- Bundan sonra panel değişiklikleri bu klasörde yapılır; tek zip uygulamayı, sunucuyu ve paneli birlikte günceller.
