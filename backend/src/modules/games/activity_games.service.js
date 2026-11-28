import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { readZip } from '../assets/asset_packs.service.js';

// Yönetimden zip ile yüklenen HTML oyunlar: zip güvenle açılır, dosyalar veritabanına yazılır, /games/<etkinlik>/v<N>/ altında
// sunulur. Her yükleme yeni sürüm numarası alır (eski sürümler silinir); bağlantı otomatik güncellenir.

const MIME = {
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8', xml: 'application/xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif', ico: 'image/x-icon',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', mp4: 'video/mp4', webm: 'video/webm',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm', map: 'application/json',
};
export const gameMime = (p) => MIME[String(p).split('.').pop().toLowerCase()] ?? null;

export const GAME_LIMITS = { files: 800, fileBytes: 15 * 1024 * 1024, totalBytes: 60 * 1024 * 1024 };

/** Zip içindeki yolu güvenli, göreli yola çevirir; geçersizse null. (../, mutlak yol, gizli dosya, macOS artıkları reddedilir.) */
export function cleanPath(name) {
  const p = String(name).replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\0')) return null;
  const parts = p.split('/');
  if (parts.some((x) => x === '..' || x === '.' || x === '')) return null;
  if (parts[0] === '__MACOSX' || parts.some((x) => x.startsWith('.'))) return null;
  return parts.join('/');
}

/** Zip içeriğini denetler ve [{path, mime, data}] döndürür. Tek üst klasör varsa soyulur. */
export function extractGame(buf) {
  let entries;
  try { entries = readZip(buf); } catch (e) { throw fail(`Zip okunamadı: ${e.message}`); }
  const cleaned = [];
  for (const [name, get] of entries) {
    const p = cleanPath(name);
    if (p) cleaned.push([p, get]);
  }
  if (!cleaned.length) throw fail('Zip içinde dosya yok.');
  if (cleaned.length > GAME_LIMITS.files) throw fail(`Zip en fazla ${GAME_LIMITS.files} dosya içerebilir.`);
  // Tek üst klasör ("oyun/index.html") soyulur.
  const first = cleaned[0][0].split('/')[0];
  const strip = cleaned.every(([p]) => p.includes('/') && p.split('/')[0] === first);
  const files = [];
  let total = 0;
  const seen = new Set();
  for (const [p0, get] of cleaned) {
    const p = strip ? p0.slice(first.length + 1) : p0;
    const mime = gameMime(p);
    if (!mime) continue; // izinli olmayan türler (ör. .php, .exe) sessizce atlanır
    if (seen.has(p)) continue;
    seen.add(p);
    let data;
    try { data = get(); } catch (e) { throw fail(`${p} açılamadı: ${e.message}`); }
    if (data.length > GAME_LIMITS.fileBytes) throw fail(`${p} çok büyük (en fazla 15 MB).`);
    total += data.length;
    if (total > GAME_LIMITS.totalBytes) throw fail('Oyun en fazla 60 MB olabilir.');
    files.push({ path: p, mime, data });
  }
  if (!files.some((f) => f.path === 'index.html')) throw fail('Zip içinde index.html yok (zipin kökünde ya da tek klasörde olmalı).');
  return { files, total };
}

/** Yüklü oyunun bağlantısı (oyuncuya özel bilgiler açılırken doldurulur). */
export function gameLink(activityId, version) {
  return `{base}/games/${activityId}/v${version}/index.html?uid={uid}&token={token}&name={name}&lang={lang}&roomId={roomId}`;
}

