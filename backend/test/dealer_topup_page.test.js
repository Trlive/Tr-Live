import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDealerTopupPage } from '../src/dealer_topup_page.js';

test('bayi sayfası nonce, kanal ve doğru API yollarını kullanır', () => {
  const html = renderDealerTopupPage({ appVersion: '2.92.0', nonce: 'abc' });
  assert.match(html, /<script nonce="abc">/);
  assert.match(html, /\/api\/dealer\/topup-requests/);
  assert.match(html, /Idempotency-Key/);
  assert.match(html, /TRLive\.postMessage/);
  assert.doesNotMatch(html, /src="https?:|innerHTML/);
});
