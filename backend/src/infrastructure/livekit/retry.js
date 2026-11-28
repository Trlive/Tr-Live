// Küçük yeniden deneme yardımcısı (bağımlılık yok, test edilebilir). LiveKit çağrıları için.
const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * fn'i en fazla `attempts` kez dener; her başarısızlıktan sonra baseMs, 2*baseMs, 4*baseMs... bekler.
 * shouldRetry(error) false dönerse hemen bırakır. Asla fırlatmaz: { ok, value } ya da { ok:false, error, attempts } döner.
 */
export async function retry(fn, { attempts = 3, baseMs = 150, shouldRetry = () => true, sleep = realSleep } = {}) {
  let error;
  for (let i = 0; i < attempts; i++) {
    try {
      return { ok: true, value: await fn(i), attempts: i + 1 };
    } catch (e) {
      error = e;
      if (i === attempts - 1 || !shouldRetry(e)) return { ok: false, error, attempts: i + 1 };
      await sleep(baseMs * 2 ** i);
    }
  }
  return { ok: false, error, attempts };
}
