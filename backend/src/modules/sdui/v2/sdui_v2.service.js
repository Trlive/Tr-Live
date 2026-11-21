// SDUI v2 ekranlarının saklanması, yayınlanması, süzülmesi ve geri alınması.
//
// Uygulamaya giden ağaç, istek sahibinin uygulama sürümüne ve kademeli açılış dilimine göre
// SÜZÜLEREK gönderilir. Süzme sunucuda yapılır, çünkü:
//   · Eski bir APK'ya çizemeyeceği bir düğüm hiç gitmemeli (boş kutu, kayık yerleşim yerine
//     hiç olmasın). Uygulama ayrıca tanımadığını atlar; iki kat koruma bilerek.
//   · Kademeli açılış kullanıcı kimliğinden türetilir, RASTGELE DEĞİL. Rastgele olsaydı aynı
//     kullanıcı her açılışta farklı ekran görür, "bende öyle değildi" şikâyeti doğardı.
import crypto from 'node:crypto';
import { query, tx } from '../../../infrastructure/database/database.js';
import { fail } from '../../../shared/errors/http.js';
import { flagsOf, urlsOf, validateScreen } from './sdui_v2.schema.js';
import { bucketOf, flagsFor } from '../../system/feature_flags.service.js';
import { getConfig } from '../../system/app_config.service.js';
import { allowlistOf, hostAllowed } from '../../system/webview_policy.service.js';
import { log } from '../../../infrastructure/observability/log.js';

const TTL_MS = 30_000;
const cache = new Map();

export const revisionOf = (payload) => crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);

const verNum = (v) => String(v || '0.0.0').split('.').map((x) => Number.parseInt(x, 10) || 0);
/** have >= want ? */
export function versionAtLeast(have, want) {
  if (!want) return true;
  const a = verNum(have); const b = verNum(want);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0; const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return true;
}

export function invalidate(screenId) {
  if (screenId) cache.delete(screenId); else cache.clear();
}

/**
 * Ağacı istek sahibine göre süzer.
 *
 * Düşen bir düğümün ÇOCUKLARI da düşer: yarısı eksik bir kart, hiç olmayan karttan kötüdür.
 * Boşalan yerleşim kapları (column/row) olduğu gibi bırakılır — boş bir sütun görünmez,
 * ama onu da atsaydık kardeşlerinin aralığı kayardı.
 */
function filterTree(node, { appVersion, flags }) {
  if (node.minApp && !versionAtLeast(appVersion, node.minApp)) return null;
  if (node.flag && flags[node.flag] !== true) return null;
  const out = { ...node };
  delete out.minApp;
  delete out.flag;
  if (Array.isArray(node.children)) {
    out.children = node.children.map((c) => filterTree(c, { appVersion, flags })).filter(Boolean);
  }
  return out;
}

