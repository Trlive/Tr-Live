import zlib from 'node:zlib';
import crypto from 'node:crypto';
import path from 'node:path';
import { run, withTemp, ffmpegAvailable, probe, heavy } from './media_tools.js';
import { vapcInfo, ensureVapc, isAnimatedImage } from './media.js';

// Medya bütçesi: hediye / çerçeve / efekt dosyalarının telefonu zorlamaması için üst sınırlar ve otomatik küçültme.
// Telefonun belleğini asıl dolduran şey dosya boyutu değil, dosyanın AÇILINCA kaplayacağı yerdir (svga içindeki
// görsellerin piksel sayısı, mp4'ün çözünürlüğü). Bu yüzden sınırlar piksel ve kare hızı üzerinden de konur.
const KB = 1024;
const MB = 1024 * 1024;

export function limitsFrom(cfg) {
  const n = (k) => Number(cfg[k]);
  const L = {
    mp4W: n('mediaMp4MaxWidth'), mp4H: n('mediaMp4MaxHeight'), fps: n('mediaMp4MaxFps'), mp4Bytes: n('mediaMp4MaxKb') * KB,
    svgaBytes: n('mediaSvgaMaxKb') * KB, svgaSide: n('mediaSvgaMaxSide'), svgaDecoded: n('mediaSvgaMaxDecodedMb') * MB,
    imgSide: n('mediaImageMaxSide'), imgBytes: n('mediaImageMaxKb') * KB, smallSide: n('mediaSmallMaxSide'), iconSide: n('mediaIconMaxSide'),
  };
  L.hash = crypto.createHash('sha1').update(JSON.stringify(L)).digest('hex').slice(0, 10);
  return L;
}

/** Dosyanın kullanıldığı yere göre sınırlar. cls: 'gift' (tam ekran), 'small' (çerçeve, mikte hediye), 'icon' (küçük resim). */
export function forClass(L, cls) {
  const small = cls === 'small';
  const icon = cls === 'icon';
  return {
    mp4W: small ? Math.min(L.mp4W, L.smallSide) : L.mp4W,
    mp4H: small ? Math.min(L.mp4H, L.smallSide) : L.mp4H,
    fps: L.fps,
    mp4Bytes: L.mp4Bytes,
    svgaSide: small ? Math.min(L.svgaSide, L.smallSide) : L.svgaSide,
    svgaBytes: L.svgaBytes,
    svgaDecoded: L.svgaDecoded,
    imgSide: icon ? L.iconSide : small ? Math.min(L.imgSide, L.smallSide) : L.imgSide,
    imgBytes: icon ? Math.min(L.imgBytes, 512 * KB) : L.imgBytes,
  };
}

// ---- Görsel boyutu (başlıktan; ffmpeg gerekmez) ----
export function imageDims(b) {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) { o++; continue; }
        const m = b[o + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
        o += 2 + b.readUInt16BE(o + 2);
      }
      return null;
    }
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const t = b.toString('ascii', 12, 16);
      if (t === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (t === 'VP8L') return { w: 1 + (b[21] | ((b[22] & 0x3f) << 8)), h: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
    }
  } catch { /* okunamadı */ }
  return null;
}

// ---- SVGA (zlib ile sıkıştırılmış protobuf) ----
function rv(b, o) {
  let r = 0; let m = 1;
  for (;;) {
    if (o >= b.length) throw new Error('svga bozuk');
    const x = b[o++];
    r += (x & 0x7f) * m;
    if (!(x & 0x80)) return [r, o];
    m *= 128;
    if (m > 2 ** 49) throw new Error('svga bozuk');
  }
}
function wv(n) {
  const a = [];
  while (n >= 128) { a.push((n % 128) | 128); n = Math.floor(n / 128); }
  a.push(n);
  return Buffer.from(a);
}
const lenField = (tag, data) => Buffer.concat([Buffer.from([tag]), wv(data.length), data]);
const isImage = (d) => d.length > 12 && ((d[0] === 0x89 && d[1] === 0x50) || (d[0] === 0xff && d[1] === 0xd8) || (d.toString('ascii', 0, 4) === 'RIFF' && d.toString('ascii', 8, 12) === 'WEBP'));

