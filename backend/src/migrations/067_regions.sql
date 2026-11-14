-- Ana sayfa bölge sekmeleri: Uzbekistan (Türkiye + Orta Asya) / Arap / Hindistan / Avrupa (ve diğer ülkeler).
-- Kullanıcının bölgesi, odasının hangi sekmede listeleneceğini belirler. Mevcut kullanıcılar ülke kodundan / ülke
-- yazısından yerleşir; bilinmeyenler Uzbekistan sekmesinde kalır.
ALTER TABLE users ADD COLUMN IF NOT EXISTS region VARCHAR(2) NOT NULL DEFAULT 'uz';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_region_check;
ALTER TABLE users ADD CONSTRAINT users_region_check CHECK (region IN ('uz', 'ar', 'in', 'eu'));

UPDATE users SET region = 'ar' WHERE country_code IN ('SA','AE','QA','KW','BH','OM','YE','IQ','SY','LB','JO','PS','EG','LY','TN','DZ','MA','SD','MR','SO','DJ','KM')
   OR (country_code IS NULL AND lower(COALESCE(country, '')) ~ '(arab|suudi|saudi|irak|iraq|mısır|misir|egypt|ürdün|urdun|jordan|kuveyt|kuwait|katar|qatar|emirates|dubai|lübnan|lubnan|lebanon|suriye|syria|fas|morocco|cezayir|algeria|tunus|tunisia|libya|umman|oman|bahreyn|bahrain|yemen|filistin|palestine|sudan)');
UPDATE users SET region = 'in' WHERE country_code IN ('IN','PK','BD','NP','LK','BT','MV','AF')
   OR (country_code IS NULL AND lower(COALESCE(country, '')) ~ '(hindistan|india|bharat|pakistan|bangladeş|banglades|bangladesh|nepal|sri lanka|afganistan|afghanistan)');
UPDATE users SET region = 'eu' WHERE (country_code IS NOT NULL AND country_code NOT IN ('UZ','TR','AZ','CY','KZ','KG','TM','TJ','SA','AE','QA','KW','BH','OM','YE','IQ','SY','LB','JO','PS','EG','LY','TN','DZ','MA','SD','MR','SO','DJ','KM','IN','PK','BD','NP','LK','BT','MV','AF'))
   OR (country_code IS NULL AND lower(COALESCE(country, '')) ~ '(almanya|germany|deutschland|fransa|france|hollanda|netherlands|belçika|belcika|belgium|avusturya|austria|isviçre|isvicre|switzerland|ingiltere|united kingdom|england|italya|italy|ispanya|spain|isveç|isvec|sweden|norveç|norvec|norway|danimarka|denmark|polonya|poland|yunanistan|greece|bulgaristan|bulgaria|romanya|romania|avrupa|europe|amerika|usa|united states|kanada|canada|avustralya|australia)');
CREATE INDEX IF NOT EXISTS idx_users_region ON users(region);
