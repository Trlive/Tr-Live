// Yapılandırılmış kayıt (log).
//
// NEDEN: Kayıtlar bugün serbest metin ("[hata] POST /api/x: ...") ve 77 ayrı `console.error`
// çağrısından geliyor. Bir şey bozulduğunda "hangi uç, kaç kez, hangi kullanıcı, ne kadar
// sürdü" sorularını yanıtlamak için metin aramak gerekiyor. Tek satır JSON bunu aranabilir
// yapar: `grep '"event":"request_failed"' | jq`.
//
// Tasarım kararları:
//  - Bağımlılık yok (pino/winston eklemiyoruz): tek satır JSON, process.stdout/stderr.
//  - Hassas veri YAZILMAZ. Adresler redactSecrets'tan geçirilir; `token`, `password`,
//    `authorization`, `idempotency-key` gibi alan adları değeriyle birlikte maskelenir.
//  - Alan adları sabit ve az: ts, level, event + olaya özgü alanlar. Serbest cümle yok,
//    çünkü cümle değişince arama bozulur; `event` değişmez.
import { redactSecrets } from '../../middleware/security/redact.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

// Değeriyle birlikte maskelenecek alan adları (küçük harfe çevrilip karşılaştırılır).
const SECRET_KEYS = /^(token|refresh_?token|access_?token|password|pass|secret|authorization|cookie|api_?key|idempotency-?key|signature)$/i;

function clean(value, depth = 0) {
  if (value == null) return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return { message: value.message, code: value.code, stack: value.stack?.split('\n').slice(0, 4).join('\n') };
  if (typeof value === 'string') return redactSecrets(value);
  if (typeof value !== 'object' || depth > 3) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => clean(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? '***' : clean(v, depth + 1);
  return out;
}

function write(level, event, fields) {
  if (LEVELS[level] < MIN) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...clean(fields ?? {}) });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const log = {
  debug: (event, fields) => write('debug', event, fields),
  info: (event, fields) => write('info', event, fields),
  warn: (event, fields) => write('warn', event, fields),
  error: (event, fields) => write('error', event, fields),
};
