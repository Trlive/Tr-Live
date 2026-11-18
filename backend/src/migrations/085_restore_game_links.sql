-- Zip ile yüklenmiş oyunu olan ama bağlantısı (eski panel formuyla kaydedilince) boşalmış etkinlikleri düzeltir.
UPDATE activity_items a
   SET link_url = '{base}/games/' || a.id || '/v' || g.version || '/index.html?uid={uid}&token={token}&name={name}&lang={lang}&roomId={roomId}',
       updated_at = NOW()
  FROM activity_games g
 WHERE g.activity_id = a.id AND COALESCE(a.link_url, '') = '';
