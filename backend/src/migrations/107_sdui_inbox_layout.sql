-- Bildirimler ekranının referans düzeni: `repeater` ile ilk gerçek veri bağlama.
--
-- Çocuklar ŞABLONDUR: {title} ve {body} her bildirim için o bildirimin alanıyla
-- değiştirilir. Yalnızca düz alan adı — ifade ya da koşul yok.
--
-- `emptyText` zorunlu gibi düşünülmeli: veri gelmediğinde boş ekran gösteren bir sayfa,
-- bozuk sayfadan ayırt edilemez.
--
-- YALNIZCA TASLAK, yalnızca hiç elle düzenlenmemişse. Kullanıcı tarafında hiçbir şey
-- değişmez; panelden yayınlanana kadar herkes uygulamanın yerleşik listesini görür.
UPDATE sdui_screens
   SET draft = '{"schemaVersion": 2, "screenId": "inbox", "root": {"type": "maxWidth", "width": 600, "align": "center", "children": [{"type": "column", "padding": 12, "gap": 6, "children": [{"type": "title", "text": "Bildirimler", "subtitle": "Son 7 gün"}, {"type": "repeater", "source": "inbox", "max": 50, "emptyText": "Son 7 günde bildirimin yok.", "children": [{"type": "listItem", "title": "{title}", "subtitle": "{body}", "icon": "bell", "tone": "default"}, {"type": "shape", "kind": "line", "thickness": 1, "tone": "muted"}]}, {"type": "safeArea", "bottom": true, "children": [{"type": "spacer", "size": 8}]}]}]}}'::jsonb
 WHERE screen_id = 'inbox' AND draft_updated_by IS NULL;
