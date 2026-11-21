import crypto from 'node:crypto';

/// AWS imza sürüm 4 (SigV4) — Cloudflare R2 ve S3 uyumlu her depo bunu kullanır.
///
/// **Niçin elle yazıldı:** `aws-sdk` ya da `@aws-sdk/client-s3` eklemek, sattığın koda 200+
/// bağımlılık paketi sokardı. İmza algoritması belgeli ve değişmiyor; yüz satırla karşılanıyor.
/// Böylece `npm audit` yüzeyi büyümüyor ve dağıtım paketi küçük kalıyor.

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/// İmzalama anahtarı: gizli anahtardan tarih/bölge/servis zinciriyle türetilir.
/// Gizli anahtarın kendisi hiçbir zaman istekte yer almaz.
export function signingKey(secret, dateStamp, region, service) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), 'aws4_request');
}

/// URI kodlaması: S3 anahtarlarındaki `/` korunur, geri kalan her şey kodlanır.
/// Normal `encodeURIComponent` yıldız ve parantezi bırakır; imza bu farkta bozulur.
export function uriEncode(str, keepSlash = false) {
  let out = '';
  for (const ch of String(str)) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) out += ch;
    else if (ch === '/' && keepSlash) out += '/';
    else for (const b of Buffer.from(ch, 'utf8')) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}

/**
 * Bir isteği imzalar ve gönderilecek başlıkları döndürür.
 *
 * @param {object} o
 * @param {string} o.method   PUT / DELETE / HEAD / GET
 * @param {string} o.host     ör. <hesap>.r2.cloudflarestorage.com
 * @param {string} o.path     '/' ile başlayan anahtar yolu (kova dahil)
 * @param {Buffer|string} o.body
 * @param {string} o.accessKey
 * @param {string} o.secretKey
 * @param {string} [o.region]  R2'de 'auto'
 * @param {object} [o.headers] ek başlıklar (content-type gibi) — imzaya dahil edilir
 * @param {Date}   [o.now]     testler için
 */
export function signRequest(o) {
  const now = o.now || new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = o.region || 'auto';
  const service = 's3';
  const body = o.body == null ? '' : o.body;
  const payloadHash = sha256hex(body);

  const headers = {
    host: o.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)])),
  };
  const signedNames = Object.keys(headers).sort();
  // Başlık değerlerindeki fazla boşluk imzadan önce tek boşluğa indirilir (SigV4 kuralı).
  const canonicalHeaders = signedNames.map((k) => `${k}:${headers[k].trim().replace(/\s+/g, ' ')}\n`).join('');
  const signedHeaders = signedNames.join(';');

  const canonicalRequest = [
    o.method.toUpperCase(),
    uriEncode(o.path, true),
    '', // sorgu dizesi yok
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const signature = crypto.createHmac('sha256', signingKey(o.secretKey, dateStamp, region, service))
    .update(stringToSign).digest('hex');

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${o.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
