// Tema görseli başlık okuma (saf mantık, veritabanı gerektirmez; test edilebilir).

/** png / jpeg / webp / gif başlığından boyut okur. Bilinmiyorsa null. Saf mantık (test edilebilir). */
export function imageInfo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 30) return null;
  if (buf.readUInt32BE(0) === 0x89504e47) return { mime: 'image/png', ext: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), animated: false };
  if (buf.toString('ascii', 0, 4) === 'GIF8') return { mime: 'image/gif', ext: 'gif', w: buf.readUInt16LE(6), h: buf.readUInt16LE(8), animated: true };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16);
    const base = { mime: 'image/webp', ext: 'webp' };
    if (fmt === 'VP8X') {
      return { ...base, w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3), animated: (buf[20] & 0x02) !== 0 };
    }
    if (fmt === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { ...base, w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, animated: false };
    }
    if (fmt === 'VP8 ') return { ...base, w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, animated: false };
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
        return { mime: 'image/jpeg', ext: 'jpg', h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), animated: false };
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** ffmpeg yokken kabul edilebilir mi: dikey (yaklaşık 9:16) ve yeterince büyük. Saf mantık. */
export function acceptableAsIs(info) {
  if (!info || !info.w || !info.h) return false;
  const r = info.w / info.h;
  return r >= 0.5 && r <= 0.62 && info.w >= 540 && info.w <= 2160;
}
