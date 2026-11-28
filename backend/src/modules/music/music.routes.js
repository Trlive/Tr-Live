import { Router } from 'express';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { analyzeTrack } from './loudness.service.js';
import { query, tx } from '../../infrastructure/database/database.js';
import { requireAuth } from '../../middleware/authentication/auth.js';
import { fail, uuid } from '../../shared/errors/http.js';
import { userLimit } from '../../middleware/security/firewall.js';
import { clampPosition, positionAt, queueDecision, MUSIC_MANAGERS } from './music.rules.js';
import { musicState, broadcastMusic, advanceQueue } from './music.service.js';

export const router = Router();
router.use(requireAuth);

const trackJson = (t) => ({ id: t.id, title: t.title, artist: t.artist, url: t.url, coverUrl: t.cover_url, durationMs: t.duration_ms, gainDb: t.gain_db ?? null });
const ELAPSED = `(EXTRACT(EPOCH FROM (NOW() - updated_at)) * 1000)::bigint`;

async function context(roomId, userId) {
  const room = (await query(`SELECT id FROM rooms WHERE id = $1 AND is_active = TRUE`, [roomId])).rows[0];
  if (!room) throw fail('Oda bulunamadı.', 404);
  const member = (await query(`SELECT role, microphone FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, userId])).rows[0];
  if (!member) throw fail('Önce odaya girin.', 403);
  return member;
}

async function managerContext(roomId, userId) {
  const m = await context(roomId, userId);
  if (!MUSIC_MANAGERS.includes(m.role)) throw fail('Müziği yalnızca oda yetkilileri yönetebilir.', 403);
  return m;
}

/** Çalan müziği yalnızca onu başlatan kişi (DJ) yönetir. Başka bir yetkili duraklat / ileri sar / sonraki / ses düzeyi ile
 *  müziği DEVRALAMAZ (eskiden controlled_by değişip müzik kutusu ona geçiyordu). Müzik yoksa ya da çalan DJ odada değilse serbest.
 *  [ownerMayStop]: sahip / yardımcı sahip durdurabilir (denetim). */
async function djGuard(roomId, userId, role, { ownerMayStop = false } = {}) {
  const st = (await query(`SELECT controlled_by, track_id FROM room_music WHERE room_id = $1`, [roomId])).rows[0];
  if (!st || !st.track_id || !st.controlled_by || st.controlled_by === userId) return;
  if (ownerMayStop && ['owner', 'cohost'].includes(role)) return;
  throw fail('Müziği şu an başka bir yetkili çalıyor; yalnızca o yönetebilir.', 403);
}

// Müzik kütüphanesi (yalnızca yönetici tarafından eklenen, lisansı kayıtlı parçalar).
router.get('/music/tracks', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const r = await query(
    `SELECT id, title, artist, url, cover_url, duration_ms, gain_db FROM music_tracks
     WHERE is_active = TRUE AND is_temp = FALSE AND ($1 = '' OR lower(title) LIKE $2 ESCAPE '\\' OR lower(COALESCE(artist, '')) LIKE $2 ESCAPE '\\')
     ORDER BY title LIMIT 50`,
    [q, `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`],
  );
  res.json({ tracks: r.rows.map(trackJson) });
});


// ---- Telefondan odaya müzik yükleme (Zula/Yoho tarzı "yerel müzik") ----
const AUDIO_TYPES = { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/flac': 'flac' };
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const TEMP_TRACK_TTL_HOURS = 12;
const MAX_TEMP_PER_USER = 5;
const MAX_TEMP_PER_MANAGER = 45;

/** Dosyanın gerçekten ses olduğunu ilk baytlarından doğrular; istemcinin bildirdiği türe güvenmez. */
export function detectAudio(buf) {
  if (buf.length < 12) return null;
  if (buf.toString('ascii', 0, 3) === 'ID3') return 'audio/mpeg';
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) {
    const layer = (buf[1] >> 1) & 3; // 0 = ADTS (AAC), 1-3 = MPEG katmanları
    return layer === 0 ? 'audio/aac' : 'audio/mpeg';
  }
  if (buf.toString('ascii', 4, 8) === 'ftyp') return 'audio/mp4';
  if (buf.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (buf.toString('ascii', 0, 4) === 'fLaC') return 'audio/flac';
  return null;
}

/** Kullanıcının hiçbir odada çalmayan ve sırada olmayan en eski geçici parçasını (dosyasıyla) siler. */
async function evictOldestTemp(userId) {
  let r;
  try {
    r = await query(
      `DELETE FROM music_tracks WHERE id = (
         SELECT t.id FROM music_tracks t WHERE t.is_temp AND t.created_by = $1 AND t.expires_at > NOW()
           AND NOT EXISTS (SELECT 1 FROM room_music m WHERE m.track_id = t.id)
           AND NOT EXISTS (SELECT 1 FROM room_music_queue q WHERE q.track_id = t.id)
         ORDER BY t.created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
       RETURNING url`,
      [userId],
    );
  } catch (_) {
    return false; // aynı anda çalınmaya / sıraya alındı: silinmez
  }
  for (const row of r.rows) {
    try { await fs.unlink(path.join(config.uploadDir, 'music', path.basename(row.url))); } catch (_) { /* dosya zaten yok */ }
  }
  return r.rowCount > 0;
}

/** Yeniden çalınan / sıraya eklenen geçici parça silinmesin: süresi uzatılır (telefon aynı şarkıyı yeniden yüklemez). */
const keepTemp = (run, trackId) => run(
  `UPDATE music_tracks SET expires_at = GREATEST(expires_at, NOW() + make_interval(hours => $2::int)) WHERE id = $1 AND is_temp`,
  [trackId, TEMP_TRACK_TTL_HOURS],
);

router.post('/rooms/:roomId/music/upload',
  userLimit('music_upload', 60, 10 * 60e3),
  // Yetki, 25 MB'lık gövde belleğe alınmadan ÖNCE denetlenir (yetkisiz istek sunucuyu yormasın).
  async (req, _res, next) => {
    const member = await context(uuid(req.params.roomId, 'Oda'), req.user.id);
    if (!MUSIC_MANAGERS.includes(member.role) && member.microphone !== true) throw fail('Müzik çalmak için mikrofonda olmalısınız.', 403);
    next();
  },
  express.raw({ type: () => true, limit: MAX_AUDIO_BYTES }),
  async (req, res) => {
    const roomId = uuid(req.params.roomId, 'Oda');
    const member = await context(roomId, req.user.id);
    if (!MUSIC_MANAGERS.includes(member.role) && member.microphone !== true) throw fail('Müzik çalmak için mikrofonda olmalısınız.', 403);
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) throw fail('Müzik dosyası gönderilmedi.');
    const kind = detectAudio(buf);
    if (!kind) throw fail('Desteklenmeyen ses dosyası (mp3, m4a, aac, ogg, wav, flac).');
    const durationMs = Math.floor(Number(req.query.durationMs));
    if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 7200000) throw fail('Şarkı süresi geçersiz.');
    const title = String(req.query.title ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) || 'Adsız parça';
    const artist = String(req.query.artist ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) || null;

    const mine = (await query(`SELECT COUNT(*)::int AS n FROM music_tracks WHERE is_temp AND created_by = $1 AND expires_at > NOW()`, [req.user.id])).rows[0].n;
    const tempCap = MUSIC_MANAGERS.includes(member.role) ? MAX_TEMP_PER_MANAGER : MAX_TEMP_PER_USER;
    // Sınır dolduysa çalmayan / sırada olmayan en eski yüklemesi silinir (uzun çalma listesi yarıda kalmasın).
    if (mine >= tempCap && !(MUSIC_MANAGERS.includes(member.role) && (await evictOldestTemp(req.user.id)))) {
      throw fail(`Aynı anda en fazla ${tempCap} yüklenmiş parçanız olabilir. Biri bitince tekrar deneyin.`, 409);
    }

    const dir = path.join(config.uploadDir, 'music');
    await fs.mkdir(dir, { recursive: true });
    const name = `${crypto.randomUUID()}.${AUDIO_TYPES[kind]}`;
    await fs.writeFile(path.join(dir, name), buf);
    const t = (await query(
      `INSERT INTO music_tracks(title, artist, url, duration_ms, license_note, created_by, is_temp, owner_room_id, expires_at, size_bytes)
       VALUES($1,$2,$3,$4,'Kullanıcı cihazından (geçici)',$5,TRUE,$6, NOW() + make_interval(hours => $7::int), $8)
       RETURNING id, title, artist, url, cover_url, duration_ms, gain_db`,
      [title, artist, `/uploads/music/${name}`, durationMs, req.user.id, roomId, TEMP_TRACK_TTL_HOURS, buf.length],
    )).rows[0];
    // Ses yüksekliği arka planda ölçülür (yanıtı bekletmez); bitince odadakiler parçanın kazancını alır.
    analyzeTrack(t.id, t.url).then((g) => (g === null ? null : broadcastMusic(roomId))).catch(() => {});
    res.status(201).json({ track: trackJson(t) });
  });

// Aynı kişi aynı şarkıyı bu odaya son saatlerde yüklediyse dosya yeniden gönderilmez (süresi uzatılıp kullanılır).
router.post('/rooms/:roomId/music/reuse', userLimit('music_reuse', 120, 10 * 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const member = await context(roomId, req.user.id);
  if (!MUSIC_MANAGERS.includes(member.role) && member.microphone !== true) throw fail('Müzik çalmak için mikrofonda olmalısınız.', 403);
  const size = Math.floor(Number(req.body?.sizeBytes));
  const dur = Math.floor(Number(req.body?.durationMs));
  const title = String(req.body?.title ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 120) || 'Adsız parça';
  if (!Number.isFinite(size) || size <= 0 || !Number.isFinite(dur) || dur <= 0) throw fail('Geçersiz şarkı bilgisi.');
  const t = (await query(
    `SELECT id, title, artist, url, cover_url, duration_ms, gain_db FROM music_tracks
     WHERE is_temp AND is_active = TRUE AND created_by = $1 AND owner_room_id = $2 AND size_bytes = $3 AND duration_ms = $4 AND title = $5
       AND expires_at > NOW() + INTERVAL '10 minutes'
     ORDER BY created_at DESC LIMIT 1`,
    [req.user.id, roomId, size, dur, title],
  )).rows[0];
  if (!t) throw fail('Şarkı daha önce yüklenmemiş.', 404);
  try {
    await fs.access(path.join(config.uploadDir, 'music', path.basename(t.url)));
  } catch (_) {
    throw fail('Şarkı daha önce yüklenmemiş.', 404);
  }
  await keepTemp(query, t.id);
  if (t.gain_db === null) analyzeTrack(t.id, t.url).then((g) => (g === null ? null : broadcastMusic(roomId))).catch(() => {});
  res.json({ track: trackJson(t) });
});

router.get('/rooms/:roomId/music', async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  await context(roomId, req.user.id);
  res.json({ state: await musicState(roomId) });
});

router.post('/rooms/:roomId/music/queue', userLimit('music_queue', 60, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const trackId = uuid(req.body?.trackId, 'Şarkı');
  const member = await context(roomId, req.user.id);
  if (!MUSIC_MANAGERS.includes(member.role) && member.microphone !== true) throw fail('Şarkı eklemek için mikrofonda olmalısınız.', 403);

  await tx(async (c) => {
    await c.query(`SELECT id FROM rooms WHERE id = $1 FOR UPDATE`, [roomId]); // sıra sınırı yarışını önler
    const track = (await c.query(`SELECT id FROM music_tracks WHERE id = $1 AND is_active = TRUE AND (owner_room_id IS NULL OR owner_room_id = $2)`, [trackId, roomId])).rows[0];
    if (!track) throw fail('Şarkı bulunamadı.', 404);
    await keepTemp((q, p) => c.query(q, p), trackId);
    const counts = (await c.query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE added_by = $2)::int AS mine FROM room_music_queue WHERE room_id = $1`, [roomId, req.user.id],
    )).rows[0];
    const d = queueDecision({ queueLength: counts.total, userCount: counts.mine, manager: MUSIC_MANAGERS.includes(member.role) });
    if (!d.ok) throw fail(d.message, 409);
    await c.query(`INSERT INTO room_music_queue(room_id, track_id, added_by) VALUES($1,$2,$3)`, [roomId, trackId, req.user.id]);
    // Hiçbir şey çalmıyorsa ilk eklenen şarkı hemen başlar.
    const st = (await c.query(`SELECT status FROM room_music WHERE room_id = $1`, [roomId])).rows[0];
    if (!st) await c.query(`INSERT INTO room_music(room_id, status) VALUES($1,'stopped')`, [roomId]);
  });
  const st = await musicState(roomId);
  if (st.status === 'stopped') await advanceQueue(roomId);
  else await broadcastMusic(roomId);
  res.status(201).json({ state: await musicState(roomId) });
});

