import test from 'node:test';
import assert from 'node:assert/strict';
import { renderActivitiesPage, renderErrorPage, safeVersion, ACTIVITIES } from '../src/room_activities_page.js';

const ROOM = '123e4567-e89b-12d3-a456-426614174000';

test('sayfa nonce, oda ve kart içerir; dış adres yüklemez', () => {
  const html = renderActivitiesPage({ roomId: ROOM, appVersion: '2.91.1', nonce: 'abc123' });
  assert.match(html, /<script nonce="abc123">/);
  assert.ok(html.includes(ROOM));
  for (const a of ACTIVITIES) assert.ok(html.includes(a.title));
  assert.doesNotMatch(html, /src="https?:|href="https?:/);
  assert.match(html, /TRLive\.postMessage/);
});

test('sürüm başlığı yalnızca sürüm biçimindeyse kullanılır', () => {
  assert.equal(safeVersion('2.91.1'), '2.91.1');
  assert.equal(safeVersion('1"</script><script>alert(1)'), '');
  assert.equal(safeVersion(undefined), '');
});

test('hata sayfası metni kaçırır', () => {
  assert.ok(!renderErrorPage('<img onerror=x>', 'n').includes('<img'));
});

test('ilk mini oyun listede ve ücretsiz (coin/bahis içermez)', () => {
  const g = ACTIVITIES.find((a) => a.game);
  assert.equal(g.id, 'memory');
  const html = renderActivitiesPage({ roomId: ROOM, appVersion: '', nonce: 'n' });
  assert.ok(html.includes('data-game="1"') && html.includes('startMemory'));
  assert.doesNotMatch(html, /fetch\('\/api\/(gift|games|lucky)/);
});
