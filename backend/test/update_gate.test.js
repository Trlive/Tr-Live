import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isWebPanelRequest, WEB_PANEL_PREFIXES } from '../src/middleware/security/update_gate.js';

test('web paneli başlığı yalnızca panelin kendi yollarında muaf tutar', () => {
  assert.equal(isWebPanelRequest('web-panel', '/admin/users'), true);
  assert.equal(isWebPanelRequest('web-panel', '/auth/login'), true);
  assert.equal(isWebPanelRequest('web-panel', '/agency-center/overview'), true);
  assert.equal(isWebPanelRequest('web-panel', '/me'), true);
});

test('eski uygulama başlığı taklit etse bile uygulama yollarında muafiyet YOK', () => {
  for (const p of ['/rooms', '/rooms/abc/gifts', '/gifts/send', '/wallet', '/usd/withdraw', '/store/items', '/pk/start']) {
    assert.equal(isWebPanelRequest('web-panel', p), false, p);
  }
});

test('başlık yoksa ya da farklıysa muafiyet yok; önek tam eşleşmelidir', () => {
  assert.equal(isWebPanelRequest(undefined, '/admin/users'), false);
  assert.equal(isWebPanelRequest('mobile', '/admin/users'), false);
  assert.equal(isWebPanelRequest('web-panel', '/administrator'), false); // "admin" ile başlasa da tam parça değil
  assert.equal(isWebPanelRequest('web-panel', ''), false);
  assert.equal(isWebPanelRequest('web-panel', undefined), false);
});

test('web panelinin kaynak kodunda çağırdığı HER /api/<parça> izin listesinde (panel bozulmasın)', () => {
  const root = new URL('../../web/panel/src/', import.meta.url).pathname;
  const used = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js)$/.test(e.name)) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/["'`]\/api\/([a-z0-9-]+)/g)) used.add(m[1]);
      }
    }
  };
  walk(root);
  assert.ok(used.size >= 8, `panel kaynağından yol parçası çıkarılamadı (${used.size})`);
  const missing = [...used].filter((u) => !WEB_PANEL_PREFIXES.includes(u));
  assert.deepEqual(missing, [], `Panel şu API öneklerini kullanıyor ama update_gate.js listesinde yok: ${missing.join(', ')}`);
});