async function rowOf(screenId) {
  const hit = cache.get(screenId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.row;
  const r = await query(
    `SELECT screen_id, published, revision, rollout, min_app FROM sdui_screens WHERE screen_id = $1`,
    [screenId],
  );
  const row = r.rows[0] ?? null;
  cache.set(screenId, { at: Date.now(), row });
  return row;
}

/**
 * Uygulamaya giden ekran. null dönerse uygulama KENDİ yerleşik ekranını çizer.
 *
 * null dönmesinin üç meşru sebebi var ve üçü de sessizdir (hata değil):
 * yayın yok · uygulama sürümü yetmiyor · kullanıcı kademeli açılış diliminde değil.
 */
export async function screenFor(screenId, { userId = null, appVersion = '0.0.0', platform = null } = {}) {
  const row = await rowOf(screenId);
  if (!row || !row.published) return null;
  if (!versionAtLeast(appVersion, row.min_app)) return null;
  if (row.rollout <= 0) return null;
  // Oturumsuz kullanıcı için kimlik yoksa kademeli açılış uygulanamaz: ya herkese ya kimseye.
  if (row.rollout < 100) {
    if (!userId) return null;
    if (bucketOf(userId, `sdui:${screenId}`) >= row.rollout) return null;
  }
  const flags = await flagsFor({ userId, appVersion, platform });
  const root = filterTree(row.published.root, { appVersion, flags });
  if (!root) return null;
  return { schemaVersion: 2, screenId, revision: row.revision, root };
}

/// Adreslerin WebView izin listesine uyduğunu KAYDETME anında denetler.
///
/// Uygulama da aynı denetimi yapıyor. İki taraflı olması bilinçli: yönetici hiç kaydedemezse
/// hata panelde anlaşılır bir mesajla görünür; yalnızca uygulamada engellenseydi ekran
/// sessizce çalışmaz, sebebi aranırdı.
async function assertUrlsAllowed(root) {
  const list = allowlistOf(await getConfig());
  if (!list.length) return;
  for (const url of urlsOf(root)) {
    let host = '';
    try { host = new URL(url).hostname; } catch { throw fail(`Adres okunamadı: ${url}`); }
    if (!hostAllowed(host, list)) throw fail(`Bu alan adı izin listesinde yok: ${host}`);
  }
}

/** Panelin gördüğü hâl: taslak ve yayın birlikte. */
export async function adminScreen(screenId) {
  const r = await query(
    `SELECT s.screen_id, s.draft, s.draft_updated_at, s.published, s.revision, s.published_at,
            s.rollout, s.min_app, s.note,
            d.display_name AS draft_by, p.display_name AS published_by
       FROM sdui_screens s
       LEFT JOIN users d ON d.id = s.draft_updated_by
       LEFT JOIN users p ON p.id = s.published_by
      WHERE s.screen_id = $1`,
    [screenId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    screenId: row.screen_id,
    draft: row.draft,
    draftUpdatedAt: row.draft_updated_at,
    draftBy: row.draft_by,
    published: row.published,
    revision: row.revision,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    rollout: row.rollout,
    minApp: row.min_app,
    note: row.note,
    // Taslak ile yayın arasında fark var mı — panelde "yayınlanmamış değişiklik" uyarısı için.
    dirty: !row.published || revisionOf(row.draft) !== row.revision,
    flags: flagsOf(row.draft?.root ?? { type: 'column' }),
  };
}

export async function listScreens() {
  const r = await query(
    `SELECT screen_id, revision, published IS NOT NULL AS live, rollout, min_app,
            published_at, draft_updated_at, draft, note
       FROM sdui_screens ORDER BY screen_id`,
  );
  return r.rows.map((x) => ({
    screenId: x.screen_id,
    live: x.live,
    revision: x.revision,
    rollout: x.rollout,
    minApp: x.min_app,
    publishedAt: x.published_at,
    draftUpdatedAt: x.draft_updated_at,
    dirty: !x.live || revisionOf(x.draft) !== x.revision,
    note: x.note,
  }));
}

/** Taslağı kaydeder. Kullanıcılar ETKİLENMEZ — yayın ayrı bir adım. */
export async function saveDraft(screenId, payload, adminId) {
  const clean = validateScreen(screenId, payload);
  await assertUrlsAllowed(clean.root);
  const r = await query(
    `UPDATE sdui_screens SET draft = $2::jsonb, draft_updated_at = NOW(), draft_updated_by = $3
      WHERE screen_id = $1 RETURNING screen_id`,
    [screenId, JSON.stringify(clean), adminId],
  );
  if (!r.rows[0]) throw fail('Ekran bulunamadı.', 404);
  return { ok: true, revision: revisionOf(clean) };
}

/**
 * Taslağı yayınlar.
 *
 * Kademeli açılış varsayılanı %1: yayınla düğmesine basmak "herkese ver" demek olmamalı.
 * Yüzde panelden artırılır, sorun çıkarsa `rollback` ya da yüzdeyi 0'a çekmek saniyeler sürer.
 */
export async function publish(screenId, { rollout = 1, minApp = null, note = '' } = {}, adminId) {
  const pct = Math.min(Math.max(Number(rollout) || 0, 0), 100);
  const out = await tx(async (c) => {
    const cur = (await c.query(`SELECT draft, min_app FROM sdui_screens WHERE screen_id = $1 FOR UPDATE`, [screenId])).rows[0];
    if (!cur) throw fail('Ekran bulunamadı.', 404);
    const clean = validateScreen(screenId, cur.draft);
    const rev = revisionOf(clean);
    const min = minApp ?? cur.min_app;
    if (!/^\d+\.\d+\.\d+$/.test(min)) throw fail('En düşük sürüm 1.2.3 biçiminde olmalı.');
    await c.query(
      `UPDATE sdui_screens SET published = $2::jsonb, revision = $3, published_at = NOW(),
              published_by = $4, rollout = $5, min_app = $6, note = $7
        WHERE screen_id = $1`,
      [screenId, JSON.stringify(clean), rev, adminId, pct, min, String(note).slice(0, 200)],
    );
    await c.query(
      `INSERT INTO sdui_screen_versions(screen_id, revision, payload, rollout, min_app, note, created_by)
       VALUES($1,$2,$3::jsonb,$4,$5,$6,$7)`,
      [screenId, rev, JSON.stringify(clean), pct, min, String(note).slice(0, 200), adminId],
    );
    return { revision: rev, rollout: pct, minApp: min };
  });
  invalidate(screenId);
  log.warn('sdui_published', { screen: screenId, ...out, adminId });
  return out;
}

/** Kademeli açılış yüzdesini değiştirir. Acil durumda 0 = anında kapat. */
export async function setRollout(screenId, rollout, adminId) {
  const pct = Math.min(Math.max(Number(rollout) || 0, 0), 100);
  const r = await query(`UPDATE sdui_screens SET rollout = $2 WHERE screen_id = $1 RETURNING screen_id`, [screenId, pct]);
  if (!r.rows[0]) throw fail('Ekran bulunamadı.', 404);
  invalidate(screenId);
  log.warn('sdui_rollout_changed', { screen: screenId, rollout: pct, adminId });
  return { ok: true, rollout: pct };
}

export async function history(screenId, limit = 30) {
  const r = await query(
    `SELECT v.id, v.revision, v.rollout, v.min_app, v.note, v.created_at, u.display_name AS created_by
       FROM sdui_screen_versions v LEFT JOIN users u ON u.id = v.created_by
      WHERE v.screen_id = $1 ORDER BY v.id DESC LIMIT $2`,
    [screenId, Math.min(Math.max(limit, 1), 100)],
  );
  return r.rows.map((x) => ({
    id: String(x.id), revision: x.revision, rollout: x.rollout, minApp: x.min_app,
    note: x.note, createdAt: x.created_at, createdBy: x.created_by,
  }));
}

/**
 * Eski bir sürüme döner.
 *
 * Geri alma TASLAĞI DA eski sürümle değiştirir. Yoksa panelde hâlâ bozuk taslak durur ve bir
 * sonraki "yayınla" aynı hatayı geri getirir — geri almanın en sık görülen tuzağı budur.
 */
export async function rollback(screenId, versionId, adminId) {
  const out = await tx(async (c) => {
    const v = (await c.query(
      `SELECT revision, payload, rollout, min_app FROM sdui_screen_versions WHERE id = $1 AND screen_id = $2`,
      [versionId, screenId],
    )).rows[0];
    if (!v) throw fail('Sürüm bulunamadı.', 404);
    await c.query(
      `UPDATE sdui_screens SET published = $2::jsonb, draft = $2::jsonb, revision = $3,
              published_at = NOW(), published_by = $4, rollout = $5, min_app = $6,
              draft_updated_at = NOW(), draft_updated_by = $4, note = $7
        WHERE screen_id = $1`,
      [screenId, JSON.stringify(v.payload), v.revision, adminId, v.rollout, v.min_app, `geri alındı: ${v.revision}`],
    );
    await c.query(
      `INSERT INTO sdui_screen_versions(screen_id, revision, payload, rollout, min_app, note, created_by)
       VALUES($1,$2,$3::jsonb,$4,$5,$6,$7)`,
      [screenId, v.revision, JSON.stringify(v.payload), v.rollout, v.min_app, 'geri alma', adminId],
    );
    return { revision: v.revision, rollout: v.rollout };
  });
  invalidate(screenId);
  log.warn('sdui_rolled_back', { screen: screenId, versionId, adminId });
  return out;
}

/** Önizleme: yayın durumuna bakmadan taslağı verilen sürüme göre süzer. */
export async function previewDraft(screenId, { appVersion = '999.0.0', userId = null, platform = null } = {}) {
  const r = await query(`SELECT draft FROM sdui_screens WHERE screen_id = $1`, [screenId]);
  const row = r.rows[0];
  if (!row) throw fail('Ekran bulunamadı.', 404);
  const clean = validateScreen(screenId, row.draft);
  const flags = await flagsFor({ userId, appVersion, platform });
  const root = filterTree(clean.root, { appVersion, flags });
  return { schemaVersion: 2, screenId, revision: revisionOf(clean), root: root ?? { type: 'column', children: [] } };
}
