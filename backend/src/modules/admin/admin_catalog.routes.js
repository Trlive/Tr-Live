// Yönetici paneli — katalog ve mağaza.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { COLORED_IDS, GIFT_TABS, MEDIA_MAX_BYTES, SAMPLE_DIR, SAMPLE_ITEMS, SERVER_VERSION, STATE_DIR, STORE_CATS, TOGGLE_TABLES, WIP_GRANT_KIND, WIP_MAX_LEVEL, announceUserChange, applyPackZip, assertStaffTarget, assetUrl, auditStaff, autoIcon, bigAmount, budget, detectMedia, ensureVapc, equipIfNone, express, fail, filling, fs, grantCats, guessFormat, httpsUrl, mimeFor, oneOf, packBusy, packStatus, positiveInt, prepareMp4, query, removeOrHide, requireSuperAdmin, tailFile, text, tx, uuid, wipLabel, wipLevel } from './admin.shared.js';

export const router = Router();

// ---------------- Coin paketleri (yönetici) ----------------
router.get('/coin-packages', requireSuperAdmin, async (_req, res) => {
  const r = await query(`SELECT * FROM coin_packages ORDER BY is_active DESC, sort_order, coins`);
  res.json({ packages: r.rows.map((x) => ({ id: x.id, coins: String(x.coins), priceCents: String(x.price_cents), currency: x.currency, isActive: x.is_active })) });
});

router.post('/coin-packages', requireSuperAdmin, async (req, res) => {
  const coins = bigAmount(req.body?.coins, 'Coin');
  const price = bigAmount(req.body?.priceCents, 'Fiyat (kuruş)');
  const r = await query(`INSERT INTO coin_packages(coins, price_cents, sort_order) VALUES($1,$2,(SELECT COALESCE(MAX(sort_order),0)+1 FROM coin_packages)) RETURNING id`, [coins.toString(), price.toString()]);
  res.status(201).json({ id: r.rows[0].id });
});

router.post('/coin-packages/:id/active', requireSuperAdmin, async (req, res) => {
  if (typeof req.body?.isActive !== 'boolean') throw fail('isActive true/false olmalı.');
  const r = await query(`UPDATE coin_packages SET is_active = $2 WHERE id = $1 RETURNING id`, [uuid(req.params.id, 'Kimlik'), req.body.isActive]);
  if (!r.rowCount) throw fail('Paket bulunamadı.', 404);
  res.json({ ok: true });
});

// Renkli ID (Görünüm'de takılır): kullanıcının ID'si bronz / gümüş / altın parıltılı yazılır. Dosyasız, kodla çizilir.

// Yönetici "öğe ver" listesi: kategoriye göre tüm katalog öğeleri.
router.get('/grantables', async (req, res) => {
  const category = oneOf(req.query.category, grantCats(), 'Kategori');
  if (category === 'colored_id') {
    return res.json({ items: Object.entries(COLORED_IDS).map(([k, name]) => ({ key: `cid:${k}`, name, imageUrl: null, wip: false, idColor: k })) });
  }
  let items;
  if (category === 'frame') {
    items = (await query(`SELECT id::text AS key, name, image_url FROM frames WHERE is_active = TRUE ORDER BY name`)).rows;
  } else if (category === 'entrance_effect') {
    items = (await query(`SELECT id::text AS key, name, animation_url AS image_url FROM entrance_effects WHERE is_active = TRUE ORDER BY name`)).rows;
  } else {
    items = (await query(`SELECT id::text AS key, name, image_url FROM store_items WHERE category = $1 AND is_active = TRUE ORDER BY name`, [category])).rows;
  }
  // WIP kademelerinin çerçeve / sohbet balonu / rozet / giriş efekti ayrı ayrı verilebilir (WIP üyeliği olmadan da görünür).
  const wipItems = WIP_GRANT_KIND[category]
    ? Array.from({ length: WIP_MAX_LEVEL }, (_, i) => ({ key: `wip:${i + 1}`, name: `${wipLabel(i + 1)} ${WIP_GRANT_KIND[category]}`, image_url: null }))
    : [];
  res.json({ items: [...wipItems, ...items].map((x) => ({ key: x.key, name: x.name, imageUrl: x.image_url, wip: x.key.startsWith('wip:') })) });
});

// Seçilen katalog öğesini kullanıcıya ver. days boş/0 = süresiz.

