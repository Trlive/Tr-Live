// Her isteğin süresini ve sonucunu ölçer.
//
// Ölçüm anahtarı olarak GERÇEK YOL değil, Express'in eşleştirdiği ROTA DESENİ kullanılır:
// `/api/rooms/:roomId/members`. Gerçek yol kullanılsaydı her oda kimliği ayrı bir satır
// açar, bellek ve panel listesi şişerdi (kardinalite patlaması).
//
// Desen ancak yönlendirme bittikten sonra bilinir (req.route), bu yüzden ölçüm `finish`
// olayında okunur. Eşleşen rota yoksa (404) tek bir "(eşleşmedi)" anahtarına toplanır.
import { recordRequest } from '../../infrastructure/observability/metrics.js';
import { log } from '../../infrastructure/observability/log.js';

const SLOW_MS = Number(process.env.SLOW_REQUEST_MS || 2000);

export function timing(req, res, next) {
  const started = process.hrtime.bigint();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const route = req.route?.path ? `${req.baseUrl || ''}${req.route.path}` : '(eşleşmedi)';
    recordRequest({ method: req.method, route, status: res.statusCode, ms });
    // Yavaş ve hatalı istekler ayrıca kayda düşer: panel sayısı özetler, kayıt tekil olayı
    // gösterir ("hangi istek, ne zaman, kim"). İkisi birbirinin yerini tutmaz.
    if (res.statusCode >= 500 || ms >= SLOW_MS) {
      log[res.statusCode >= 500 ? 'error' : 'warn'](res.statusCode >= 500 ? 'request_failed' : 'request_slow', {
        method: req.method, route, status: res.statusCode, ms: Math.round(ms), userId: req.user?.id ?? null,
      });
    }
  };
  // 'finish' yanıt tamamlanınca, 'close' bağlantı erken koptuğunda çalışır; ikisi de
  // olabileceği için tek seferlik koruma var (done).
  res.on('finish', finish);
  res.on('close', finish);
  next();
}
