import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { getConfig } from '../system/app_config.service.js';
import { limitsFrom, optimize } from './media_optimize.service.js';
import { ffmpegAvailable } from './media_tools.service.js';
import { forgetMedia } from './images.service.js';

// Medya bütçesi (veritabanı tarafı): hangi dosyalar nerede kullanılıyor, hangisi sınırı aşıyor, küçültüp adresleri yeni
// dosyaya çevirme, geri alma ve yedek temizliği. Orijinal dosya silinmez: yedek olarak kalır, "Yedekleri temizle" ile silinir.
//
// Küçültülen dosya YENİ bir kimlikle kaydedilir (adres değişir). Böylece telefonlarda önbelleğe alınmış ağır dosya yerine
// yeni, hafif dosya indirilir. Eski adres yedek olarak çalışmaya devam eder (güncellenmemiş uygulamalar bozulmaz).

const REFS_SQL = `
  SELECT 'gifts' AS tbl, 'animation_url' AS col, id, name, animation_url AS url,
         CASE WHEN play_mode = 'seat' THEN 'small' ELSE 'gift' END AS cls, budget_exempt AS exempt
    FROM gifts WHERE animation_url LIKE '/media/%'
  UNION ALL SELECT 'gifts', 'icon_url', id, name, icon_url, 'icon', budget_exempt FROM gifts WHERE icon_url LIKE '/media/%'
  UNION ALL SELECT 'frames', 'image_url', id, name, image_url, 'small', FALSE FROM frames WHERE image_url LIKE '/media/%'
  UNION ALL SELECT 'entrance_effects', 'animation_url', id, name, animation_url, 'gift', FALSE FROM entrance_effects WHERE animation_url LIKE '/media/%'
  UNION ALL SELECT 'store_items', 'image_url', id, name, image_url,
         CASE WHEN category IN ('entrance_effect', 'vehicle') THEN 'gift' ELSE 'small' END, FALSE FROM store_items WHERE image_url LIKE '/media/%'`;
// Adresleri değiştirilen sütunlar (sabit liste; kullanıcı girdisi SQL'e karışmaz).
const COLS = [['gifts', 'animation_url'], ['gifts', 'icon_url'], ['frames', 'image_url'], ['entrance_effects', 'animation_url'], ['store_items', 'image_url']];
const URL_RE = /^\/media\/([0-9a-f-]{36})(?:\.s\d{3})?\.([a-z0-9]{2,5})$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(['mp4', 'svga', 'json', 'png', 'jpg', 'webp', 'gif']);
const RANK = { icon: 0, small: 1, gift: 2 };

let busy = false;

async function collect(hash) {
  const refs = (await query(REFS_SQL)).rows;
  const byId = new Map();
  for (const r of refs) {
    const m = URL_RE.exec(r.url);
    if (!m) continue;
    const e = byId.get(m[1]) ?? { id: m[1], ext: m[2].toLowerCase(), refs: [], cls: 'icon', exempt: false };
    e.refs.push({ tbl: r.tbl, col: r.col, id: r.id, name: r.name });
    if (RANK[r.cls] > RANK[e.cls]) e.cls = r.cls; // aynı dosya birden çok yerde: en geniş kullanım sayılır
    e.exempt = e.exempt || r.exempt === true;
    byId.set(m[1], e);
  }
  const rows = byId.size
    ? (await query(`SELECT id, kind, ext, size_bytes, meta FROM media_files WHERE id = ANY($1::uuid[])`, [[...byId.keys()]])).rows
    : [];
  const items = [];
  for (const row of rows) {
    const e = byId.get(row.id);
    const kind = KINDS.has(row.ext) ? row.ext : KINDS.has(row.kind) ? row.kind : null;
    const b = row.meta?.budget ?? null;
    let state = 'unchecked';
    if (!kind) state = 'unsupported';
    else if (e.exempt) state = 'exempt';
    else if (b && b.hash === hash) state = b.over?.length ? 'over' : 'ok';
    items.push({
      id: row.id, kind, cls: e.cls, bytes: row.size_bytes, state,
      names: [...new Set(e.refs.map((x) => x.name))].slice(0, 3),
      uses: [...new Set(e.refs.map((x) => `${x.tbl}.${x.col}`))],
      over: b?.over ?? [], note: b?.note ?? null, manual: !!b?.manual, failed: !!b?.failed,
      w: b?.w ?? null, h: b?.h ?? null, fps: b?.fps ?? null, decodedMb: b?.decoded ? Math.round(b.decoded / 1048576) : null,
      from: b?.from ?? null, beforeBytes: b?.beforeBytes ?? null, kept: !!b?.kept,
    });
  }
  return items;
}

