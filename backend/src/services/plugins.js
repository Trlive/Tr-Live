// Oyun paketleri (eklenti): oyunların kodu bu depoda DEĞİLDİR. Süper admin panelden paket zip'i yükler; dosyalar
// veritabanında saklanır, sunucu açılışta paketin sunucu kodunu geçici klasöre çıkarıp çalıştırır.
// Paket düzeni:  plugin.json · server/** (motor) · client/** (/g/<id>/ altında sunulur) · db.sql (isteğe bağlı)
// plugin.json: { "id": "ornek", "name": "Örnek Oyun", "version": "1.0.0", "server": "server/index.mjs",
//               "activity": { "title", "subtitle", "icon", "openMode", "sortOrder", "query" }, "csp": "…{host}…" }
// Sunucu girişi:  export default async function init(ctx) { …; return { stop } }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express, { Router } from 'express';
import { WebSocketServer } from 'ws';
import { query, tx } from '../database.js';
import { requireAuth, requireSuperAdmin } from '../auth.js';
import { fail } from '../http.js';
import { userLimit } from '../firewall.js';
import { hub, registerWsRoute, unregisterWsRoute } from '../realtime.js';
import { readZip } from '../asset_packs.js';
import { cleanPath, gameMime } from './activity_games.js';
import { readGameTokenAny, canSeeActivities } from '../routes/activities.js';
import { CoinWallet } from './game_wallet.js';

const LIMITS = { files: 1500, totalBytes: 80 * 1024 * 1024 };
const ID_RE = /^[a-z][a-z0-9-]{1,30}$/;
const SERVER_EXT = /\.(mjs|cjs|js|json|sql|txt)$/i;
const ROOT = path.join(os.tmpdir(), 'trlive-plugins');
const DEFAULT_CSP = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' wss://{host} ws://{host}; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

const live = new Map(); // id → { manifest, client: Map, api, admin, stop, wss: [], error, dir }

// ---------------------------------------------------------------- Zip → paket
export function readPackage(buf) {
  let entries;
  try { entries = readZip(buf); } catch (e) { throw fail(`Zip okunamadı: ${e.message}`); }
  const cleaned = [];
  for (const [name, get] of entries) { const p = cleanPath(name); if (p) cleaned.push([p, get]); }
  if (!cleaned.length) throw fail('Zip içinde dosya yok.');
  if (cleaned.length > LIMITS.files) throw fail(`Paket en fazla ${LIMITS.files} dosya içerebilir.`);
  const first = cleaned[0][0].split('/')[0];
  const strip = !cleaned.some(([p]) => p === 'plugin.json') && cleaned.every(([p]) => p.includes('/') && p.split('/')[0] === first);
  const files = [];
  let total = 0;
  for (const [p0, get] of cleaned) {
    const p = strip ? p0.slice(first.length + 1) : p0;
    const ok = p === 'plugin.json' || p === 'db.sql' || (p.startsWith('server/') && SERVER_EXT.test(p)) || (p.startsWith('client/') && gameMime(p));
    if (!ok) continue;
    const data = get();
    total += data.length;
    if (total > LIMITS.totalBytes) throw fail('Paket en fazla 80 MB olabilir.');
    files.push({ path: p, data });
  }
  const mf = files.find((f) => f.path === 'plugin.json');
  if (!mf) throw fail('Paket geçersiz: plugin.json yok.');
  let manifest;
  try { manifest = JSON.parse(mf.data.toString('utf8')); } catch { throw fail('plugin.json okunamadı.'); }
  if (!ID_RE.test(String(manifest.id ?? ''))) throw fail('plugin.json: id küçük harf/rakam/tire olmalı (2-31 karakter).');
  if (!manifest.name) throw fail('plugin.json: name gerekli.');
  if (manifest.server && !files.some((f) => f.path === manifest.server)) throw fail(`Sunucu girişi bulunamadı: ${manifest.server}`);
  return { manifest, files, total };
}

// ---------------------------------------------------------------- Çalışma zamanı
const playerLink = (id) => `%/g/${id}/%`;
async function playerFromToken(id, token) {
  const t = readGameTokenAny(token);
  if (!t) return null;
  const item = (await query(`SELECT id FROM activity_items WHERE id = $1 AND enabled AND link_url LIKE $2`, [t.activityId, playerLink(id)])).rows[0];
  if (!item || !(await canSeeActivities(t.userId))) return null;
  return t;
}