router.delete('/rooms/:roomId/music/queue/:itemId', async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const itemId = uuid(req.params.itemId, 'Sıra öğesi');
  const member = await context(roomId, req.user.id);
  const item = (await query(`SELECT added_by FROM room_music_queue WHERE id = $1 AND room_id = $2`, [itemId, roomId])).rows[0];
  if (!item) throw fail('Sıra öğesi bulunamadı.', 404);
  if (item.added_by !== req.user.id && !MUSIC_MANAGERS.includes(member.role)) throw fail('Bu şarkıyı kaldırma yetkiniz yok.', 403);
  await query(`DELETE FROM room_music_queue WHERE id = $1`, [itemId]);
  await broadcastMusic(roomId);
  res.json({ ok: true });
});

router.post('/rooms/:roomId/music/play', userLimit('music_ctl', 40, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const mctx = await managerContext(roomId, req.user.id);
  const trackId = req.body?.trackId ? uuid(req.body.trackId, 'Şarkı') : null;
  if (!trackId) await djGuard(roomId, req.user.id, mctx.role); // devam ettirme: yalnızca çalan kişi

  if (trackId) {
    const t = (await query(`SELECT id, duration_ms FROM music_tracks WHERE id = $1 AND is_active = TRUE AND (owner_room_id IS NULL OR owner_room_id = $2)`, [trackId, roomId])).rows[0];
    if (!t) throw fail('Şarkı bulunamadı.', 404);
    await keepTemp(query, trackId);
    // DJ şarkıyı yükleme sürerken telefonundan dinlemeye başladıysa odadakiler onun konumundan başlar.
    const p = Math.floor(Number(req.body?.positionMs ?? 0));
    const pos = Number.isFinite(p) && p > 0 ? Math.min(p, Math.max(0, (t.duration_ms ?? 0) - 1000)) : 0;
    await query(
      `INSERT INTO room_music(room_id, track_id, status, position_ms, updated_at, controlled_by) VALUES($1,$2,'playing',$4,NOW(),$3)
       ON CONFLICT (room_id) DO UPDATE SET track_id = EXCLUDED.track_id, status = 'playing', position_ms = EXCLUDED.position_ms, updated_at = NOW(), controlled_by = EXCLUDED.controlled_by`,
      [roomId, trackId, req.user.id, pos],
    );
  } else {
    const r = await query(
      `UPDATE room_music SET status = 'playing', updated_at = NOW(), controlled_by = $2 WHERE room_id = $1 AND status = 'paused' RETURNING room_id`,
      [roomId, req.user.id],
    );
    if (!r.rowCount) {
      if (!(await advanceQueue(roomId))) throw fail('Çalınacak şarkı yok. Önce bir şarkı seçin.', 409);
      return res.json({ state: await musicState(roomId) });
    }
  }
  await broadcastMusic(roomId);
  res.json({ state: await musicState(roomId) });
});

