import test from 'node:test';
import assert from 'node:assert/strict';
import { signingKey, uriEncode, signRequest } from '../s3_sign.js';

// İmza elle yazıldı (aws-sdk eklememek için). Yanlış imza, R2'nin her isteği reddetmesi demek —
// ve bu ancak canlıda, taşıma başlamayınca fark edilirdi. Bu yüzden algoritma yayımlanmış
// AWS örneğiyle doğrulanıyor.

test('imzalama anahtarı AWS belgelerindeki örnekle birebir aynı', () => {
  // AWS SigV4 belgelerindeki "derive signing key" örneği.
  const key = signingKey('wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', '20150830', 'us-east-1', 'iam');
  assert.equal(key.toString('hex'), 'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9');
});

test('URI kodlaması: S3 anahtar yolundaki eğik çizgi korunur', () => {
  assert.equal(uriEncode('/kova/media/abc.png', true), '/kova/media/abc.png');
});

test('URI kodlaması: encodeURIComponent\'in bıraktığı karakterler de kodlanır', () => {
  // encodeURIComponent bunları bırakır; SigV4 kodlanmasını ister. Fark imzayı bozar.
  assert.equal(uriEncode("*", false), '%2A');
  assert.equal(uriEncode("(", false), '%28');
  assert.equal(uriEncode("'", false), '%27');
  assert.equal(uriEncode("!", false), '%21');
});

test('URI kodlaması: ayrılmamış karakterlere dokunulmaz', () => {
  assert.equal(uriEncode('aZ0-._~', false), 'aZ0-._~');
});

test('URI kodlaması: Türkçe karakter UTF-8 baytlarıyla kodlanır', () => {
  assert.equal(uriEncode('ç', false), '%C3%A7');
});

const base = {
  method: 'PUT', host: 'hesap.r2.cloudflarestorage.com', path: '/kova/media/abc.png',
  body: Buffer.from('merhaba'), accessKey: 'AKIA_TEST', secretKey: 'gizli_anahtar',
  headers: { 'content-type': 'image/png' }, now: new Date('2026-01-15T10:20:30.000Z'),
};

test('imza üretimi: gerekli başlıklar var ve biçim doğru', () => {
  const h = signRequest(base);
  assert.match(h.authorization, /^AWS4-HMAC-SHA256 Credential=AKIA_TEST\/20260115\/auto\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/);
  assert.equal(h['x-amz-date'], '20260115T102030Z');
  // Gövde özeti imzaya dahil: değiştirilmiş gövdeyle istek reddedilir.
  assert.match(h['x-amz-content-sha256'], /^[0-9a-f]{64}$/);
  // İmzalanan başlıklar alfabetik olmalı, yoksa S3 imzayı doğrulayamaz.
  const signed = /SignedHeaders=([a-z0-9;-]+),/.exec(h.authorization)[1].split(';');
  assert.deepEqual(signed, [...signed].sort());
  assert.ok(signed.includes('host') && signed.includes('x-amz-date') && signed.includes('content-type'));
});

test('aynı girdi aynı imzayı üretir', () => {
  assert.equal(signRequest(base).authorization, signRequest(base).authorization);
});

test('gövde değişince imza değişir (değiştirilmiş yükleme geçmez)', () => {
  const a = signRequest(base).authorization;
  const b = signRequest({ ...base, body: Buffer.from('merhabb') }).authorization;
  assert.notEqual(a, b);
});

test('gizli anahtar istekte hiçbir yerde görünmez', () => {
  const h = signRequest(base);
  const dump = JSON.stringify(h);
  assert.ok(!dump.includes('gizli_anahtar'), 'gizli anahtar sızdı');
});

test('yol değişince imza değişir (başka dosyaya yazılamaz)', () => {
  assert.notEqual(
    signRequest(base).authorization,
    signRequest({ ...base, path: '/kova/media/baska.png' }).authorization,
  );
});