/** Oyunu yükler: yeni sürüm yazar, eskileri siler. Döner: { version, files, bytes }. */
export async function installGame(activityId, buf) {
  const { files, total } = extractGame(buf);
  return tx(async (c) => {
    const item = (await c.query(`SELECT id FROM activity_items WHERE id = $1 FOR UPDATE`, [activityId])).rows[0];
    if (!item) throw fail('Etkinlik bulunamadı.', 404);
    const cur = (await c.query(`SELECT version FROM activity_games WHERE activity_id = $1`, [activityId])).rows[0];
    const version = (cur?.version ?? 0) + 1;
    for (const f of files) {
      await c.query(`INSERT INTO activity_game_files(activity_id, version, path, mime, data) VALUES($1,$2,$3,$4,$5)`, [activityId, version, f.path, f.mime, f.data]);
    }
    await c.query(`DELETE FROM activity_game_files WHERE activity_id = $1 AND version <> $2`, [activityId, version]);
    await c.query(
      `INSERT INTO activity_games(activity_id, version, files, bytes) VALUES($1,$2,$3,$4)
       ON CONFLICT (activity_id) DO UPDATE SET version = $2, files = $3, bytes = $4, uploaded_at = NOW()`,
      [activityId, version, files.length, total],
    );
    // Bağlantı kendiliğinden yazılır: oyuncuya özel bilet ve bilgiler açılırken doldurulur ({base} = sunucu adresi).
    const link = gameLink(activityId, version);
    await c.query(`UPDATE activity_items SET link_url = $2, updated_at = NOW() WHERE id = $1`, [activityId, link]);
    memo.clear();
    return { version, files: files.length, bytes: total, link };
  });
}

export async function removeGame(activityId) {
  await tx(async (c) => {
    await c.query(`DELETE FROM activity_game_files WHERE activity_id = $1`, [activityId]);
    await c.query(`DELETE FROM activity_games WHERE activity_id = $1`, [activityId]);
    await c.query(`UPDATE activity_items SET link_url = '', updated_at = NOW() WHERE id = $1 AND link_url LIKE '{base}/games/%'`, [activityId]);
  });
  memo.clear();
}

// Küçük bellek önbelleği (sürüm adresi değişmez; yeni yükleme = yeni adres).
const memo = new Map();
const MEMO_MAX_BYTES = 40 * 1024 * 1024;
let memoBytes = 0;
export async function getGameFile(activityId, version, path) {
  const key = `${activityId}|${version}|${path}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const r = (await query(`SELECT mime, data FROM activity_game_files WHERE activity_id = $1 AND version = $2 AND path = $3`, [activityId, version, path])).rows[0];
  if (!r) return null;
  if (r.data.length < 2 * 1024 * 1024) {
    if (memoBytes + r.data.length > MEMO_MAX_BYTES) { memo.clear(); memoBytes = 0; }
    memo.set(key, r);
    memoBytes += r.data.length;
  }
  return r;
}

export const gameInfo = async (ids) => {
  if (!ids.length) return new Map();
  const r = await query(`SELECT activity_id, version, files, bytes, uploaded_at FROM activity_games WHERE activity_id = ANY($1::uuid[])`, [ids]);
  return new Map(r.rows.map((x) => [x.activity_id, { version: x.version, files: x.files, bytes: String(x.bytes), uploadedAt: x.uploaded_at }]));
};

/**
 * TRGame SDK: oyun sayfası bileti ve oyuncu bilgisini (ad, bakiye) adresten/uçtan alır.
 * Coin hareketi SDK'dan yapılamaz: istemci çarpanıyla çalışan eski tur çağrıları v2.131.0'da kaldırıldı (sonucu istemci
 * bildiriyordu); SDK'da artık bu adlarda yöntem yoktur.
 */
// SDK artık parçalara ayrıldı: modules/games/sdk/ (oturum, olaylar, köprü).
// Tek dizede yazılıyken hiçbir parçanın gerekçesi okunamıyor ve yeniden bağlanma gibi ince
// davranışlar sessizce yanlış yazılıyordu.
export { SDK_JS } from './sdk/trlive_game_sdk.js';

/** HTML sayfasına SDK'yı ekler (oyun geliştirirken ayrıca bir şey yapmak gerekmez). */
export function injectSdk(html) {
  const tag = '<script src="/games/_sdk.js"></script>';
  if (html.includes('/games/_sdk.js')) return html;
  const i = html.search(/<head[^>]*>/i);
  if (i >= 0) {
    const end = html.indexOf('>', i) + 1;
    return html.slice(0, end) + tag + html.slice(end);
  }
  return tag + html;
}
