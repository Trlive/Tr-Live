import express, { Router } from 'express';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth, requireSuperAdmin } from '../../middleware/authentication/auth.js';
import { userLimit } from '../../middleware/security/firewall.js';
import { fail, uuid, positiveInt, text } from '../../shared/errors/http.js';
import { idempotent } from '../../middleware/validation/idempotency.js';
import {
  EFFECTS, DEFAULT_KEY, isThemeKey, themeView, customView, ownedThemes, buyTheme, giftTheme, grantCustom,
  submitCustom, approveCustom, rejectCustom, notifyCustom, expireThemes,
} from './room_themes.service.js';
import { storeThemeImage } from '../media/theme_images.service.js';
import { notifyUser } from '../notifications/notify.service.js';

const IMAGE_BODY = express.raw({ type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], limit: '4mb' });

// ---------------- Kullanıcı ----------------
export const router = Router();
router.use(requireAuth);

// Katalog (herkes görür: odadaki tema çizimi için) + hakları. ?roomId= verilirse ve istek sahibi o odanın sahibi /
// yardımcı sahibiyse haklar ODA SAHİBİNE göre hesaplanır (tema hakları odanın sahibine aittir).
router.get('/', async (req, res) => {
  let subject = req.user.id;
  if (req.query.roomId) {
    const roomId = uuid(String(req.query.roomId), 'Oda');
    const r = (await query(
      `SELECT r.owner_id, m.role FROM rooms r LEFT JOIN room_members m ON m.room_id = r.id AND m.user_id = $2 WHERE r.id = $1 AND r.is_active = TRUE`,
      [roomId, req.user.id],
    )).rows[0];
    if (r && (r.owner_id === req.user.id || ['owner', 'cohost'].includes(r.role))) subject = r.owner_id;
  }
  const self = subject === req.user.id;
  const themes = (await query(`SELECT * FROM room_themes WHERE is_active = TRUE AND is_deleted = FALSE ORDER BY sort_order, key`)).rows;
  const owned = await ownedThemes(subject);
  const custom = (await query(
    `SELECT * FROM custom_room_themes WHERE user_id = $1 AND status ${self ? "<> 'expired'" : "= 'approved' AND expires_at > NOW()"}
      ORDER BY created_at DESC LIMIT 20`, [subject],
  )).rows;
  res.json({ themes: themes.map((t) => themeView(t, owned[t.key] ?? null)), custom: custom.map(customView), self });
});

router.post('/:key/buy', userLimit('room_theme_buy', 20, 3600e3), idempotent('room_theme_buy'), async (req, res) => {
  const key = text(req.params.key, 'Tema', { required: true, max: 20 });
  res.json({ ok: true, ...(await tx((c) => buyTheme(c, { userId: req.user.id, key }))) });
});

// Özel tema görseli (uygulama 9:16 kırpar; sunucu yine de 1080x1920'ye getirir). Sonra yönetim incelemesine girer.
router.put('/custom/:id/image', userLimit('custom_theme_upload', 10, 3600e3), async (req, _res, next) => {
  const id = uuid(req.params.id, 'Özel tema');
  const ok = await query(`SELECT 1 FROM custom_room_themes WHERE id = $1 AND user_id = $2 AND status IN ('granted','rejected')`, [id, req.user.id]);
  if (!ok.rowCount) throw fail('Bu özel tema şu an görsel kabul etmiyor.', 409);
  next();
}, IMAGE_BODY, async (req, res) => {
  const id = uuid(req.params.id, 'Özel tema');
  const img = await storeThemeImage(req.body, { userId: req.user.id, purpose: 'custom_theme' });
  res.json({ ok: true, custom: await submitCustom({ userId: req.user.id, id, imageUrl: img.imageUrl }) });
});

// ---------------- Yönetim (yalnızca yönetici) ----------------
export const adminRouter = Router();
adminRouter.use(requireAuth, requireSuperAdmin);

const colorsOf = (v) => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length < 2 || v.length > 4 || !v.every((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))) {
    throw fail('Renkler 2-4 adet #RRGGBB olmalı.');
  }
  return JSON.stringify(v.map((c) => c.toUpperCase()));
};
const mediaUrl = (v, field) => {
  if (v === null) return null;
  if (typeof v !== 'string' || !/^\/media\/[0-9a-f-]{36}\.(webp|jpg|png|gif)$/.test(v)) throw fail(`${field} geçersiz.`);
  return v;
};
const coins = (v) => {
  const s = String(v ?? '');
  if (!/^\d{1,12}$/.test(s)) throw fail('Fiyat geçersiz.');
  return s;
};