/** parts: sırayla ya ham Buffer ya da { key, data } (images tablosundaki bir giriş). */
export function parseSvga(buf) {
  const pb = zlib.inflateSync(buf, { maxOutputLength: 768 * MB });
  const parts = [];
  const meta = { fps: 0, frames: 0 };
  let o = 0;
  while (o < pb.length) {
    const start = o;
    let tag; [tag, o] = rv(pb, o);
    const field = Math.floor(tag / 8); const wire = tag % 8;
    if (wire === 0) { [, o] = rv(pb, o); parts.push(pb.subarray(start, o)); continue; }
    if (wire === 1) { o += 8; parts.push(pb.subarray(start, o)); continue; }
    if (wire === 5) { o += 4; parts.push(pb.subarray(start, o)); continue; }
    if (wire !== 2) throw new Error('svga bozuk');
    let len; [len, o] = rv(pb, o);
    const end = o + len;
    if (end > pb.length) throw new Error('svga bozuk');
    if (field === 3) {
      let key = ''; let data = null; let p = o;
      while (p < end) {
        let t; [t, p] = rv(pb, p);
        const f = Math.floor(t / 8); const w = t % 8;
        if (w === 2) {
          let l; [l, p] = rv(pb, p);
          if (f === 1) key = pb.toString('utf8', p, p + l); else if (f === 2) data = pb.subarray(p, p + l);
          p += l;
        } else if (w === 0) { [, p] = rv(pb, p); } else if (w === 1) p += 8; else if (w === 5) p += 4; else throw new Error('svga bozuk');
      }
      if (data) { parts.push({ key, data }); o = end; continue; }
    } else if (field === 2) {
      let p = o;
      while (p < end) {
        let t; [t, p] = rv(pb, p);
        const f = Math.floor(t / 8); const w = t % 8;
        if (w === 0) { let v; [v, p] = rv(pb, p); if (f === 3) meta.fps = v; else if (f === 4) meta.frames = v; } else if (w === 5) p += 4; else if (w === 1) p += 8; else if (w === 2) { let l; [l, p] = rv(pb, p); p += l; } else break;
      }
    }
    o = end;
    parts.push(pb.subarray(start, o));
  }
  const images = parts.filter((x) => !Buffer.isBuffer(x) && isImage(x.data));
  return { parts, images, ...meta };
}

export function buildSvga(parts) {
  const out = parts.map((x) => (Buffer.isBuffer(x) ? x : lenField(0x1a, Buffer.concat([lenField(0x0a, Buffer.from(x.key, 'utf8')), lenField(0x12, x.data)]))));
  return zlib.deflateSync(Buffer.concat(out), { level: 9 });
}

// ---- Analiz ----
const fmtMb = (n) => `${(n / MB).toFixed(1)} MB`;