export async function status() {
  const cfg = await getConfig();
  const L = limitsFrom(cfg);
  const items = await collect(L.hash);
  const count = (s) => items.filter((x) => x.state === s).length;
  const saved = items.reduce((t, x) => t + (x.from && x.beforeBytes ? Math.max(0, x.beforeBytes - x.bytes) : 0), 0);
  const bk = (await query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(size_bytes), 0)::bigint AS b FROM media_files WHERE meta ? 'supersededBy'`)).rows[0];
  const gifts = (await query(`SELECT id, name, budget_exempt AS exempt FROM gifts WHERE animation_url IS NOT NULL ORDER BY coin_price DESC, name`)).rows;
  return {
    hash: L.hash, ffmpeg: await ffmpegAvailable(),
    summary: {
      files: items.length, ok: count('ok'), over: count('over'), unchecked: count('unchecked'), exempt: count('exempt'),
      totalBytes: items.reduce((t, x) => t + x.bytes, 0), savedBytes: saved, backupFiles: bk.n, backupBytes: Number(bk.b),
    },
    items: items.sort((a, b) => b.bytes - a.bytes).slice(0, 400),
    gifts,
  };
}

function budgetMeta(r, L, extra = {}) {
  const a = r.after;
  return { hash: L.hash, over: a.over, note: r.note, manual: !!r.manual, failed: !!r.failed, w: a.w ?? null, h: a.h ?? null, fps: a.fps ?? null, decoded: a.decoded ?? null, checkedAt: new Date().toISOString(), ...extra };
}

async function swapRefs(c, oldId, newId) {
  for (const [t, col] of COLS) {
    await c.query(`UPDATE ${t} SET ${col} = replace(${col}, $1, $2) WHERE ${col} LIKE $3`, [oldId, newId, `/media/${oldId}.%`]);
  }
}

/** Tek dosyayı denetler; sınırı aşıyorsa küçültüp adresleri yeni dosyaya çevirir. */
async function process(item, L, adminId) {
  const row = (await query(`SELECT id, kind, mime, ext, size_bytes, data, meta, created_by FROM media_files WHERE id = $1`, [item.id])).rows[0];
  if (!row) return { id: item.id, note: 'Dosya bulunamadı.', changed: false };
  const r = await optimize(row.data, item.kind, item.cls, L);
  if (!r.changed) {
    await query(`UPDATE media_files SET meta = meta || jsonb_build_object('budget', $2::jsonb) WHERE id = $1`, [row.id, JSON.stringify(budgetMeta(r, L))]);
    return { id: row.id, names: item.names, changed: false, note: r.note, over: r.after.over };
  }
  const meta = { ...(row.meta ?? {}) };
  delete meta.budget;
  const newId = await tx(async (c) => {
    // Aynı anda başka bir işlem dosyayı değiştirmiş olabilir: yedek işareti yoksa devam.
    const cur = (await c.query(`SELECT meta FROM media_files WHERE id = $1 FOR UPDATE`, [row.id])).rows[0];
    if (!cur || cur.meta?.supersededBy) return null;
    const ins = await c.query(
      `INSERT INTO media_files(kind, mime, ext, size_bytes, data, meta, created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [row.kind, row.mime, row.ext, r.buf.length, r.buf, JSON.stringify({ ...meta, budget: budgetMeta(r, L, { from: row.id, beforeBytes: row.size_bytes, by: adminId }) }), row.created_by],
    );
    const nid = ins.rows[0].id;
    await swapRefs(c, row.id, nid);
    await c.query(`UPDATE media_files SET meta = meta || jsonb_build_object('supersededBy', $2::text) WHERE id = $1`, [row.id, nid]);
    return nid;
  });
  if (!newId) return { id: row.id, changed: false, note: 'Dosya bu sırada başka bir işlemle değişti; atlandı.' };
  forgetMedia(row.id);
  return { id: row.id, newId, names: item.names, changed: true, note: r.note, beforeBytes: row.size_bytes, afterBytes: r.buf.length, over: r.after.over };
}

/** Sıradaki denetlenmemiş dosyayı işler (büyükten küçüğe). Uygulama "left" 0 olana kadar tekrar çağırır. */
export async function runNext(adminId) {
  if (busy) throw fail('Medya bütçesi zaten çalışıyor, biraz bekleyin.', 409);
  busy = true;
  try {
    const L = limitsFrom(await getConfig());
    const items = (await collect(L.hash)).filter((x) => x.state === 'unchecked').sort((a, b) => b.bytes - a.bytes);
    if (!items.length) return { done: true, left: 0, result: null };
    const result = await process(items[0], L, adminId);
    return { done: false, left: items.length - 1, result };
  } finally {
    busy = false;
  }
}