adminRouter.get('/', async (_req, res) => {
  const rows = (await query(
    `SELECT t.*, (SELECT COUNT(*) FROM rooms r WHERE r.theme = t.key AND r.is_active) AS in_use
       FROM room_themes t WHERE t.is_deleted = FALSE ORDER BY t.sort_order, t.key`,
  )).rows;
  res.json({ themes: rows.map((t) => ({ ...themeView(t, null, { admin: true }), inUse: Number(t.in_use) })), effects: EFFECTS });
});

// Görsel yükle → otomatik boyutlandırılmış tam ekran + küçük resim adresleri (sonra oluştur/düzenle ile kaydedilir).
adminRouter.put('/image', IMAGE_BODY, async (req, res) => {
  res.json({ ok: true, ...(await storeThemeImage(req.body, { userId: req.user.id, purpose: 'room_theme', allowAnimated: true })) });
});

adminRouter.post('/', async (req, res) => {
  const b = req.body ?? {};
  const key = String(b.key ?? '').trim().toLowerCase();
  if (!isThemeKey(key)) throw fail('Anahtar 2-20 karakter olmalı (küçük harf, rakam, alt çizgi; harfle başlar).');
  const label = text(b.label, 'Ad', { min: 1, max: 40, required: true });
  const effect = b.effect ?? 'none';
  if (!EFFECTS.includes(effect)) throw fail('Efekt geçersiz.');
  const imageUrl = mediaUrl(b.imageUrl, 'Görsel');
  const thumbUrl = b.thumbUrl == null ? null : mediaUrl(b.thumbUrl, 'Küçük resim');
  const exists = await query(`SELECT is_deleted FROM room_themes WHERE key = $1`, [key]);
  if (exists.rowCount && !exists.rows[0].is_deleted) throw fail('Bu anahtarla bir tema zaten var.', 409);
  const vals = [key, label, colorsOf(b.colors) ?? '["#0B0906","#17130C"]', effect, coins(b.priceCoins ?? 0),
    positiveInt(b.durationDays ?? 14, 'Süre', 365), Number.isInteger(b.sortOrder) ? b.sortOrder : 100, imageUrl, thumbUrl];
  const r = await query(
    `INSERT INTO room_themes(key, label, colors, effect, price_coins, duration_days, sort_order, image_url, thumb_url, is_active, is_deleted, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,FALSE,NOW())
     ON CONFLICT (key) DO UPDATE SET label = $2, colors = $3, effect = $4, price_coins = $5, duration_days = $6, sort_order = $7,
       image_url = $8, thumb_url = $9, is_active = TRUE, is_deleted = FALSE, updated_at = NOW()
     RETURNING *`, vals,
  );
  res.json({ ok: true, theme: themeView(r.rows[0], null, { admin: true }) });
});

adminRouter.patch('/:key', async (req, res) => {
  const key = text(req.params.key, 'Tema', { required: true, max: 20 });
  const b = req.body ?? {};
  const sets = []; const vals = [key];
  const set = (col, v) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (b.label !== undefined) set('label', text(b.label, 'Ad', { min: 1, max: 40, required: true }));
  if (b.colors !== undefined) set('colors', colorsOf(b.colors));
  if (b.effect !== undefined) { if (!EFFECTS.includes(b.effect)) throw fail('Efekt geçersiz.'); set('effect', b.effect); }
  if (b.priceCoins !== undefined) set('price_coins', coins(b.priceCoins));
  if (b.durationDays !== undefined) set('duration_days', positiveInt(b.durationDays, 'Süre', 365));
  if (b.sortOrder !== undefined) { if (!Number.isInteger(b.sortOrder)) throw fail('Sıra geçersiz.'); set('sort_order', b.sortOrder); }
  if (b.imageUrl !== undefined) set('image_url', mediaUrl(b.imageUrl, 'Görsel'));
  if (b.thumbUrl !== undefined) set('thumb_url', b.thumbUrl === null ? null : mediaUrl(b.thumbUrl, 'Küçük resim'));
  if (b.active !== undefined) {
    if (typeof b.active !== 'boolean') throw fail('active true/false olmalı.');
    if (key === DEFAULT_KEY && !b.active) throw fail('Varsayılan tema kapatılamaz.');
    set('is_active', b.active);
  }
  if (!sets.length) throw fail('Değişiklik yok.');
  const r = await query(`UPDATE room_themes SET ${sets.join(', ')}, updated_at = NOW() WHERE key = $1 AND is_deleted = FALSE RETURNING *`, vals);
  if (!r.rowCount) throw fail('Tema bulunamadı.', 404);
  if (b.active === false || b.priceCoins !== undefined) await expireThemes(); // kullanılamaz hale gelen odalar varsayılana döner
  res.json({ ok: true, theme: themeView(r.rows[0], null, { admin: true }) });
});

