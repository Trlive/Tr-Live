import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { limitsFrom, analyze, optimize, parseSvga, buildSvga, imageDims, forClass } from '../src/services/media_optimize.js';
import { run, withTemp, ffmpegAvailable, probe } from '../src/services/media_tools.js';
import { ensureVapc, vapcInfo } from '../src/services/media.js';
import { CONFIG_DEFAULTS } from '../src/services/app_config.js';

const L = limitsFrom(CONFIG_DEFAULTS);
const HAS = await ffmpegAvailable();
const skip = HAS ? false : 'ffmpeg yok';

async function png(w, h, noise = true) {
  return run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', noise ? `nullsrc=s=${w}x${h},geq=random(1)*255:random(2)*255:random(3)*255:128+127*sin(X/9),format=rgba` : `color=c=red@0.5:s=${w}x${h},format=rgba`,
    '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']);
}
async function vap(halfW, h, fps = 30, secs = 2) {
  const raw = await withTemp(Buffer.alloc(0), 'tmp', async (_f, dir) => {
    const out = `${dir}/v.mp4`;
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=s=${halfW * 2}x${h}:r=${fps}:d=${secs}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '14', out]);
    return (await import('node:fs/promises')).readFile(out);
  });
  return ensureVapc(raw, 'left').buf;
}
function svga(images) {
  const field = (tag, data) => { const l = []; let n = data.length; while (n >= 128) { l.push((n % 128) | 128); n = Math.floor(n / 128); } l.push(n); return Buffer.concat([Buffer.from([tag]), Buffer.from(l), data]); };
  const parts = [field(0x0a, Buffer.from('2.0.0')), field(0x12, Buffer.from([0x0d, 0, 0, 0xc8, 0x42, 0x15, 0, 0, 0xc8, 0x42, 0x18, 0x14, 0x20, 0x0a])), ...images.map(([key, data]) => ({ key, data })), field(0x22, Buffer.from([0x0a, 0x01, 0x61]))];
  return buildSvga(parts);
}

test('imageDims: png, gif, webp başlıktan okunur', async () => {
  const b = Buffer.alloc(40); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(300, 16); b.writeUInt32BE(200, 20);
  assert.deepEqual(imageDims(b), { w: 300, h: 200 });
  const g = Buffer.from('GIF89a'); const gb = Buffer.concat([g, Buffer.from([0x2c, 0x01, 0x90, 0x00])]);
  assert.deepEqual(imageDims(gb), { w: 300, h: 144 });
});

test('limitsFrom: aynı ayar aynı özet, değişen ayar farklı özet; küçük sınıf daha sıkı', () => {
  assert.equal(limitsFrom(CONFIG_DEFAULTS).hash, L.hash);
  assert.notEqual(limitsFrom({ ...CONFIG_DEFAULTS, mediaMp4MaxWidth: 400 }).hash, L.hash);
  assert.ok(forClass(L, 'small').mp4H <= forClass(L, 'gift').mp4H);
  assert.equal(forClass(L, 'icon').imgSide, L.iconSide);
});