/** Tek dosyayı (denetlenmiş olsa bile) yeniden işler. */
export async function runOne(mediaId, adminId) {
  if (!UUID_RE.test(mediaId)) throw fail('Dosya kimliği geçersiz.');
  if (busy) throw fail('Medya bütçesi zaten çalışıyor, biraz bekleyin.', 409);
  busy = true;
  try {
    const L = limitsFrom(await getConfig());
    const item = (await collect(L.hash)).find((x) => x.id === mediaId);
    if (!item) throw fail('Bu dosya hiçbir hediye / çerçeve / efektte kullanılmıyor.', 404);
    if (!item.kind) throw fail('Bu dosya türü desteklenmiyor.');
    return await process(item, L, adminId);
  } finally {
    busy = false;
  }
}

/** Küçültülmüş dosyayı geri alır: adresler orijinal dosyaya döner (orijinal yedek olarak durduğu sürece). */
export async function revert(newId) {
  if (!UUID_RE.test(newId)) throw fail('Dosya kimliği geçersiz.');
  return tx(async (c) => {
    const cur = (await c.query(`SELECT meta FROM media_files WHERE id = $1 FOR UPDATE`, [newId])).rows[0];
    const from = cur?.meta?.budget?.from;
    if (!from) throw fail('Bu dosya küçültülmüş bir dosya değil.');
    const old = (await c.query(`SELECT id FROM media_files WHERE id = $1 FOR UPDATE`, [from])).rows[0];
    if (!old) throw fail('Orijinal yedek silinmiş; geri alınamaz.', 410);
    await swapRefs(c, newId, from);
    await c.query(`UPDATE media_files SET meta = (meta - 'supersededBy') || jsonb_build_object('budget', jsonb_build_object('hash', $2::text, 'over', '[]'::jsonb, 'kept', true, 'note', 'Elle geri alındı.')) WHERE id = $1`,
      [from, limitsFrom(await getConfig()).hash]);
    await c.query(`UPDATE media_files SET meta = jsonb_set(meta, '{budget,reverted}', 'true'::jsonb) WHERE id = $1`, [newId]);
    return { restored: from };
  });
}

export async function setExempt(giftId, exempt) {
  if (!UUID_RE.test(giftId)) throw fail('Hediye kimliği geçersiz.');
  const r = await query(`UPDATE gifts SET budget_exempt = $2 WHERE id = $1 RETURNING id`, [giftId, exempt === true]);
  if (!r.rowCount) throw fail('Hediye bulunamadı.', 404);
}

async function referencedIds(ids) {
  // Adres içeren tüm metin sütunlarına bakar (hediye dışında afiş, tema vb. de aynı dosyayı kullanıyor olabilir).
  const cols = (await query(
    `SELECT table_name AS t, column_name AS c FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('text', 'character varying') AND table_name <> 'media_files'`,
  )).rows.filter((x) => /^[a-z0-9_]+$/.test(x.t) && /^[a-z0-9_]+$/.test(x.c));
  const used = new Set();
  for (const { t, c } of cols) {
    const r = await query(`SELECT DISTINCT substring("${c}" from '/media/([0-9a-f-]{36})') AS id FROM "${t}" WHERE "${c}" LIKE '%/media/%' AND substring("${c}" from '/media/([0-9a-f-]{36})') = ANY($1::text[])`, [ids]);
    for (const x of r.rows) used.add(x.id);
  }
  return used;
}

/** Hiçbir yerde kullanılmayan yedekleri (ve geri alınan küçültmeleri) siler. */
export async function cleanup() {
  const rows = (await query(`SELECT id, size_bytes FROM media_files WHERE meta ? 'supersededBy' OR meta #>> '{budget,reverted}' = 'true'`)).rows;
  if (!rows.length) return { deleted: 0, freedBytes: 0 };
  const used = await referencedIds(rows.map((x) => x.id));
  const del = rows.filter((x) => !used.has(x.id));
  if (del.length) await query(`DELETE FROM media_files WHERE id = ANY($1::uuid[])`, [del.map((x) => x.id)]);
  for (const x of del) forgetMedia(x.id);
  return { deleted: del.length, freedBytes: del.reduce((t, x) => t + x.size_bytes, 0), kept: rows.length - del.length };
}

/** Yükleme sırasında: ayar açıksa dosyayı sınıra indirir. Döner: { buf, note, meta } (değişmediyse buf aynı). */
export async function fitOnUpload(buf, kind, cls) {
  const cfg = await getConfig();
  if (!cfg.mediaBudgetAuto) return { buf, note: null, meta: null };
  const L = limitsFrom(cfg);
  const r = await optimize(buf, kind, cls, L);
  const meta = { hash: L.hash, over: r.after.over, note: r.note, manual: !!r.manual, failed: !!r.failed, w: r.after.w ?? null, h: r.after.h ?? null, fps: r.after.fps ?? null, decoded: r.after.decoded ?? null, checkedAt: new Date().toISOString() };
  if (r.changed) return { buf: r.buf, note: `Boyut sınıra indirildi: ${r.note}`, meta };
  return { buf, note: r.manual || r.failed ? r.note : null, meta };
}