// Sil: katalogdan kalkar, açılışta yeniden eklenmez; kullanan odalar varsayılana döner.
adminRouter.delete('/:key', async (req, res) => {
  const key = text(req.params.key, 'Tema', { required: true, max: 20 });
  if (key === DEFAULT_KEY) throw fail('Varsayılan tema silinemez.');
  const r = await query(`UPDATE room_themes SET is_deleted = TRUE, is_active = FALSE, updated_at = NOW() WHERE key = $1 AND is_deleted = FALSE`, [key]);
  if (!r.rowCount) throw fail('Tema bulunamadı.', 404);
  const reset = await expireThemes();
  res.json({ ok: true, roomsReset: reset });
});

// Ödül: katalog teması hediye et (süre verilmezse temanın kendi süresi).
adminRouter.post('/gift', async (req, res) => {
  const userId = uuid(req.body?.userId, 'Kullanıcı');
  const key = text(req.body?.key, 'Tema', { required: true, max: 20 });
  const days = req.body?.days === undefined ? undefined : positiveInt(req.body.days, 'Gün', 365);
  const r = await tx((c) => giftTheme(c, { adminId: req.user.id, userId, key, days }));
  notifyUser(userId, 'room_theme', 'Tema hediyesi', `"${r.theme.label}" oda teması ${r.days} gün süreyle hesabınıza eklendi.`, { screen: 'room_themes' });
  res.json({ ok: true, ...r });
});

// Ödül: özel tema hakkı (kullanıcı kendi görselini yükler, onaydan sonra [days] gün kullanır).
adminRouter.post('/custom/grant', async (req, res) => {
  const userId = uuid(req.body?.userId, 'Kullanıcı');
  const days = positiveInt(req.body?.days ?? 7, 'Gün', 365);
  const custom = await tx((c) => grantCustom(c, { adminId: req.user.id, userId, days }));
  notifyUser(userId, 'room_theme', 'Özel tema hakkı kazandınız', `Kendi oda temanızı yükleyin; onaydan sonra ${days} gün kullanabilirsiniz. Oda > Tema > Müsait.`, { screen: 'room_themes' });
  res.json({ ok: true, custom });
});

adminRouter.get('/custom', async (req, res) => {
  const status = ['pending', 'approved', 'rejected', 'granted'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = (await query(
    `SELECT c.*, u.username FROM custom_room_themes c JOIN users u ON u.id = c.user_id
      WHERE c.status = $1 ORDER BY c.created_at ${status === 'pending' ? 'ASC' : 'DESC'} LIMIT 100`, [status],
  )).rows;
  res.json({ items: rows.map(customView) });
});

adminRouter.post('/custom/:id/approve', async (req, res) => {
  const id = uuid(req.params.id, 'Talep');
  const custom = await tx((c) => approveCustom(c, { adminId: req.user.id, id }));
  notifyCustom({ ...custom, user_id: (await query(`SELECT user_id FROM custom_room_themes WHERE id = $1`, [id])).rows[0].user_id }, true);
  res.json({ ok: true, custom });
});

adminRouter.post('/custom/:id/reject', async (req, res) => {
  const id = uuid(req.params.id, 'Talep');
  const note = text(req.body?.note ?? '', 'Not', { max: 200 });
  const custom = await tx((c) => rejectCustom(c, { adminId: req.user.id, id, note }));
  notifyCustom({ ...custom, user_id: (await query(`SELECT user_id FROM custom_room_themes WHERE id = $1`, [id])).rows[0].user_id }, false);
  res.json({ ok: true, custom });
});
