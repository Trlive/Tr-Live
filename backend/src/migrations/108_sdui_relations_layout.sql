-- Arkadaş listesinin referans düzeni.
--
-- Satır sonundaki MESAJ düğmesi (`trailingAction`) bilerek burada: yerleşik listede o
-- düğme vardı. SDUI sürümü yerleşik sürümden kötü olamaz — kötüyse yayınlanmamalı.
--
-- `{id}` şablonu hem profili açan eyleme hem sohbet eylemine bağlanıyor. Sohbet ekranı
-- karşı tarafın adını ve avatarını istediği için eylem yalnızca kimlik taşır; gerisini
-- uygulama `/api/users/:id` ile çeker (profil ekranının zaten yaptığı şey).
--
-- YALNIZCA TASLAK, yalnızca hiç elle düzenlenmemişse.
UPDATE sdui_screens
   SET draft = '{"schemaVersion": 2, "screenId": "relations", "root": {"type": "maxWidth", "width": 600, "align": "center", "children": [{"type": "column", "padding": 10, "gap": 2, "children": [{"type": "repeater", "source": "relations", "max": 100, "emptyText": "Henüz arkadaşın yok. Bir profile girip \"Arkadaş ekle\" diyebilirsin.", "children": [{"type": "listItem", "title": "{displayName}", "subtitle": "@{username}", "image": "{avatarUrl}", "icon": "person", "tone": "primary", "action": {"type": "openScreen", "screen": "profile", "arg": "{id}"}, "trailingIcon": "chat", "trailingAction": {"type": "openChat", "id": "{id}"}}]}, {"type": "safeArea", "bottom": true, "children": [{"type": "spacer", "size": 8}]}]}]}}'::jsonb
 WHERE screen_id = 'relations' AND draft_updated_by IS NULL;
