import crypto from 'node:crypto';
import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { validateLayout } from './sdui.schema.js';
import { getConfig } from '../system/app_config.service.js';
import { allowlistOf, hostAllowed } from '../system/webview_policy.service.js';

/// SDUI düzenlerinin saklanması, sürümlenmesi ve geri alınması.

const TTL_MS = 30_000;
const cache = new Map();

/// Sürüm = düzenin özeti. Zamana ya da sayaca bağlı olsaydı, içerik değişmeden sürüm değişir ve
/// bütün telefonlar boşuna yeniden indirirdi. Özet sayesinde aynı içerik her zaman aynı sürüm.
const versionOf = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);

/** Uygulamaya giden düzen. Kapalıysa null — uygulama kendi yerleşik düzenini çizer. */
export async function layoutFor(screen) {
  const hit = cache.get(screen);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const r = await query(`SELECT version, payload, enabled FROM sdui_layouts WHERE screen = $1`, [screen]);
  const row = r.rows[0];
  const value = row && row.enabled ? { version: row.version, ...row.payload } : null;
  cache.set(screen, { at: Date.now(), value });
  return value;
}

export function invalidate(screen) {
  if (screen) cache.delete(screen); else cache.clear();
}

/** Panelin gördüğü hâl: kapalı olsa da içerik döner. */
export async function adminLayout(screen) {
  const r = await query(
    `SELECT l.screen, l.version, l.payload, l.enabled, l.updated_at, u.display_name AS updated_by_name
       FROM sdui_layouts l LEFT JOIN users u ON u.id = l.updated_by WHERE l.screen = $1`, [screen],
  );
  return r.rows[0] ?? null;
}

/// Adreslerin WebView izin listesine uyduğunu kaydetme anında denetler.
///
/// Uygulama da aynı denetimi yapıyor. İki taraflı olması bilinçli: yönetici hiç kaydedemezse
/// hata panelde, anlaşılır bir mesajla görünür; sadece uygulamada engellenseydi düzen sessizce
/// çalışmaz, sebebi aranırdı.
async function assertUrlsAllowed(layout) {
  const list = allowlistOf(await getConfig());
  if (!list.length) return;
  const urls = [];
  const walk = (a) => { if (a && a.type === 'openUrl' && a.url) urls.push(a.url); };
  for (const s of layout.sections) {
    walk(s.action);
    for (const it of s.items ?? []) walk(it.action);
  }
  for (const u of urls) {
    if (!hostAllowed(u, list)) {
      throw fail(`Bu adres WebView izin listesinde yok: ${new URL(u).hostname}. Ayarlar → WebView güvenliği.`);
    }
  }
}

/**
 * Düzeni kaydeder. Her kayıt geçmişe de yazılır: yanlış bir düzen yayınlandığında tek tıkla
 * eski sürüme dönülür.
 *
 * Geri dönüş yolu olmayan bir uzaktan arayüz sistemi, uygulamayı kullanılamaz hale getirme
 * yetkisini sunucuya vermek demektir.
 */
export async function saveLayout(screen, payload, { adminId, enabled, note } = {}) {
  const layout = validateLayout(screen, payload);
  await assertUrlsAllowed(layout);
  const version = versionOf(layout);
  const row = await tx(async (c) => {
    const prev = (await c.query(`SELECT version, payload FROM sdui_layouts WHERE screen = $1 FOR UPDATE`, [screen])).rows[0];
    // Önceki sürüm geçmişe yazılır (yenisi değil): geri alma, "bir öncekine dön" demektir.
    if (prev && prev.version !== version) {
      await c.query(
        `INSERT INTO sdui_layout_history(screen, version, payload, note, created_by) VALUES($1,$2,$3,$4,$5)`,
        [screen, prev.version, prev.payload, String(note ?? '').slice(0, 200), adminId ?? null],
      );
    }
    const r = await c.query(
      `INSERT INTO sdui_layouts(screen, version, payload, enabled, updated_by, updated_at)
       VALUES($1,$2,$3,COALESCE($4, false),$5, NOW())
       ON CONFLICT (screen) DO UPDATE
         SET version = EXCLUDED.version, payload = EXCLUDED.payload,
             enabled = COALESCE($4, sdui_layouts.enabled),
             updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING screen, version, payload, enabled, updated_at`,
      [screen, version, JSON.stringify(layout), enabled === undefined ? null : enabled === true, adminId ?? null],
    );
    return r.rows[0];
  });
  invalidate(screen);
  return row;
}

/** Yalnızca açma/kapama — içeriğe dokunmaz. Sorun anında en hızlı düğme. */
export async function setEnabled(screen, enabled, adminId) {
  const r = await query(
    `UPDATE sdui_layouts SET enabled = $2, updated_by = $3, updated_at = NOW() WHERE screen = $1
     RETURNING screen, version, enabled`,
    [screen, enabled === true, adminId ?? null],
  );
  if (!r.rowCount) throw fail('Ekran bulunamadı.', 404);
  invalidate(screen);
  return r.rows[0];
}

export async function history(screen, limit = 20) {
  const r = await query(
    `SELECT h.id, h.version, h.note, h.created_at, u.display_name AS by_name
       FROM sdui_layout_history h LEFT JOIN users u ON u.id = h.created_by
      WHERE h.screen = $1 ORDER BY h.id DESC LIMIT $2`,
    [screen, Math.max(1, Math.min(100, limit))],
  );
  return r.rows;
}

/** Geçmişteki bir sürüme döner. Dönülen sürüm yeniden kaydedilir (geçmiş silinmez). */
export async function rollback(screen, historyId, adminId) {
  const h = (await query(`SELECT payload FROM sdui_layout_history WHERE id = $1 AND screen = $2`, [historyId, screen])).rows[0];
  if (!h) throw fail('Bu sürüm bulunamadı.', 404);
  return saveLayout(screen, h.payload, { adminId, note: `geri alma #${historyId}` });
}