async function stopLive(id) {
  const p = live.get(id);
  if (!p) return;
  live.delete(id);
  try { await p.stop?.(); } catch (e) { console.error(`[eklenti ${id}] durdurma hatası:`, e.message); }
  for (const w of p.wss) { unregisterWsRoute(`/ws/g/${id}`, w); for (const c of w.clients) c.terminate(); w.close(); }
  if (p.dir) fs.rm(p.dir, { recursive: true, force: true }, () => {});
}

async function startOne(id) {
  await stopLive(id);
  const row = (await query(`SELECT * FROM game_plugins WHERE id = $1`, [id])).rows[0];
  if (!row) return null;
  const files = (await query(`SELECT path, data FROM game_plugin_files WHERE plugin_id = $1`, [id])).rows;
  const manifest = row.manifest;
  const p = { manifest, client: new Map(), api: Router(), admin: Router(), wss: [], stop: null, error: null, dir: null, enabled: row.enabled };
  for (const f of files) if (f.path.startsWith('client/')) p.client.set(f.path.slice(7), f.data);
  live.set(id, p);
  if (!row.enabled || !manifest.server) return p;
  try {
    const dir = path.join(ROOT, `${id}-${Date.now()}`);
    for (const f of files) {
      if (!f.path.startsWith('server/')) continue;
      const out = path.join(dir, f.path);
      if (!out.startsWith(dir + path.sep)) continue;
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, f.data);
    }
    p.dir = dir;
    const mod = await import(pathToFileURL(path.join(dir, manifest.server)).href);
    const init = mod.default ?? mod.init;
    if (typeof init !== 'function') throw new Error('Sunucu girişi bir init fonksiyonu dışa aktarmıyor.');
    const ctx = {
      id, manifest, Router, WebSocketServer, express, query, tx, fail, hub, userLimit,
      log: (...a) => console.error(`[${id}]`, ...a),
      wallet: (name = manifest.name, game = id) => new CoinWallet(name, game),
      kv: {
        get: async (key) => (await query(`SELECT value FROM game_kv WHERE key = $1`, [key])).rows[0]?.value ?? null,
        set: (key, value) => query(`INSERT INTO game_kv(key, value, updated_at) VALUES($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`, [key, JSON.stringify(value)]),
      },
      api: p.api, // → /api/g/<id>/…
      admin: p.admin, // → /api/admin/plugins/<id>/panel/… (yalnızca süper admin)
      wsPath: `/ws/g/${id}`,
      ws(wss) { registerWsRoute(`/ws/g/${id}`, wss); p.wss.push(wss); },
      player: (token) => playerFromToken(id, token),
      async requirePlayer(req, _res, next) {
        const m = /^Bearer (.+)$/.exec(req.get('authorization') ?? '');
        const t = await playerFromToken(id, m ? m[1] : req.query?.token);
        if (!t) throw fail('Oyun bileti geçersiz ya da süresi doldu. Oyunu kapatıp yeniden açın.', 401);
        req.player = { userId: t.userId, activityId: t.activityId };
        next();
      },
    };
    const out = await init(ctx);
    p.stop = out?.stop ?? null;
  } catch (e) {
    p.error = e.message;
    console.error(`[eklenti ${id}] başlatılamadı:`, e.message);
  }
  return p;
}

export async function startPlugins() {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const rows = (await query(`SELECT id FROM game_plugins ORDER BY id`)).rows;
  for (const r of rows) await startOne(r.id);
  return { stop: async () => { for (const id of [...live.keys()]) await stopLive(id); } };
}

export async function installPackage(buf) {
  const { manifest, files, total } = readPackage(buf);
  const id = manifest.id;
  const sql = files.find((f) => f.path === 'db.sql')?.data.toString('utf8');
  await tx(async (c) => {
    if (sql?.trim()) await c.query(sql);
    await c.query(
      `INSERT INTO game_plugins(id, name, version, manifest, files, bytes) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET name = $2, version = $3, manifest = $4, files = $5, bytes = $6, installed_at = NOW()`,
      [id, String(manifest.name).slice(0, 80), String(manifest.version ?? '').slice(0, 30), JSON.stringify(manifest), files.length, total],
    );
    await c.query(`DELETE FROM game_plugin_files WHERE plugin_id = $1`, [id]);
    for (const f of files) await c.query(`INSERT INTO game_plugin_files(plugin_id, path, data) VALUES($1,$2,$3)`, [id, f.path, f.data]);
    // Etkinlik kartı: yoksa eklenir (başlık, simge, sıra ve izinler sonra panelden değiştirilebilir).
    const a = manifest.activity;
    if (a && files.some((f) => f.path === 'client/index.html')) {
      const has = (await c.query(`SELECT 1 FROM activity_items WHERE link_url LIKE $1`, [playerLink(id)])).rows[0];
      if (!has) {
        const q = typeof a.query === 'string' && /^[\w{}=&-]*$/.test(a.query) ? a.query : 'token={token}&lang={lang}';
        await c.query(
          `INSERT INTO activity_items(title, subtitle, icon, link_url, open_mode, sort_order) VALUES($1,$2,$3,$4,$5,$6)`,
          [String(a.title ?? manifest.name).slice(0, 60), String(a.subtitle ?? '').slice(0, 120), String(a.icon ?? '🎮').slice(0, 16),
            `{base}/g/${id}/?${q}`, ['sheet', 'full', 'browser'].includes(a.openMode) ? a.openMode : 'full', Number(a.sortOrder) || 0],
        );
      }
    }
  });
  const p = await startOne(id);
  return { id, name: manifest.name, version: manifest.version ?? '', files: files.length, bytes: total, error: p?.error ?? null };
}