// Duraklat ve ara: konumu veritabanı saatiyle bir transaction içinde hesaplar.
async function withLockedState(roomId, fn) {
  return tx(async (c) => {
    const st = (await c.query(
      `SELECT rm.status, rm.position_ms, (EXTRACT(EPOCH FROM (NOW() - rm.updated_at)) * 1000)::bigint AS elapsed_ms, t.duration_ms
       FROM room_music rm JOIN music_tracks t ON t.id = rm.track_id WHERE rm.room_id = $1 FOR UPDATE OF rm`,
      [roomId],
    )).rows[0];
    if (!st) throw fail('Şu an çalan bir şarkı yok.', 409);
    await fn(c, st);
  });
}

router.post('/rooms/:roomId/music/pause', userLimit('music_ctl', 40, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const mctx = await managerContext(roomId, req.user.id);
  await djGuard(roomId, req.user.id, mctx.role);
  await withLockedState(roomId, async (c, st) => {
    if (st.status !== 'playing') throw fail('Müzik zaten duraklatılmış.', 409);
    const pos = clampPosition(positionAt('playing', st.position_ms, st.elapsed_ms), st.duration_ms);
    await c.query(`UPDATE room_music SET status = 'paused', position_ms = $2, updated_at = NOW(), controlled_by = $3 WHERE room_id = $1`, [roomId, pos, req.user.id]);
  });
  await broadcastMusic(roomId);
  res.json({ state: await musicState(roomId) });
});