export async function analyze(buf, kind, cls, L) {
  const c = forClass(L, cls);
  const a = { kind, cls, bytes: buf.length, over: [], fixable: true };
  const bytesOver = (max) => { if (buf.length > max) a.over.push(`Boyut ${fmtMb(buf.length)} (sınır ${fmtMb(max)})`); };
  try {
    if (kind === 'mp4') {
      const v = vapcInfo(buf);
      if (v && Array.isArray(v.aFrame) && Array.isArray(v.rgbFrame)) {
        const [ax, ay, aw, ah] = v.aFrame; const [rx, ry, rw, rh] = v.rgbFrame;
        a.vap = true; a.w = rw; a.h = rh; a.fps = Number(v.fps) || 0;
        a.std = ay === 0 && ry === 0 && aw === rw && ah === rh && rh === v.videoH && aw * 2 === v.videoW && ax !== rx && (ax === 0 || rx === 0) && aw % 2 === 0;
        if (!a.std) { a.fixable = false; a.why = 'Özel şeffaflık düzeni; otomatik küçültülemez.'; }
      } else if (await ffmpegAvailable()) {
        const info = await withTemp(buf, 'mp4', (f) => probe(f));
        a.vap = false; a.w = info.w; a.h = info.h; a.fps = info.fps;
      } else { a.fixable = false; a.why = 'Sunucuda ffmpeg yok.'; }
      if (a.w > c.mp4W) a.over.push(`Genişlik ${a.w} px (sınır ${c.mp4W})`);
      if (a.h > c.mp4H) a.over.push(`Yükseklik ${a.h} px (sınır ${c.mp4H})`);
      if (a.fps > c.fps + 0.5) a.over.push(`${Math.round(a.fps)} kare/sn (sınır ${c.fps})`);
      bytesOver(c.mp4Bytes);
      if (a.over.length && !(await ffmpegAvailable())) { a.fixable = false; a.why = 'Sunucuda ffmpeg yok.'; }
    } else if (kind === 'svga') {
      const s = parseSvga(buf);
      let decoded = 0; let maxSide = 0;
      for (const im of s.images) {
        const d = imageDims(im.data);
        if (!d) continue;
        decoded += d.w * d.h * 4; maxSide = Math.max(maxSide, d.w, d.h);
      }
      Object.assign(a, { fps: s.fps, images: s.images.length, maxSide, decoded });
      if (maxSide > c.svgaSide) a.over.push(`Görsel kenarı ${maxSide} px (sınır ${c.svgaSide})`);
      if (decoded > c.svgaDecoded) a.over.push(`Açılınca ${fmtMb(decoded)} bellek (sınır ${fmtMb(c.svgaDecoded)})`);
      bytesOver(c.svgaBytes);
      if (a.over.length && !(await ffmpegAvailable())) { a.fixable = false; a.why = 'Sunucuda ffmpeg yok.'; }
    } else if (kind === 'json') {
      bytesOver(c.svgaBytes);
      a.fixable = true;
    } else {
      const d = imageDims(buf);
      if (d) { a.w = d.w; a.h = d.h; a.animated = !!isAnimatedImage(buf); }
      if (d && Math.max(d.w, d.h) > c.imgSide) a.over.push(`Kenar ${Math.max(d.w, d.h)} px (sınır ${c.imgSide})`);
      bytesOver(c.imgBytes);
      if (a.over.length && !(await ffmpegAvailable())) { a.fixable = false; a.why = 'Sunucuda ffmpeg yok.'; }
    }
  } catch (e) {
    a.error = e.message; a.fixable = false; a.why = `Dosya okunamadı: ${e.message}`;
  }
  return a;
}

// ---- Küçültme ----
const even = (n) => Math.max(2, Math.round(n) & ~1);

async function fixMp4(buf, a, c) {
  if (!(await ffmpegAvailable())) throw new Error('ffmpeg yok');
  const vapc = vapcInfo(buf);
  const alphaSide = a.vap ? (vapc.aFrame[0] > vapc.rgbFrame[0] ? 'right' : 'left') : null;
  return withTemp(buf, 'mp4', async (file, dir) => {
    const info = await probe(file);
    const hw = a.vap ? a.w : info.w; const H = a.vap ? a.h : info.h;
    const base = Math.min(1, c.mp4W / hw, c.mp4H / H);
    const fps = Math.min(info.fps, c.fps);
    const needResize = base < 1;
    const ladder = [[base, needResize ? 24 : 26], [base, needResize ? 28 : 30], [base, needResize ? 32 : 34], [base * 0.85, 30], [base * 0.7, 32]];
    let best = null;
    for (const [s, crf] of ladder) {
      const nhw = a.vap ? even(hw * s) : even(hw * s); const nH = even(H * s);
      const fpsF = fps < info.fps - 0.5 ? `fps=${fps},` : '';
      const graph = a.vap
        ? `[0:v]${fpsF}split[a][b];[a]crop=${hw}:${H}:0:0,scale=${nhw}:${nH}:flags=lanczos[l];[b]crop=${hw}:${H}:${hw}:0,scale=${nhw}:${nH}:flags=lanczos[r];[l][r]hstack=inputs=2,format=yuv420p[v]`
        : `[0:v]${fpsF}scale=${nhw}:${nH}:flags=lanczos,format=yuv420p[v]`;
      const out = path.join(dir, `o${Math.round(s * 100)}_${crf}.mp4`);
      await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-filter_complex', graph, '-map', '[v]', '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-crf', String(crf), '-profile:v', 'main', '-level', '4.0',
        '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', out], { timeoutMs: 200000 });
      const o = await probe(out);
      const wantW = a.vap ? nhw * 2 : nhw;
      if (o.w !== wantW || o.h !== nH) throw new Error('çıktı boyutu beklenenden farklı');
      if (info.duration > 0 && Math.abs(o.duration - info.duration) > Math.max(0.3, info.duration * 0.06)) throw new Error('çıktı süresi farklı');
      await run('ffmpeg', ['-v', 'error', '-i', out, '-f', 'null', '-'], { timeoutMs: 120000 });
      const fs = await import('node:fs/promises');
      let data = await fs.readFile(out);
      if (a.vap) data = ensureVapc(data, alphaSide).buf;
      if (!best || data.length < best.length) best = data;
      if (data.length <= c.mp4Bytes) { best = data; break; }
    }
    return best;
  });
}