export async function removePackage(id) {
  await stopLive(id);
  await query(`DELETE FROM activity_items WHERE link_url LIKE $1`, [playerLink(id)]);
  await query(`DELETE FROM game_plugins WHERE id = $1`, [id]);
}

// ---------------------------------------------------------------- Rotalar
/** /g/<id>/… : paketin istemci dosyaları. */
export const pluginClientRouter = Router();
pluginClientRouter.get(/^\/([a-z][a-z0-9-]{1,30})(?:\/(.*))?$/, (req, res, next) => {
  const id = req.params[0];
  const p = live.get(id);
  if (!p || !p.enabled) return next();
  if (req.params[1] === undefined) return res.redirect(301, `/g/${id}/${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
  const rel = cleanPath(req.params[1] || 'index.html') ?? '';
  const data = p.client.get(rel || 'index.html');
  const mime = gameMime(rel || 'index.html');
  if (!data || !mime) return res.status(404).end();
  const host = (req.get('host') ?? '').replace(/[^\w.:-]/g, '');
  res.set({
    'Content-Security-Policy': String(p.manifest.csp || DEFAULT_CSP).replaceAll('{host}', host),
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache',
  });
  res.type(mime).send(data);
});

/** /api/g/<id>/… : paketin oyuncu API'si. */
export const pluginApiRouter = Router();
pluginApiRouter.use('/:id', (req, res, next) => {
  const p = live.get(req.params.id);
  if (!p || !p.enabled || p.error) return next(fail('Bu oyun şu an kapalı.', 404));
  return p.api(req, res, next);
});

/** /api/admin/plugins : paket listesi, yükleme, aç/kapa, silme ve paketin kendi yönetim API'si (/:id/panel/…). */
export const pluginAdminRouter = Router();
pluginAdminRouter.use(requireAuth, requireSuperAdmin);
pluginAdminRouter.get('/', async (_req, res) => {
  const rows = (await query(`SELECT id, name, version, enabled, files, bytes, installed_at, manifest FROM game_plugins ORDER BY name`)).rows;
  res.json({
    items: rows.map((r) => ({
      id: r.id, name: r.name, version: r.version, enabled: r.enabled, files: r.files, bytes: String(r.bytes), installedAt: r.installed_at,
      hasPanel: !!r.manifest?.panel, running: !!live.get(r.id) && !live.get(r.id).error && r.enabled, error: live.get(r.id)?.error ?? null,
    })),
  });
});
pluginAdminRouter.post('/upload', express.raw({ type: () => true, limit: LIMITS.totalBytes }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw fail('Zip dosyası gönderilmedi.');
  res.json({ ok: true, ...(await installPackage(req.body)) });
});
pluginAdminRouter.patch('/:id', async (req, res) => {
  const id = String(req.params.id);
  const r = await query(`UPDATE game_plugins SET enabled = $2 WHERE id = $1 RETURNING id`, [id, req.body?.enabled === true]);
  if (!r.rows[0]) throw fail('Paket bulunamadı.', 404);
  const p = await startOne(id);
  res.json({ ok: true, error: p?.error ?? null });
});
pluginAdminRouter.post('/:id/restart', async (req, res) => {
  const p = await startOne(String(req.params.id));
  if (!p) throw fail('Paket bulunamadı.', 404);
  res.json({ ok: true, error: p.error });
});
pluginAdminRouter.delete('/:id', async (req, res) => {
  await removePackage(String(req.params.id));
  res.json({ ok: true });
});
pluginAdminRouter.use('/:id/panel', (req, res, next) => {
  const p = live.get(req.params.id);
  if (!p || p.error) return next(fail(p?.error ? `Paket çalışmıyor: ${p.error}` : 'Paket çalışmıyor.', 409));
  return p.admin(req, res, next);
});
export const _live = live; // yalnızca testler için
