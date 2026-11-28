// Şarkı ses yüksekliği eşitleme: parçanın ortalama ses yüksekliği (EBU R128 "Integrated", LUFS) ffmpeg ile ölçülür ve
// çalarken uygulanacak kazanç music_tracks.gain_db'ye yazılır. Uygulama müziği bu kazançla çalar (yalnızca kısar,
// hiçbir parçayı yükseltmez: bozulma/patlama olmaz). Ölçüm arka planda, ağır medya sırasıyla yapılır; ffmpeg yoksa atlanır.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { config } from '../../config.js';
import { query } from '../../infrastructure/database/database.js';
import { ffmpegAvailable, heavy } from '../media/media_tools.service.js';
import { gainForLufs, parseIntegratedLufs } from './loudness.rules.js';

function measure(file) {
  return new Promise((resolve) => {
    let err = '';
    let p;
    try {
      p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-map', '0:a:0', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => p.kill('SIGKILL'), 120000);
    p.stderr.on('data', (d) => { err = (err + d).slice(-6000); });
    p.on('error', () => { clearTimeout(timer); resolve(null); });
    p.on('close', (code) => { clearTimeout(timer); resolve(code === 0 ? parseIntegratedLufs(err) : null); });
  });
}

/** Yüklenmiş (sunucudaki) parçanın kazancını ölçüp yazar. Hata olursa sessizce geçer (parça varsayılan düzeyde çalar). */
export function analyzeTrack(trackId, url) {
  const m = /^\/uploads\/music\/([\w.-]+)$/.exec(String(url ?? ''));
  if (!m) return Promise.resolve(null);
  return heavy(async () => {
    if (!(await ffmpegAvailable())) return null;
    const lufs = await measure(path.join(config.uploadDir, 'music', m[1]));
    if (lufs === null) return null;
    const gain = gainForLufs(lufs);
    await query(`UPDATE music_tracks SET gain_db = $2 WHERE id = $1`, [trackId, gain]);
    return gain;
  }).catch(() => null);
}