// Seçilen katalog öğesini kullanıcıya ver. days boş/0 = süresiz.
router.post('/users/:userId/grant', async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const category = oneOf(req.body?.category, grantCats(), 'Kategori');
  const key = text(req.body?.itemKey, 'Öğe', { min: 1, max: 80, required: true });
  const days = req.body?.days ? positiveInt(req.body.days, 'Gün', 3650) : null;
  await assertStaffTarget(req, userId);
  if (category === 'colored_id') {
    const color = /^cid:(bronz|gumus|altin)$/.exec(key)?.[1];
    if (!color) throw fail('Geçersiz renkli ID.');
    // Aynı renk zaten varsa yeni satır açılmaz: süresi uzar (gün verilmezse süresiz olur).
    const ext = await query(
      `UPDATE inventory_items SET expires_at = CASE WHEN $3::int IS NULL OR expires_at IS NULL THEN NULL
                                                   ELSE GREATEST(expires_at, NOW()) + ($3::int * INTERVAL '1 day') END
       WHERE id = (SELECT id FROM inventory_items WHERE user_id = $1 AND item_type = 'colored_id' AND item_key = $2 AND is_active = TRUE
                     AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 1)
       RETURNING id`,
      [userId, key, days],
    );
    if (ext.rowCount) {
      await query(
        `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'admin_inventory_grant','inventory',$3,$4)`,
        [req.user.id, userId, ext.rows[0].id, JSON.stringify({ category, key, days, extended: true })],
      );
      return res.status(201).json({ id: ext.rows[0].id, name: COLORED_IDS[color], extended: true });
    }
    const r = await query(
      `INSERT INTO inventory_items(user_id, item_type, item_key, item_name, expires_at, metadata)
       VALUES($1,'colored_id',$2,$3, CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() + ($4::int * INTERVAL '1 day') END, $5) RETURNING id`,
      [userId, key, COLORED_IDS[color], days, JSON.stringify({ idColor: color, grantedBy: req.user.id })],
    );
    await equipIfNone(query, userId, 'colored_id', r.rows[0].id);
    await query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'admin_inventory_grant','inventory',$3,$4)`,
      [req.user.id, userId, r.rows[0].id, JSON.stringify({ category, key, days })],
    );
    res.status(201).json({ id: r.rows[0].id, name: COLORED_IDS[color] });
    announceUserChange(userId);
    return;
  }
  let name; let asset;
  const wipMatch = /^wip:(\d{1,2})$/.exec(key);
  if (wipMatch) {
    const lvl = Number(wipMatch[1]);
    if (!WIP_GRANT_KIND[category] || lvl < 1 || lvl > WIP_MAX_LEVEL) throw fail('Geçersiz WIP öğesi.');
    const r = await query(
      `INSERT INTO inventory_items(user_id, item_type, item_key, item_name, expires_at, metadata)
       VALUES($1,$2,$3,$4, CASE WHEN $5::int IS NULL THEN NULL ELSE NOW() + ($5::int * INTERVAL '1 day') END, $6) RETURNING id`,
      [userId, category, key, `${wipLabel(lvl)} ${WIP_GRANT_KIND[category]}`, days, JSON.stringify({ wipLevel: lvl, grantedBy: req.user.id })],
    );
    await query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'admin_inventory_grant','inventory',$3,$4)`,
      [req.user.id, userId, r.rows[0].id, JSON.stringify({ category, key, days })],
    );
    return res.status(201).json({ id: r.rows[0].id, name: `${wipLabel(lvl)} ${WIP_GRANT_KIND[category]}` });
  }
  if (category === 'frame') {
    const f = (await query(`SELECT name, image_url FROM frames WHERE id::text = $1`, [key])).rows[0];
    if (!f) throw fail('Çerçeve bulunamadı.', 404);
    ({ name, image_url: asset } = f);
  } else if (category === 'entrance_effect') {
    const f = (await query(`SELECT name, animation_url FROM entrance_effects WHERE id::text = $1`, [key])).rows[0];
    if (!f) throw fail('Efekt bulunamadı.', 404);
    name = f.name; asset = f.animation_url;
  } else {
    const f = (await query(`SELECT name, image_url FROM store_items WHERE id::text = $1 AND category = $2`, [key, category])).rows[0];
    if (!f) throw fail('Ürün bulunamadı.', 404);
    ({ name, image_url: asset } = f);
  }
  const r = await query(
    `INSERT INTO inventory_items(user_id, item_type, item_key, item_name, expires_at, metadata)
     VALUES($1,$2,$3,$4, CASE WHEN $5::int IS NULL THEN NULL ELSE NOW() + ($5::int * INTERVAL '1 day') END, $6) RETURNING id`,
    [userId, category, key, name, days, JSON.stringify({ assetUrl: asset, grantedBy: req.user.id })],
  );
  await equipIfNone(query, userId, category, r.rows[0].id);
  await query(
    `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'admin_inventory_grant','inventory',$3,$4)`,
    [req.user.id, userId, r.rows[0].id, JSON.stringify({ category, key, days })],
  );
  res.status(201).json({ id: r.rows[0].id, name });
  announceUserChange(userId);
});