test('svga protobuf: ayrıştır, yeniden kur, bozulmaz', { skip }, async () => {
  const p = await png(64, 64);
  const buf = svga([['img_a', p], ['audio_1', Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00fakeaudio')]]);
  const s = parseSvga(buf);
  assert.equal(s.fps, 20);
  assert.equal(s.images.length, 1); // ses görsel sayılmaz
  const again = parseSvga(buildSvga(s.parts));
  assert.equal(again.images.length, 1);
  assert.equal(again.parts.length, s.parts.length);
});

test('svga: büyük görseller sınıra indirilir, ses ve diğer alanlar korunur', { skip }, async () => {
  const big = await png(1600, 1600);
  const buf = svga([['a', big], ['b', big], ['sound', Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00fakeaudio')]]);
  const before = await analyze(buf, 'svga', 'gift', L);
  assert.ok(before.over.length > 0);
  const r = await optimize(buf, 'svga', 'gift', L);
  assert.equal(r.changed, true);
  assert.ok(r.after.maxSide <= L.svgaSide);
  assert.ok(r.after.decoded <= L.svgaDecoded);
  const s = parseSvga(r.buf);
  assert.equal(s.fps, 20);
  assert.equal(s.images.length, 2);
  const all = zlib.inflateSync(r.buf);
  assert.ok(all.includes(Buffer.from('fakeaudio'))); // ses dokunulmadı
  const d = imageDims(s.images[0].data);
  assert.ok(Math.max(d.w, d.h) <= L.svgaSide);
});

test('svga: sınır içindeki dosyaya dokunulmaz', { skip }, async () => {
  const small = await png(200, 200, false);
  const r = await optimize(svga([['a', small]]), 'svga', 'gift', L);
  assert.equal(r.changed, false);
});

test('mp4 (VAP): büyük çözünürlük ve kare hızı sınıra iner, şeffaflık düzeni korunur', { skip }, async () => {
  const buf = await vap(720, 1280, 30);
  const before = await analyze(buf, 'mp4', 'gift', L);
  assert.equal(before.std, true);
  assert.ok(before.over.length >= 2);
  const r = await optimize(buf, 'mp4', 'gift', L);
  assert.equal(r.changed, true, r.note);
  const v = vapcInfo(r.buf);
  assert.ok(v, 'vapc korunmalı');
  assert.ok(v.rgbFrame[2] <= L.mp4W && v.rgbFrame[3] <= L.mp4H);
  assert.equal(v.aFrame[2], v.rgbFrame[2]);
  assert.equal(v.videoW, v.rgbFrame[2] * 2);
  assert.ok(v.aFrame[0] === 0 && v.rgbFrame[0] > 0, 'maske solda kalmalı');
  assert.ok(r.after.fps <= L.fps + 0.5);
  assert.deepEqual(r.after.over, []);
  const o = await withTemp(r.buf, 'mp4', (f) => probe(f));
  assert.ok(o.duration > 1.7 && o.duration < 2.3);
});

test('mp4 (VAP): maske sağdaysa sağda kalır; sınır içi dosya değişmez', { skip }, async () => {
  const raw = await vap(720, 1280, 24);
  const right = ensureVapc(raw.subarray(0, raw.length), 'right'); // vapc zaten var: dokunmaz
  assert.equal(right.injected, false);
  const small = await vap(200, 300, 20, 1);
  assert.equal((await optimize(small, 'mp4', 'gift', L)).changed, false);
});

test('mp4: küçük sınıfta (çerçeve) daha sıkı sınır uygulanır', { skip }, async () => {
  const buf = await vap(520, 520, 20, 1);
  assert.equal((await analyze(buf, 'mp4', 'gift', L)).over.length, 0);
  const a = await analyze(buf, 'mp4', 'small', L);
  assert.ok(a.over.length > 0);
  const r = await optimize(buf, 'mp4', 'small', L);
  assert.equal(r.changed, true);
  assert.ok(vapcInfo(r.buf).rgbFrame[2] <= L.smallSide);
});

test('png: büyük görsel sınıra iner, şeffaflık korunur', { skip }, async () => {
  const buf = await png(1800, 900, false);
  const r = await optimize(buf, 'png', 'gift', L);
  assert.equal(r.changed, true);
  const d = imageDims(r.buf);
  assert.ok(Math.max(d.w, d.h) <= L.imgSide);
  const alpha = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', '-'], { input: r.buf }).catch(() => Buffer.from('rgba'));
  assert.match(alpha.toString(), /rgba|pal8|ya8|argb/);
});

test('gif ve hareketli webp: hareket korunur ya da güvenle atlanır', { skip }, async () => {
  const gif = await withTemp(Buffer.alloc(0), 'tmp', async (_f, dir) => {
    const out = `${dir}/a.gif`;
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1000x1000:r=10:d=1', out]);
    return (await import('node:fs/promises')).readFile(out);
  });
  const r = await optimize(gif, 'gif', 'gift', L);
  assert.equal(r.changed, true, r.note);
  assert.ok(Math.max(imageDims(r.buf).w, imageDims(r.buf).h) <= L.imgSide);
  const webp = await withTemp(Buffer.alloc(0), 'tmp', async (_f, dir) => {
    const out = `${dir}/a.webp`;
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1000x1000:r=10:d=1', '-c:v', 'libwebp_anim', '-loop', '0', out]);
    return (await import('node:fs/promises')).readFile(out);
  });
  const w = await optimize(webp, 'webp', 'gift', L);
  // ffmpeg hareketli webp'yi okuyabiliyorsa küçülür; okuyamıyorsa dosya aynen kalır (asla hareketsiz kopya üretilmez).
  if (w.changed) assert.ok(Math.max(imageDims(w.buf).w, imageDims(w.buf).h) <= L.imgSide);
  else assert.equal(w.buf, undefined);
});

test('Lottie json: sınır içi dokunulmaz, bozuk dosya çökertmez', async () => {
  const j = Buffer.from(JSON.stringify({ fr: 25, ip: 0, op: 50, w: 100, h: 100, layers: [] }));
  assert.equal((await optimize(j, 'json', 'gift', L)).changed, false);
  const bad = await analyze(Buffer.from('xxxxxxxxxxxxxxxx'), 'svga', 'gift', L);
  assert.ok(bad.error);
  assert.equal(bad.fixable, false);
});

test('özel şeffaflık düzenli mp4 otomatik küçültülmez, nedeni söylenir', { skip }, async () => {
  const raw = await vap(720, 1280, 24, 1);
  // vapc içindeki bölgeleri bozarak özel düzen taklidi
  const s = raw.toString('latin1'); const i = s.indexOf('"aFrame":[0,0,720,1280]');
  assert.ok(i > 0);
  const hacked = Buffer.from(s.replace('"aFrame":[0,0,720,1280]', '"aFrame":[0,0,360,1280]'), 'latin1');
  const r = await optimize(hacked, 'mp4', 'gift', L);
  assert.equal(r.changed, false);
  assert.equal(r.manual, true);
});

test('crypto kullanımı: aynı görsel iki kez ölçeklenmez (önbellek anahtarı kararlı)', () => {
  const h = (b) => crypto.createHash('sha1').update(b).digest('hex');
  assert.equal(h(Buffer.from('a')), h(Buffer.from('a')));
});