async function scaleImageBytes(data, w, h) {
  const d = imageDims(data);
  const jpeg = data[0] === 0xff;
  const webp = data.toString('ascii', 0, 4) === 'RIFF';
  return withTemp(data, jpeg ? 'jpg' : webp ? 'webp' : 'png', async (file) => {
    const sc = `scale=${w}:${h}:flags=lanczos`;
    const args = jpeg
      ? ['-vf', sc, '-c:v', 'mjpeg', '-q:v', '3']
      : webp
        ? ['-vf', `${sc}`, '-c:v', 'libwebp', '-quality', '85']
        // Şeffaf kenarlarda koyu halka olmasın diye renk, şeffaflıkla çarpılmış halde küçültülür.
        : ['-vf', `format=gbrap,premultiply=inplace=1,${sc},unpremultiply=inplace=1,format=rgba`, '-c:v', 'png', '-compression_level', '9'];
    const out = await run('ffmpeg', ['-v', 'error', '-i', file, ...args, '-frames:v', '1', '-f', 'image2pipe', '-'], { timeoutMs: 60000 });
    if (!out.length || (d && !imageDims(out))) throw new Error('görsel küçültülemedi');
    return out;
  });
}

async function fixSvga(buf, a, c) {
  if (!(await ffmpegAvailable())) throw new Error('ffmpeg yok');
  const s = parseSvga(buf);
  const dims = new Map(s.images.map((im) => [im, imageDims(im.data)]));
  let best = null;
  for (const f of [1, 0.8, 0.64, 0.5, 0.4]) {
    const side = Math.max(160, Math.round(c.svgaSide * f));
    // Her görsel kendi oranıyla; toplam bellek sınırı aşılırsa hepsi aynı oranda biraz daha küçülür.
    const want = new Map();
    let decoded = 0;
    for (const im of s.images) {
      const d = dims.get(im); if (!d) continue;
      const k = Math.min(1, side / Math.max(d.w, d.h));
      want.set(im, k); decoded += d.w * k * d.h * k * 4;
    }
    if (decoded > c.svgaDecoded) {
      const g = Math.sqrt(c.svgaDecoded / decoded);
      for (const [im, k] of want) want.set(im, k * g);
    }
    const parts = [];
    const cache = new Map();
    for (const p of s.parts) {
      if (Buffer.isBuffer(p) || !want.has(p)) { parts.push(p); continue; }
      const d = dims.get(p); const k = want.get(p);
      if (k >= 0.999 || Math.max(d.w, d.h) <= 48) { parts.push(p); continue; }
      const w = Math.max(1, Math.round(d.w * k)); const h = Math.max(1, Math.round(d.h * k));
      const sig = `${crypto.createHash('sha1').update(p.data).digest('hex')}:${w}x${h}`;
      let data = cache.get(sig);
      if (!data) { data = await scaleImageBytes(p.data, w, h); cache.set(sig, data); }
      parts.push({ key: p.key, data: data.length < p.data.length || k < 0.999 ? data : p.data });
    }
    const out = buildSvga(parts);
    if (!best || out.length < best.length) best = out;
    if (out.length <= c.svgaBytes) { best = out; break; }
  }
  return best;
}

async function frameCount(file) {
  const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file], { timeoutMs: 60000 });
  return parseInt(out.toString().trim(), 10) || 0;
}