// Test örnekleri: her görünüm türünden birer örnek ürün (mağazada satılmaz) oluşturur ve yöneticinin kendisine
// 30 günlüğüne verip takar. Odaya girince araç, sohbette balon, mikrofonda dalga, profil/oda kartı denenebilir.

router.post('/store/samples', requireSuperAdmin, async (req, res) => {
  const made = [];
  for (const [category, name, file] of SAMPLE_ITEMS) {
    let item = (await query(`SELECT * FROM store_items WHERE category = $1 AND name = $2 AND is_active = TRUE LIMIT 1`, [category, name])).rows[0];
    if (!item) {
      const buf = fs.readFileSync(new URL(file, SAMPLE_DIR));
      const m = await query(
        `INSERT INTO media_files(kind, mime, ext, size_bytes, data, meta, created_by) VALUES('png','image/png','png',$1,$2,$3,$4) RETURNING id`,
        [buf.length, buf, JSON.stringify({ purpose: 'store_sample' }), req.user.id],
      );
      const url = `/media/${m.rows[0].id}.png`;
      const refId = category === 'frame' ? (await query(`INSERT INTO frames(name, image_url) VALUES($1,$2) RETURNING id`, [name, url])).rows[0].id : null;
      item = (await query(
        `INSERT INTO store_items(category, name, image_url, ref_id, price_coins, duration_days, for_sale) VALUES($1,$2,$3,$4,0,30,FALSE) RETURNING *`,
        [category, name, url, refId],
      )).rows[0];
    }
    const key = category === 'frame' && item.ref_id ? String(item.ref_id) : String(item.id);
    await tx(async (c) => {
      // Aynı türdeki diğer öğeler çıkarılır, örnek takılır (deneme için).
      await c.query(`UPDATE inventory_items SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"equipped": false}'::jsonb WHERE user_id = $1 AND item_type = $2`, [req.user.id, category]);
      const ex = (await c.query(
        `SELECT id FROM inventory_items WHERE user_id = $1 AND item_type = $2 AND item_key = $3 AND is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
        [req.user.id, category, key],
      )).rows[0];
      if (ex) {
        await c.query(`UPDATE inventory_items SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"equipped": true}'::jsonb WHERE id = $1`, [ex.id]);
      } else {
        await c.query(
          `INSERT INTO inventory_items(user_id, item_type, item_key, item_name, expires_at, metadata) VALUES($1,$2,$3,$4, NOW() + INTERVAL '30 days', $5)`,
          [req.user.id, category, key, name, JSON.stringify({ assetUrl: item.image_url, storeItemId: item.id, grantedBy: req.user.id, equipped: true })],
        );
      }
    });
    made.push(name);
  }
  res.status(201).json({ ok: true, items: made });
  announceUserChange(req.user.id);
});

// Hazır hediye / çerçeve paketi (TR-Live-paket-N.zip): telefondan doğrudan yüklenir ve hemen uygulanır.

router.post('/asset-pack', requireSuperAdmin, express.raw({ type: () => true, limit: MEDIA_MAX_BYTES }), async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail('Dosya gönderilmedi.');
  if (packBusy) throw fail('Başka bir paket uygulanıyor, biraz sonra tekrar deneyin.', 409);
  packBusy = true;
  try {
    let results;
    try {
      results = await applyPackZip(buf);
    } catch (e) {
      throw fail(`Paket okunamadı: ${e.message}`);
    }
    if (!results.length) throw fail('Bu zip içinde hediye / çerçeve dosyası yok (TR-Live-paket-N.zip olmalı).');
    const count = (s) => results.filter((r) => r.status === s).length;
    res.json({ ok: true, added: count('added'), updated: count('updated'), same: count('same'), deleted: count('deleted'), failed: count('error') + count('incomplete'), results });
  } finally {
    packBusy = false;
  }
});
// Sunucu (Oracle kurulumu): güncelleme / kurulum kayıtları ve "şimdi güncelle" isteği.
// Kayıtlar sunucudaki /opt/trlive/state klasöründen gelir (compose ile /srv/state'e bağlı); yoksa boş döner.

