import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('../../deploy/oracle/', import.meta.url);
const installSh = fs.readFileSync(new URL('install.sh', ROOT), 'utf8');
const helpers = installSh.slice(installSh.indexOf('# <turn-helpers>'), installSh.indexOf('# </turn-helpers>'));

// Yardımcı fonksiyonları (install.sh'ın "set -euo pipefail" kipinde) çalıştırır.
function sh(body) {
  const r = spawnSync('bash', ['-c', `set -euo pipefail\n${helpers}\n${body}`], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'turn-'));

test('install.sh ve firewall.sh bash sözdizimi denetiminden geçer', () => {
  for (const f of ['install.sh', 'firewall.sh']) {
    const r = spawnSync('bash', ['-n', fileOf(f)], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
});
function fileOf(f) { return new URL(f, ROOT).pathname; }

test('TURN varsayılan AÇIK; yalnızca extra.env içinde TURN_ENABLED=0 yazılıysa kapalı', () => {
  const d = tmp();
  const check = (content) => {
    const f = path.join(d, 'extra.env');
    if (content === null) fs.rmSync(f, { force: true }); else fs.writeFileSync(f, content);
    return sh(`if turn_requested "${f}"; then echo yes; else echo no; fi`).out.trim();
  };
  assert.equal(check(null), 'yes'); // dosya yok → varsayılan açık
  assert.equal(check(''), 'yes');
  assert.equal(check("A='x'\n"), 'yes');
  assert.equal(check("TURN_ENABLED='1'\n"), 'yes');
  assert.equal(check("TURN_ENABLED=''\n"), 'yes');
  assert.equal(check("TURN_ENABLED='0'\n"), 'no');
  assert.equal(check('TURN_ENABLED=0\n'), 'no');
  assert.equal(check("A='x'\nTURN_ENABLED='0'\nB='y'\n"), 'no');
  assert.equal(check("TURN_ENABLED='00'\n"), 'yes'); // yalnızca tam "0" kapatır
  assert.equal(check("XTURN_ENABLED='0'\n"), 'yes');
});

test('sertifika yolu: hem .crt hem .key doluysa konteyner yolu döner; aksi halde boş', () => {
  const vol = tmp();
  const host = 'turn.130-61-12-34.sslip.io';
  const dir = path.join(vol, 'caddy/certificates/acme-v02.api.letsencrypt.org-directory', host);
  const run = () => sh(`turn_cert_path "${vol}" "${host}"`);
  assert.equal(run().out.trim(), ''); // sertifika klasörü yok
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${host}.crt`), 'CERT');
  assert.equal(run().out.trim(), ''); // anahtar yok
  fs.writeFileSync(path.join(dir, `${host}.key`), '');
  assert.equal(run().out.trim(), ''); // anahtar boş
  fs.writeFileSync(path.join(dir, `${host}.key`), 'KEY');
  const r = run();
  assert.equal(r.code, 0);
  assert.equal(r.out.trim(), `/caddy-data/caddy/certificates/acme-v02.api.letsencrypt.org-directory/${host}/${host}.crt`);
  assert.equal(sh(`turn_cert_path "" "${host}"`).out.trim(), ''); // Caddy hacmi henüz yok
});

test('sertifika başka bir sağlayıcının klasöründeyse de bulunur (ZeroSSL)', () => {
  const vol = tmp();
  const host = 'turn.1-2-3-4.sslip.io';
  const dir = path.join(vol, 'caddy/certificates/acme.zerossl.com-v2-DV90', host);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${host}.crt`), 'C');
  fs.writeFileSync(path.join(dir, `${host}.key`), 'K');
  assert.match(sh(`turn_cert_path "${vol}" "${host}"`).out.trim(), /^\/caddy-data\/caddy\/certificates\/acme\.zerossl\.com-v2-DV90\/turn\.1-2-3-4\.sslip\.io\/turn\.1-2-3-4\.sslip\.io\.crt$/);
});

test('LiveKit turn bloğu beklenen anahtarları yazar', () => {
  const out = sh('turn_block turn.1-2-3-4.sslip.io /caddy-data/x/a.crt').out;
  assert.equal(out, 'turn:\n  enabled: true\n  domain: turn.1-2-3-4.sslip.io\n  tls_port: 5349\n  udp_port: 3478\n  cert_file: /caddy-data/x/a.crt\n  key_file: /caddy-data/x/a.key\n');
});

test('sıra güvencesi: TURN\'süz ayar yedeği, TURN bloğu eklenmeden ÖNCE alınır; TURN\'süz dönüş yedeği kullanır', () => {
  const backup = installSh.indexOf('cp "$ENVD/livekit.yaml" "$ENVD/livekit.yaml.noturn"');
  const firstAppend = installSh.indexOf('turn_block "$TURN_HOST" "$CERT" >> "$ENVD/livekit.yaml"');
  assert.ok(backup > 0 && firstAppend > backup);
  assert.ok(installSh.includes('cp "$ENVD/livekit.yaml.noturn" "$ENVD/livekit.yaml"')); // geri dönüş
  assert.ok(installSh.includes('touch "$STATE/turn-failed"')); // sonsuz yeniden deneme yok
});

test('güvenlik duvarı TURN kapılarını açar', () => {
  const fw = fs.readFileSync(new URL('firewall.sh', ROOT), 'utf8');
  assert.match(fw, /5349\/tcp 3478\/udp/);
  assert.match(fw, /allow -p tcp --dport 5349/);
  assert.match(fw, /allow -p udp --dport 3478/);
});
