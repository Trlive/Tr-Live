-- Yardım ekranının referans düzeni: kalan 11 ekran bunu örnek alacak.
--
-- Neden 105'te değil de ayrı bir göç: 105 canlıda çalışmış olabilir ve göçler bir kez
-- uygulanır. 105'i düzenlemek sunucuda hiçbir şeyi değiştirmezdi.
--
-- YALNIZCA TASLAK güncellenir, yayın değil: kullanıcı tarafında hiçbir şey değişmez.
-- Üstelik yalnızca taslak HİÇ ELLE DÜZENLENMEMİŞSE: yöneticinin emeğini ezmeyiz.
--
-- Düzende gösterilen mimari:
--   · maxWidth  — geniş ekranda satır okunamayacak kadar uzamasın
--   · grid      — kartlar her ekranda aynı oranda
--   · icon/shape— görsel İNDİRMEDEN, vektörel: her yoğunlukta keskin, çevrimdışı çizilir
--   · spacer    — boşluk da bir tasarım kararıdır, rastgele padding değil
--   · safeArea  — alt çentik/gezinme çubuğunun altında kalan içerik olmasın
UPDATE sdui_screens
   SET draft = '{"schemaVersion": 2, "screenId": "help", "root": {"type": "maxWidth", "width": 600, "align": "center", "children": [{"type": "column", "padding": 14, "gap": 10, "children": [{"type": "title", "text": "Size nasıl yardımcı olabiliriz?", "subtitle": "Konuyu seçin, doğrudan ilgili ekibe bağlanalım"}, {"type": "grid", "columns": 2, "gap": 10, "children": [{"type": "card", "title": "Aile", "action": {"type": "openScreen", "screen": "support", "arg": "Aile"}, "children": [{"type": "icon", "name": "group", "size": 26, "tone": "gold"}]}, {"type": "card", "title": "ACM ve Yayıncı", "action": {"type": "openScreen", "screen": "support", "arg": "ACM ve Yayıncı"}, "children": [{"type": "icon", "name": "mic", "size": 26, "tone": "gold"}]}, {"type": "card", "title": "Oyunlar", "action": {"type": "openScreen", "screen": "support", "arg": "Oyunlar"}, "children": [{"type": "icon", "name": "game", "size": 26, "tone": "gold"}]}, {"type": "card", "title": "Etkinlikler", "action": {"type": "openScreen", "screen": "support", "arg": "Etkinlikler"}, "children": [{"type": "icon", "name": "event", "size": 26, "tone": "gold"}]}, {"type": "card", "title": "Onaylamalar", "action": {"type": "openScreen", "screen": "support", "arg": "Onaylamalar"}, "children": [{"type": "icon", "name": "check", "size": 26, "tone": "gold"}]}, {"type": "card", "title": "Küfür ve hakaret", "action": {"type": "openScreen", "screen": "support", "arg": "Küfür ve hakaret"}, "children": [{"type": "icon", "name": "warning", "size": 26, "tone": "gold"}]}, {"type": "card", "title": "VIP", "action": {"type": "openScreen", "screen": "support", "arg": "VIP"}, "children": [{"type": "icon", "name": "crown", "size": 26, "tone": "gold"}]}, {"type": "card", "title": "BCM", "action": {"type": "openScreen", "screen": "support", "arg": "BCM"}, "children": [{"type": "icon", "name": "star", "size": 26, "tone": "gold"}]}]}, {"type": "spacer", "size": 6}, {"type": "shape", "kind": "line", "thickness": 1, "tone": "muted"}, {"type": "spacer", "size": 6}, {"type": "listItem", "title": "Çevrimiçi müşteri hizmetleri", "subtitle": "Ortalama yanıt: birkaç dakika", "icon": "chat", "tone": "gold", "action": {"type": "openScreen", "screen": "support"}}, {"type": "safeArea", "bottom": true, "children": [{"type": "spacer", "size": 8}]}]}]}}'::jsonb
 WHERE screen_id = 'help' AND draft_updated_by IS NULL;