router.get('/server/status', requireSuperAdmin, async (_req, res) => {
  let gitToken = false;
  try { gitToken = fs.statSync(`${STATE_DIR}/git-token`).size > 0; } catch { /* yok */ }
  res.json({
    serverVersion: SERVER_VERSION,
    gitToken,
    available: (() => {
      try { fs.accessSync(`${STATE_DIR}/update`, fs.constants.W_OK); return true; } catch { return false; }
    })(),
    updateLog: tailFile('update.log', 25),
    installLog: tailFile('install.log', 40),
  });
});
// Depo gizliyse sunucunun güncellemeyi indirebilmesi için GitHub erişim anahtarı (yalnızca okuma izinli).
// Anahtar yalnızca sunucuya yazılır; geri okunamaz (dosya yalnız yazılabilir). Boş gönderilirse silinir.

// Depo gizliyse sunucunun güncellemeyi indirebilmesi için GitHub erişim anahtarı (yalnızca okuma izinli).
// Anahtar yalnızca sunucuya yazılır; geri okunamaz (dosya yalnız yazılabilir). Boş gönderilirse silinir.
router.post('/server/git-token', requireSuperAdmin, async (req, res) => {
  const token = String(req.body?.token ?? '').trim();
  if (token && !/^(github_pat_|ghp_)[A-Za-z0-9_]{20,250}$/.test(token)) {
    throw fail('Anahtar geçersiz görünüyor. GitHub anahtarı "github_pat_" ya da "ghp_" ile başlar.');
  }
  try {
    fs.writeFileSync(`${STATE_DIR}/git-token`, token ? `${token}\n` : '', { mode: 0o600 });
  } catch {
    throw fail('Sunucu anahtarı kaydedemedi (sunucu henüz bu sürüme güncellenmemiş olabilir).');
  }
  // Hemen dene.
  try { fs.writeFileSync(`${STATE_DIR}/update`, `${new Date().toISOString()}\n`); } catch { /* sonraki kontrolde */ }
  res.json({ ok: true, saved: Boolean(token) });
});

router.post('/server/update', requireSuperAdmin, async (_req, res) => {
  try {
    fs.writeFileSync(`${STATE_DIR}/update`, `${new Date().toISOString()}\n`);
  } catch {
    throw fail('Sunucu bu isteği alamıyor (istek dosyası yazılamıyor). Birkaç dakika sonra tekrar deneyin.');
  }
  res.json({ ok: true });
});

router.get('/asset-pack/status', requireSuperAdmin, async (_req, res) => {
  res.json({ serverVersion: SERVER_VERSION, ...(await packStatus()) });
});