async function fixImage(buf, kind, a, c) {
  if (!(await ffmpegAvailable())) throw new Error('ffmpeg yok');
  const animated = !!isAnimatedImage(buf);
  const longest = Math.max(a.w ?? 0, a.h ?? 0);
  if (!longest) throw new Error('boyut okunamadı');
  return withTemp(buf, kind === 'jpg' ? 'jpg' : kind, async (file, dir) => {
    if (animated && (await frameCount(file)) < 2) throw new Error('sunucudaki ffmpeg bu hareketli dosyayı okuyamıyor');
    const ladder = [[c.imgSide, 82], [c.imgSide, 70], [c.imgSide * 0.85, 62], [c.imgSide * 0.7, 52]];
    let best = null;
    for (const [side, q] of ladder) {
      const k = Math.min(1, side / longest);
      const w = even(a.w * k); const h = even(a.h * k);
      const sc = `scale=${w}:${h}:flags=lanczos`;
      let args;
      if (kind === 'png') args = ['-vf', `format=gbrap,premultiply=inplace=1,${sc},unpremultiply=inplace=1,format=rgba`, '-c:v', 'png', '-compression_level', '9', '-f', 'image2pipe'];
      else if (kind === 'jpg') args = ['-vf', sc, '-c:v', 'mjpeg', '-q:v', String(Math.max(2, Math.round((100 - q) / 6))), '-f', 'image2pipe'];
      else if (kind === 'webp') args = animated
        ? ['-vf', sc, '-c:v', 'libwebp_anim', '-quality', String(q), '-loop', '0', '-an', '-f', 'webp']
        : ['-vf', sc, '-c:v', 'libwebp', '-quality', String(q), '-f', 'image2pipe'];
      else args = ['-vf', `${sc},split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`, '-loop', '0', '-f', 'gif']; // gif
      const out = await run('ffmpeg', ['-v', 'error', '-i', file, ...(kind === 'gif' || animated ? [] : ['-frames:v', '1']), ...args, '-'], { timeoutMs: 120000 });
      if (!out.length) throw new Error('boş çıktı');
      const d = imageDims(out);
      if (!d || d.w > w + 1 || d.h > h + 1) throw new Error('çıktı boyutu beklenenden farklı');
      if (animated) {
        const chk = await withTemp(out, kind, (f2) => frameCount(f2));
        if (chk < 2) throw new Error('hareket kaybolmuş');
      }
      if (!best || out.length < best.length) best = out;
      if (out.length <= c.imgBytes) { best = out; break; }
      void dir;
    }
    return best;
  });
}

function fixJson(buf) {
  const j = JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
  return Buffer.from(JSON.stringify(j));
}

/**
 * Dosyayı sınırlara indirir. Döner: { changed, buf?, before, after, note, manual? }.
 * Çıktı dosyadan daha kötüyse ya da bozuksa dosya değişmez (changed: false).
 */
export async function optimize(buf, kind, cls, L) {
  const before = await analyze(buf, kind, cls, L);
  if (!before.over.length) return { changed: false, before, after: before, note: 'Sınırlar içinde.' };
  if (!before.fixable) return { changed: false, before, after: before, manual: true, note: before.why ?? 'Otomatik küçültülemiyor.' };
  const c = forClass(L, cls);
  let out;
  try {
    out = await heavy(async () => {
      if (kind === 'mp4') return fixMp4(buf, before, c);
      if (kind === 'svga') return fixSvga(buf, before, c);
      if (kind === 'json') return fixJson(buf);
      return fixImage(buf, kind, before, c);
    });
  } catch (e) {
    return { changed: false, before, after: before, failed: true, note: `Küçültülemedi: ${e.message}` };
  }
  const after = await analyze(out, kind, cls, L);
  const better = after.over.length < before.over.length || out.length < buf.length * 0.98;
  // Çözünürlük sınırı giderildiyse (bellek asıl kazanç) dosya biraz büyüyebilir (ör. gif palet); aksi halde büyümeye izin yok.
  const grow = after.over.length < before.over.length ? 1.5 : 1.0;
  if (after.error || !better || out.length > buf.length * grow) {
    return { changed: false, before, after: before, failed: true, note: 'Küçültme dosyayı iyileştirmedi; orijinali korundu.' };
  }
  const left = after.over.length ? ` Hâlâ sınırı aşan: ${after.over.join(', ')}.` : '';
  return { changed: true, buf: out, before, after, note: `${fmtMb(buf.length)} → ${fmtMb(out.length)}.${left}` };
}