router.post('/rooms/:roomId/music/seek', userLimit('music_ctl', 40, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const mctx = await managerContext(roomId, req.user.id);
  await djGuard(roomId, req.user.id, mctx.role);
  const requested = Number(req.body?.positionMs);
  if (!Number.isFinite(requested) || requested < 0) throw fail('Konum geçersiz.');
  await withLockedState(roomId, async (c, st) => {
    await c.query(`UPDATE room_music SET position_ms = $2, updated_at = NOW(), controlled_by = $3 WHERE room_id = $1`, [roomId, clampPosition(requested, st.duration_ms), req.user.id]);
  });
  await broadcastMusic(roomId);
  res.json({ state: await musicState(roomId) });
});

router.post('/rooms/:roomId/music/next', userLimit('music_ctl', 40, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const mctx = await managerContext(roomId, req.user.id);
  await djGuard(roomId, req.user.id, mctx.role);
  await advanceQueue(roomId);
  res.json({ state: await musicState(roomId) });
});

// Ses düzeyi: müziği çalan (yetkili) ayarlar; herkesin cihazında bu düzeyde çalar.
router.post('/rooms/:roomId/music/volume', userLimit('music_volume', 120, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const mctx = await managerContext(roomId, req.user.id);
  await djGuard(roomId, req.user.id, mctx.role);
  const v = Number(req.body?.volume);
  if (!Number.isFinite(v) || v < 0 || v > 1) throw fail('Ses düzeyi 0 ile 1 arasında olmalı.');
  const r = await query(`UPDATE room_music SET volume = $2 WHERE room_id = $1 RETURNING room_id`, [roomId, Math.round(v * 100) / 100]);
  if (!r.rowCount) await query(`INSERT INTO room_music(room_id, status, volume) VALUES($1,'stopped',$2) ON CONFLICT (room_id) DO UPDATE SET volume = EXCLUDED.volume`, [roomId, Math.round(v * 100) / 100]);
  await broadcastMusic(roomId);
  res.json({ state: await musicState(roomId) });
});

router.post('/rooms/:roomId/music/stop', userLimit('music_ctl', 40, 60e3), async (req, res) => {
  const roomId = uuid(req.params.roomId, 'Oda');
  const mctx = await managerContext(roomId, req.user.id);
  await djGuard(roomId, req.user.id, mctx.role, { ownerMayStop: true });
  await query(`UPDATE room_music SET track_id = NULL, status = 'stopped', position_ms = 0, updated_at = NOW(), controlled_by = $2 WHERE room_id = $1`, [roomId, req.user.id]);
  await broadcastMusic(roomId);
  res.json({ state: await musicState(roomId) });
});