router.post('/media', requireSuperAdmin, express.raw({ type: () => true, limit: MEDIA_MAX_BYTES }), async (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail('Dosya gönderilmedi.');
  const d = detectMedia(buf);
  // alpha: 'auto' (varsayılan) sunucu anlar; 'left' / 'right' elle seçim.
  const alpha = ['left', 'right'].includes(req.query.alpha) ? req.query.alpha : 'auto';
  let data = buf; let note = null; let iconPng = null;
  if (d.kind === 'mp4') {
    let prepared = null;
    try {
      prepared = await prepareMp4(buf, alpha, { frame: req.query.purpose === 'frame' });
    } catch (e) {
      console.error('Video hazırlanamadı:', e.message);
    }
    if (prepared) {
      data = ensureVapc(prepared.buf, prepared.alpha).buf;
      iconPng = prepared.icon;
      note = prepared.converted
        ? (prepared.scene ? 'Arka planlı video tam ekran (kenarları yumuşak) şeffaf mp4\'e çevrildi.' : 'Siyah arka plan şeffaf yapıldı.')
        : `Şeffaf mp4 (maske ${prepared.alpha === 'right' ? 'sağda' : 'solda'}).`;
    } else {
      const r = ensureVapc(buf, alpha === 'right' ? 'right' : 'left');
      data = r.buf;
      note = r.injected ? 'Şeffaflık ayarı eklendi.' : 'Dosyada şeffaflık ayarı zaten vardı.';
    }
  }
  // Medya bütçesi: sınırı aşan dosya otomatik sınıra indirilir (ayar kapatılabilir).
  let budgetMeta = null;
  if (['mp4', 'svga', 'json', 'png', 'jpg', 'webp', 'gif'].includes(d.kind) && req.query.purpose !== 'auto_icon') {
    try {
      const cls = req.query.purpose === 'frame' || req.query.purpose === 'seat' ? 'small' : req.query.purpose === 'icon' ? 'icon' : 'gift';
      const fit = await budget.fitOnUpload(data, d.kind, cls);
      data = fit.buf; budgetMeta = fit.meta;
      if (fit.note) note = note ? `${note} ${fit.note}` : fit.note;
    } catch (e) {
      console.error('Medya bütçesi uygulanamadı:', e.message);
    }
  }
  const save = (kind, mime, ext, bytes, meta) => query(
    `INSERT INTO media_files(kind, mime, ext, size_bytes, data, meta, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [kind, mime, ext, bytes.length, bytes, JSON.stringify(meta ?? {}), req.user.id],
  );
  const ins = await save(d.kind, mimeFor(d.ext), d.ext, data, budgetMeta ? { ...(d.meta ?? {}), budget: budgetMeta } : d.meta);
  const url = `/media/${ins.rows[0].id}.${d.ext}`;
  // Küçük resim (hediye ikonu): videodan otomatik; görsel dosyalarda dosyanın kendisi.
  let iconUrl = null;
  if (iconPng) iconUrl = `/media/${(await save('png', 'image/png', 'png', iconPng, { purpose: 'auto_icon' })).rows[0].id}.png`;
  else if (['png', 'jpg', 'webp', 'gif'].includes(d.kind)) iconUrl = url;
  const format = { mp4: 'mp4', svga: 'svga', json: 'lottie', webp: 'webp', gif: 'gif', png: 'png', jpg: 'png' }[d.kind];
  res.status(201).json({ url, kind: d.kind, format, size: data.length, note, iconUrl });
});
// Medya bütçesi: dosya boyutu / çözünürlük sınırları, otomatik küçültme, geri alma, sınır dışı hediyeler.

// Medya bütçesi: dosya boyutu / çözünürlük sınırları, otomatik küçültme, geri alma, sınır dışı hediyeler.
router.get('/media-budget', requireSuperAdmin, async (_req, res) => {
  res.json(await budget.status());
});
// Sıradaki dosyayı denetler / küçültür (her çağrıda bir dosya; uygulama "left" bitene kadar tekrar çağırır).

// Sıradaki dosyayı denetler / küçültür (her çağrıda bir dosya; uygulama "left" bitene kadar tekrar çağırır).
router.post('/media-budget/run', requireSuperAdmin, async (req, res) => {
  const r = await budget.runNext(req.user.id);
  if (r.result?.changed) await auditStaff({ query }, req.user.id, null, 'media_budget_fix', { id: r.result.id, newId: r.result.newId, before: r.result.beforeBytes, after: r.result.afterBytes });
  res.json(r);
});

router.post('/media-budget/optimize/:id', requireSuperAdmin, async (req, res) => {
  const r = await budget.runOne(String(req.params.id), req.user.id);
  if (r.changed) await auditStaff({ query }, req.user.id, null, 'media_budget_fix', { id: r.id, newId: r.newId, before: r.beforeBytes, after: r.afterBytes });
  res.json(r);
});

router.post('/media-budget/revert/:id', requireSuperAdmin, async (req, res) => {
  const r = await budget.revert(String(req.params.id));
  await auditStaff({ query }, req.user.id, null, 'media_budget_revert', { id: String(req.params.id), restored: r.restored });
  res.json({ ok: true, ...r });
});

router.post('/media-budget/exempt', requireSuperAdmin, async (req, res) => {
  const giftId = uuid(req.body?.giftId, 'Hediye');
  await budget.setExempt(giftId, req.body?.exempt === true);
  await auditStaff({ query }, req.user.id, null, 'media_budget_exempt', { giftId, exempt: req.body?.exempt === true });
  res.json({ ok: true });
});

router.post('/media-budget/cleanup', requireSuperAdmin, async (req, res) => {
  const r = await budget.cleanup();
  await auditStaff({ query }, req.user.id, null, 'media_budget_cleanup', r);
  res.json({ ok: true, ...r });
});
// İkon verilmediyse animasyondan otomatik: görsel dosyada kendisi, yüklenmiş mp4'te ortalardaki kare.

router.post('/gifts/fill-icons', requireSuperAdmin, async (req, res) => {
  if (filling) throw fail('Küçük resimler zaten hazırlanıyor, biraz bekleyin.', 409);
  filling = true;
  try {
  const rows = (await query(`SELECT id, animation_url FROM gifts WHERE (icon_url IS NULL OR icon_url = '') AND animation_url IS NOT NULL ORDER BY id LIMIT 3 OFFSET $1`,
    [Math.min(10000, Math.max(0, Number(req.body?.skip) | 0))])).rows;
  let done = 0;
  for (const g of rows) {
    const icon = await autoIcon(g.animation_url, req.user.id);
    if (icon) {
      await query(`UPDATE gifts SET icon_url = $2 WHERE id = $1`, [g.id, icon]);
      done++;
    }
  }
  const left = (await query(`SELECT COUNT(*)::int AS n FROM gifts WHERE (icon_url IS NULL OR icon_url = '') AND animation_url IS NOT NULL`)).rows[0].n;
  res.json({ ok: true, total: rows.length, done, failed: rows.length - done, left });
  } finally {
    filling = false;
  }
});

router.post('/gifts', requireSuperAdmin, async (req, res) => {
  // Önce doğrulama (hatalıysa boşuna küçük resim üretilmesin).
  const name = text(req.body?.name, 'Ad', { min: 2, max: 80, required: true });
  const price = bigAmount(req.body?.coinPrice, 'Fiyat').toString();
  const animUrl = assetUrl(req.body?.animationUrl, 'Animasyon adresi');
  const format = oneOf(req.body?.animationFormat ?? guessFormat(req.body?.animationUrl), ['lottie', 'svga', 'mp4', 'webp', 'gif', 'png'], 'Animasyon biçimi');
  const category = oneOf(req.body?.category ?? 'popular', ['event', 'popular', 'private', 'vip', 'lucky', 'cp'], 'Hediye sekmesi');
  const playMode = oneOf(req.body?.playMode ?? 'full', ['full', 'seat'], 'Oynatma yeri');
  const iconUrl = assetUrl(req.body?.iconUrl, 'İkon adresi') ?? await autoIcon(animUrl, req.user.id);
  const r = await query(
    `INSERT INTO gifts(name, coin_price, icon_url, animation_url, animation_format, has_alpha, category, play_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [name, price, iconUrl, animUrl, format, req.body?.hasAlpha !== false, category, playMode],
  );
  res.status(201).json({ id: r.rows[0].id });
});

router.post('/frames', requireSuperAdmin, async (req, res) => {
  const r = await query(`INSERT INTO frames(name, image_url) VALUES($1,$2) RETURNING id`, [
    text(req.body?.name, 'Ad', { min: 2, max: 100, required: true }), assetUrl(req.body?.imageUrl, 'Görsel adresi') ?? (() => { throw fail('Görsel adresi gerekli.'); })()]);
  res.status(201).json({ id: r.rows[0].id });
});

router.post('/entrance-effects', requireSuperAdmin, async (req, res) => {
  const r = await query(`INSERT INTO entrance_effects(name, animation_url, duration_ms) VALUES($1,$2,$3) RETURNING id`, [
    text(req.body?.name, 'Ad', { min: 2, max: 100, required: true }),
    assetUrl(req.body?.animationUrl, 'Animasyon adresi') ?? (() => { throw fail('Animasyon adresi gerekli.'); })(),
    req.body?.durationMs === undefined ? 4000 : positiveInt(req.body.durationMs, 'Süre', 20000)]);
  res.status(201).json({ id: r.rows[0].id });
});

router.get('/store/items', requireSuperAdmin, async (_req, res) => {
  const r = await query(`SELECT * FROM store_items ORDER BY is_active DESC, category, sort_order, created_at DESC LIMIT 500`);
  res.json({ items: r.rows.map((x) => ({ id: x.id, category: x.category, name: x.name, imageUrl: x.image_url, priceCoins: String(x.price_coins), durationDays: x.duration_days, isActive: x.is_active, forSale: x.for_sale })) });
});

router.post('/store/items', requireSuperAdmin, async (req, res) => {
  const category = oneOf(req.body?.category, STORE_CATS, 'Kategori');
  const name = text(req.body?.name, 'Ad', { min: 2, max: 100, required: true });
  const imageUrl = assetUrl(req.body?.imageUrl, 'Görsel adresi') ?? (() => { throw fail('Görsel adresi gerekli.'); })();
  const price = bigAmount(req.body?.priceCoins ?? 0, 'Fiyat');
  const days = req.body?.durationDays === undefined ? 14 : positiveInt(req.body.durationDays, 'Süre (gün)', 3650);
  // Çerçeve ve giriş efekti: mevcut kataloğa da eklenir (profilde/odada aynı kodla gösterilir).
  let refId = null;
  if (category === 'frame') refId = (await query(`INSERT INTO frames(name, image_url) VALUES($1,$2) RETURNING id`, [name, imageUrl])).rows[0].id;
  if (category === 'entrance_effect') refId = (await query(`INSERT INTO entrance_effects(name, animation_url, duration_ms) VALUES($1,$2,4000) RETURNING id`, [name, imageUrl])).rows[0].id;
  const r = await query(
    `INSERT INTO store_items(category, name, image_url, ref_id, price_coins, duration_days, for_sale) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [category, name, imageUrl, refId, price.toString(), days, req.body?.forSale !== false && category !== 'badge'],
  );
  res.status(201).json({ id: r.rows[0].id });
});

router.post('/store/items/:id/active', requireSuperAdmin, async (req, res) => {
  if (typeof req.body?.isActive !== 'boolean') throw fail('isActive true/false olmalı.');
  const r = await query(`UPDATE store_items SET is_active = $2 WHERE id = $1 RETURNING id`, [uuid(req.params.id, 'Kimlik'), req.body.isActive]);
  if (!r.rowCount) throw fail('Ürün bulunamadı.', 404);
  res.json({ ok: true });
});
// Silme: geçmişte kullanılmışsa (satın alma/hediye kaydı) kayıtlar bozulmasın diye gizlenir, aksi halde tamamen silinir.

router.delete('/gifts/:id', requireSuperAdmin, async (req, res) => removeOrHide(res, 'gifts', uuid(req.params.id, 'Kimlik'), 'Geçmişte gönderildiği için silinmedi, gizlendi.'));

router.delete('/store/items/:id', requireSuperAdmin, async (req, res) => removeOrHide(res, 'store_items', uuid(req.params.id, 'Kimlik'), 'Geçmişte alındığı için silinmedi, gizlendi.'));

router.delete('/frames/:id', requireSuperAdmin, async (req, res) => removeOrHide(res, 'frames', uuid(req.params.id, 'Kimlik'), 'Kullanıcılarda olduğu için silinmedi, gizlendi.'));

router.get('/catalog', requireSuperAdmin, async (_req, res) => {
  const g = await query(`SELECT id, name, coin_price, icon_url, animation_url, animation_format, category, play_mode, is_active FROM gifts ORDER BY is_active DESC, coin_price DESC, name`);
  const f = await query(`SELECT id, name, image_url, is_active FROM frames ORDER BY is_active DESC, name`);
  res.json({
    gifts: g.rows.map((r) => ({ id: r.id, name: r.name, coinPrice: String(r.coin_price), iconUrl: r.icon_url, animationUrl: r.animation_url, animationFormat: r.animation_format, category: r.category, playMode: r.play_mode ?? 'full', isActive: r.is_active })),
    frames: f.rows.map((r) => ({ id: r.id, name: r.name, imageUrl: r.image_url, isActive: r.is_active })),
  });
});

router.post('/catalog/:kind/:id/active', requireSuperAdmin, async (req, res) => {
  const table = Object.hasOwn(TOGGLE_TABLES, req.params.kind) ? TOGGLE_TABLES[req.params.kind] : null;
  if (!table) throw fail('Geçersiz katalog türü.', 404);
  if (typeof req.body?.isActive !== 'boolean') throw fail('isActive true/false olmalı.');
  const r = await query(`UPDATE ${table} SET is_active = $2 WHERE id = $1 RETURNING id`, [uuid(req.params.id, 'Kimlik'), req.body.isActive]);
  if (!r.rowCount) throw fail('Öğe bulunamadı.', 404);
  res.json({ ok: true });
});

// Ad / fiyat düzenleme (hediye, çerçeve, mağaza ürünü). Gönderilmeyen alan değişmez.

router.post('/gifts/:id/edit', requireSuperAdmin, async (req, res) => {
  const id = uuid(req.params.id, 'Kimlik');
  const b = req.body ?? {};
  const name = b.name === undefined ? null : text(b.name, 'Ad', { min: 2, max: 80, required: true });
  const price = b.coinPrice === undefined ? null : bigAmount(b.coinPrice, 'Fiyat').toString();
  const category = b.category === undefined ? null : oneOf(b.category, GIFT_TABS, 'Hediye sekmesi');
  const playMode = b.playMode === undefined ? null : oneOf(b.playMode, ['full', 'seat'], 'Oynatma yeri');
  const r = await query(
    `UPDATE gifts SET name = COALESCE($2, name), coin_price = COALESCE($3::bigint, coin_price), category = COALESCE($4, category),
       play_mode = COALESCE($5, play_mode) WHERE id = $1 RETURNING id`,
    [id, name, price, category, playMode],
  );
  if (!r.rowCount) throw fail('Hediye bulunamadı.', 404);
  res.json({ ok: true });
});

router.post('/frames/:id/edit', requireSuperAdmin, async (req, res) => {
  const id = uuid(req.params.id, 'Kimlik');
  const name = text(req.body?.name, 'Ad', { min: 2, max: 100, required: true });
  const r = await tx(async (c) => {
    const u = await c.query(`UPDATE frames SET name = $2 WHERE id = $1 RETURNING id`, [id, name]);
    if (u.rowCount) await c.query(`UPDATE store_items SET name = $2 WHERE category = 'frame' AND ref_id = $1`, [id, name]);
    return u;
  });
  if (!r.rowCount) throw fail('Çerçeve bulunamadı.', 404);
  res.json({ ok: true });
});

router.post('/store/items/:id/edit', requireSuperAdmin, async (req, res) => {
  const id = uuid(req.params.id, 'Kimlik');
  const b = req.body ?? {};
  const name = b.name === undefined ? null : text(b.name, 'Ad', { min: 2, max: 100, required: true });
  // Mağaza ürününün fiyatı 0 olabilir (yalnızca yöneticinin verdiği ürünler).
  const price = b.priceCoins === undefined ? null
    : (/^0+$/.test(String(b.priceCoins).trim()) ? '0' : bigAmount(b.priceCoins, 'Fiyat').toString());
  const days = b.durationDays === undefined ? null : positiveInt(b.durationDays, 'Süre (gün)', 3650);
  if (b.forSale !== undefined && typeof b.forSale !== 'boolean') throw fail('forSale true/false olmalı.');
  const forSale = b.forSale === undefined ? null : b.forSale;
  const r = await tx(async (c) => {
    const u = await c.query(
      `UPDATE store_items SET name = COALESCE($2, name), price_coins = COALESCE($3::bigint, price_coins),
         duration_days = COALESCE($4::int, duration_days),
         for_sale = COALESCE($5::boolean, for_sale) AND category <> 'badge' AND COALESCE($3::bigint, price_coins) > 0
       WHERE id = $1 RETURNING category, ref_id`,
      [id, name, price, days, forSale],
    );
    const it = u.rows[0];
    if (it && name && it.ref_id) {
      if (it.category === 'frame') await c.query(`UPDATE frames SET name = $2 WHERE id = $1`, [it.ref_id, name]);
      if (it.category === 'entrance_effect') await c.query(`UPDATE entrance_effects SET name = $2 WHERE id = $1`, [it.ref_id, name]);
    }
    return u;
  });
  if (!r.rowCount) throw fail('Ürün bulunamadı.', 404);
  res.json({ ok: true });
});

// ---------------- Bayi (yalnızca yönetici) ----------------

// ---------------- Müzik kütüphanesi (yalnızca yönetici) ----------------
// Telif: yalnızca kullanım hakkına sahip olduğunuz parçaları ekleyin; lisans notu zorunludur.
router.post('/music/tracks', requireSuperAdmin, async (req, res) => {
  const url = httpsUrl(req.body?.url, 'Şarkı adresi');
  if (!url) throw fail('Şarkı adresi gerekli.');
  const r = await query(
    `INSERT INTO music_tracks(title, artist, url, cover_url, duration_ms, license_note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [text(req.body?.title, 'Başlık', { min: 1, max: 120, required: true }), text(req.body?.artist, 'Sanatçı', { max: 120 }), url,
      httpsUrl(req.body?.coverUrl, 'Kapak adresi'), positiveInt(req.body?.durationMs, 'Süre (ms)', 7200000),
      text(req.body?.licenseNote, 'Lisans notu', { min: 3, max: 300, required: true }), req.user.id],
  );
  res.status(201).json({ id: r.rows[0].id });
});

router.get('/music/tracks', requireSuperAdmin, async (req, res) => {
  const r = await query(`SELECT id, title, artist, duration_ms, is_active, license_note FROM music_tracks ORDER BY created_at DESC LIMIT 200`);
  res.json({ tracks: r.rows.map((t) => ({ id: t.id, title: t.title, artist: t.artist, durationMs: t.duration_ms, isActive: t.is_active, licenseNote: t.license_note })) });
});

// ---------------- Şikâyetler (admin + support) ----------------
