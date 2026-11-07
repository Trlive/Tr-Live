-- Hediye ve mağaza öğesi adlarında marka / telifli karakter adı kalmasın (mağaza ve reklam kuralları).
-- Yalnızca adı değişir; fiyat, animasyon ve geçmiş kayıtlar aynı kalır.
UPDATE gifts SET name = CASE
  WHEN name ILIKE '%ferrari%' THEN 'Kırmızı Yarış Arabası'
  WHEN name ILIKE '%lamborghini%' THEN 'Süper Spor Araba'
  WHEN name ILIKE '%rolls%' OR name ILIKE '%royce%' THEN 'Lüks Sedan'
  WHEN name ILIKE '%bugatti%' THEN 'Hiper Spor Araba'
  WHEN name ILIKE '%mclaren%' THEN 'Turuncu Süper Araba'
  WHEN name ILIKE '%mercedes%' OR name ILIKE '%g65%' OR name ILIKE '%g 65%' THEN 'Lüks Arazi Aracı'
  WHEN name ILIKE '%aston%' THEN 'Üstü Açık Spor Araba'
  WHEN name ILIKE '%saleen%' OR name ILIKE '%fittipaldi%' THEN 'Konsept Yarış Arabası'
  WHEN name ILIKE '%porsche%' OR name ILIKE '%bmw%' OR name ILIKE '%audi%' OR name ILIKE '%tesla%' THEN 'Spor Araba'
  WHEN name ILIKE '%titanic%' OR name ILIKE '%taitanic%' THEN 'Büyük Gemi'
  WHEN name ILIKE '%wonder%woman%' THEN 'Süper Kahraman Kız'
  WHEN name ILIKE '%transformer%' THEN 'Robot Araba'
  WHEN name ILIKE '%külkedisi%' OR name ILIKE '%cinderella%' THEN 'Cam Ayakkabı'
  WHEN name ILIKE '%şeyh%' OR name ILIKE '%sheikh%' OR name ILIKE '%arabian%' THEN 'Zengin Beyefendi'
  ELSE name END
WHERE name ~* '(ferrari|lamborghini|rolls|royce|bugatti|mclaren|mercedes|g ?65|aston|saleen|fittipaldi|porsche|bmw|audi|tesla|titanic|taitanic|wonder.*woman|transformer|külkedisi|cinderella|şeyh|sheikh|arabian)';

UPDATE store_items SET name = CASE
  WHEN name ILIKE '%ferrari%' THEN 'Kırmızı Yarış Arabası'
  WHEN name ILIKE '%lamborghini%' THEN 'Süper Spor Araba'
  WHEN name ILIKE '%rolls%' OR name ILIKE '%royce%' THEN 'Lüks Sedan'
  WHEN name ILIKE '%bugatti%' THEN 'Hiper Spor Araba'
  WHEN name ILIKE '%mclaren%' THEN 'Turuncu Süper Araba'
  WHEN name ILIKE '%mercedes%' THEN 'Lüks Arazi Aracı'
  WHEN name ILIKE '%porsche%' OR name ILIKE '%bmw%' OR name ILIKE '%audi%' OR name ILIKE '%tesla%' THEN 'Spor Araba'
  ELSE name END
WHERE name ~* '(ferrari|lamborghini|rolls|royce|bugatti|mclaren|mercedes|porsche|bmw|audi|tesla)';
