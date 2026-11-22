-- Maaş koşulları ORANLI değil EŞİKLİ oldu (sahibinin düzeltmesi).
--
--     "21 gün 59 dk bile olsa maaşın yarısı yatacak!"
--
-- v2.150.0'da gün ve saat koşullarını oranlı kurmuştum: 22 günün 20'sini yapan yayıncı o
-- koşulun payının %90'ını alıyordu. İstenen kural bu değil: 22 gün isteniyorsa 21 gün
-- EKSİKTİR, aradaki fark ne kadar küçük olursa olsun. Koşul ya tutar ya tutmaz.
--
-- Ayrıca gün ve saat TEK koşul oldu ("gün ve yayın saati eksikse yarısı"). Ayrı ağırlıkları
-- olsaydı yalnızca günü eksik olana %75 ödenirdi; sahibinin söylediği %50 değil.
--
-- Ağırlık anahtarları bu yüzden değişti:
--     eski: days 2500 + hours 2500 + diamonds 3000 + tasks 2000
--     yeni: attendance 5000 + diamonds 3000 + tasks 2000
--
-- devam 5000 → gün ya da saat eksikse tam olarak maaşın yarısı. %60 istenirse 4000.
--
-- Bu değişiklik kimseye yanlış ödeme yapmadı: ağırlıklı hesap hiç ödemeye esas olmadı
-- (salary_weighted_enabled kapalı geldi ve kapalı duruyor).

ALTER TABLE agency_settings
  ALTER COLUMN salary_weights SET DEFAULT '{"attendance":5000,"diamonds":3000,"tasks":2000}'::jsonb;

-- Mevcut satırı yeni biçime çevir. Eski biçimdeyse (days/hours anahtarları varsa)
-- devam ağırlığı, eski gün + saat ağırlıklarının TOPLAMI olur: sahibinin kurduğu
-- %50 oranı korunur. Toplam 10000'i aşarsa ya da anahtarlar tanınmazsa varsayılana döner;
-- uygulama katmanı (validateWeights) toplamı yine denetliyor.
UPDATE agency_settings SET salary_weights =
  CASE
    WHEN salary_weights ? 'attendance' THEN salary_weights
    WHEN salary_weights ? 'days' AND salary_weights ? 'hours'
         AND COALESCE((salary_weights->>'days')::int, 0) + COALESCE((salary_weights->>'hours')::int, 0)
           + COALESCE((salary_weights->>'diamonds')::int, 0) + COALESCE((salary_weights->>'tasks')::int, 0) = 10000
      THEN jsonb_build_object(
        'attendance', COALESCE((salary_weights->>'days')::int, 0) + COALESCE((salary_weights->>'hours')::int, 0),
        'diamonds', COALESCE((salary_weights->>'diamonds')::int, 0),
        'tasks', COALESCE((salary_weights->>'tasks')::int, 0))
    ELSE '{"attendance":5000,"diamonds":3000,"tasks":2000}'::jsonb
  END
WHERE id = 1;

-- Kapanmış dönemlerin özetlerindeki kırılım (weight_parts) eski biçimde kalıyor ve
-- BİLEREK dokunulmuyor: o dönem o kurallarla hesaplanmıştı. Geçmişi yeni kurala göre
-- yeniden yazmak, özetin "o gün ne hesaplandı" belgesi olma niteliğini bozardı.
-- Uygulama tarafı eski kırılımı da çizebiliyor (bilinmeyen alanlar yok sayılıyor).
