-- Yazılım testi bütçesi 1M → 10M. Gerekçe: en pahalı hediye 5.000.000 Coin olacak; animasyonunun
-- ve akışının denenebilmesi için tek bir gönderim bile bütçenin yarısını yiyordu.
-- Yalnızca ilk değer (1.000.000) duruyorsa değiştirilir: panelden elle ayarlanmış değer ezilmez.
UPDATE coin_budgets
   SET monthly_limit = 10000000,
       note = 'Test ve deneme için basılan Coin. En pahalı hediye 5.000.000 Coin olduğundan sınır onun birkaç katı tutuldu. Panelden değişir.',
       updated_at = NOW()
 WHERE key = 'system_test' AND monthly_limit = 1000000;
