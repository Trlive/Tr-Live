import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('../../deploy/oracle/backup.sh', import.meta.url).pathname;
const src = fs.readFileSync(SCRIPT, 'utf8');
const helpers = src.slice(src.indexOf('# <backup-helpers>'), src.indexOf('# </backup-helpers>'));

// Sahte docker ve rclone: gerçek sunucu ya da internet olmadan betiğin tüm yollarını çalıştırır.
function setup({ extraEnv = null, oldBackups = 0 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin); fs.mkdirSync(path.join(root, 'env')); fs.mkdirSync(path.join(root, 'backups'));
  fs.writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
case "$FAKE_DOCKER" in
  fail) echo "pg_dump: bağlantı hatası" >&2; exit 1 ;;
  tiny) printf x ;;
  *) i=0; while [ $i -lt 300 ]; do echo "INSERT INTO t VALUES ($i, 'satır $i');"; i=$((i+1)); done ;;
esac
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'rclone'), `#!/bin/sh
echo "ARGS: $*" >> "$RCLONE_LOG"
echo "ENV: $RCLONE_CONFIG_OFFSITE_TYPE|$RCLONE_CONFIG_OFFSITE_ENDPOINT|$RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID|$RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY|$RCLONE_CONFIG_OFFSITE_REGION" >> "$RCLONE_LOG"
case "$1" in copyto) [ "$FAKE_RCLONE_FAIL" = copy ] && exit 1 ;; delete) [ "$FAKE_RCLONE_FAIL" = delete ] && exit 1 ;; esac
exit 0
`, { mode: 0o755 });
  if (extraEnv !== null) fs.writeFileSync(path.join(root, 'env/extra.env'), extraEnv);
  for (let i = 0; i < oldBackups; i += 1) {
    const f = path.join(root, `backups/trlive-2026-10-${String(10 + i).padStart(2, '0')}.sql.gz`);
    fs.writeFileSync(f, 'eski'); const t = new Date(Date.UTC(2026, 9, 10 + i)); fs.utimesSync(f, t, t);
  }
  const log = path.join(root, 'rclone.log');
  const run = (env = {}) => {
    const r = spawnSync('bash', [SCRIPT], { encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH}`, TRLIVE_ROOT: root, BACKUP_STAMP: '2026-11-30', RCLONE_LOG: log, ...env } });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  return { root, log, run, files: () => fs.readdirSync(path.join(root, 'backups')).sort(), rclone: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '') };
}
const S3 = "BACKUP_REMOTE='https://s3.example.com kova1 AKIA123 gizli/+=anahtar eu-1'\n";

test('bash sözdizimi', () => {
  assert.equal(spawnSync('bash', ['-n', SCRIPT]).status, 0);
});

test('yerel yedek alınır, uzak ayar yoksa uzak kopya denenmez; son 7 yedek saklanır', () => {
  const t = setup({ oldBackups: 9 });
  const r = t.run();
  assert.equal(r.code, 0, r.out);
  const files = t.files();
  assert.ok(files.includes('trlive-2026-11-30.sql.gz'));
  assert.equal(files.length, 7); // 9 eski + 1 yeni → en yeni 7
  assert.ok(!files.includes('trlive-2026-10-10.sql.gz')); // en eskiler silindi
  assert.equal(t.rclone(), ''); // rclone hiç çağrılmadı
  assert.equal(spawnSync('gzip', ['-t', path.join(t.root, 'backups/trlive-2026-11-30.sql.gz')]).status, 0);
});

test('pg_dump başarısızsa hata verir, dosya bırakmaz ve ESKİ YEDEKLERE DOKUNMAZ', () => {
  const t = setup({ oldBackups: 7 });
  const r = t.run({ FAKE_DOCKER: 'fail' });
  assert.equal(r.code, 1);
  assert.match(r.out, /pg_dump başarısız/);
  const files = t.files();
  assert.equal(files.length, 7);
  assert.ok(!files.some((f) => f.endsWith('.tmp') || f.includes('2026-11-30')));
});

test('şüpheli derecede küçük dump yedek sayılmaz', () => {
  const t = setup({ oldBackups: 7 });
  const r = t.run({ FAKE_DOCKER: 'tiny' });
  assert.equal(r.code, 1);
  assert.match(r.out, /şüpheli derecede küçük/);
  assert.equal(t.files().length, 7);
});

test('uzak yedek alanı tamamsa rclone ile uzak kopya ve 30 günden eski temizliği yapılır; gizli anahtar komut satırında görünmez', () => {
  const t = setup({ extraEnv: S3 });
  const r = t.run();
  assert.equal(r.code, 0, r.out);
  const log = t.rclone();
  assert.match(log, /ARGS: copyto .*trlive-2026-11-30\.sql\.gz offsite:kova1\/trlive\/trlive-2026-11-30\.sql\.gz --s3-no-check-bucket/);
  assert.match(log, /ARGS: delete offsite:kova1\/trlive --min-age 30d --s3-no-check-bucket/);
  assert.match(log, /ENV: s3\|https:\/\/s3\.example\.com\|AKIA123\|gizli\/\+=anahtar\|eu-1/); // bilgiler ortam değişkeninden
  assert.ok(!/ARGS:.*gizli/.test(log)); // komut satırında yok
  assert.match(r.out, /Uzak kopya tamam/);
});

test('bölge boş bırakılabilir (4 parça yeter)', () => {
  const t = setup({ extraEnv: "BACKUP_REMOTE='https://s3.example.com kova1 AKIA123 gizli'\n" });
  const r = t.run();
  assert.equal(r.code, 0, r.out);
  assert.match(t.rclone(), /ENV: s3\|https:\/\/s3\.example\.com\|AKIA123\|gizli\|$/m);
});

test('uzak kopya yüklenemezse çıkış kodu 3; yerel yedek yine duruyor', () => {
  const t = setup({ extraEnv: S3 });
  const r = t.run({ FAKE_RCLONE_FAIL: 'copy' });
  assert.equal(r.code, 3);
  assert.match(r.out, /uzak kopya yüklenemedi/);
  assert.ok(t.files().includes('trlive-2026-11-30.sql.gz'));
  assert.ok(!/ARGS: delete/.test(t.rclone())); // yükleme olmadan eski yedekler silinmez
});

test('eksik S3 ayarı uyarı verir (çıkış 3), rclone çağrılmaz; yerel yedek alınır', () => {
  const t = setup({ extraEnv: "BACKUP_REMOTE='https://s3.example.com kova1'\n" });
  const r = t.run();
  assert.equal(r.code, 3);
  assert.match(r.out, /uzak yedek ayarı eksik/);
  assert.equal(t.rclone(), '');
  assert.ok(t.files().includes('trlive-2026-11-30.sql.gz'));
});

test('env_get tek/çift tırnaklı ve tırnaksız değerleri okur, olmayan anahtar için boş döner', () => {
  const f = path.join(os.tmpdir(), `env-${process.pid}`);
  fs.writeFileSync(f, "A='bir'\nB=\"iki\"\nC=uc\nA='son'\n");
  const get = (k) => spawnSync('bash', ['-c', `${helpers}\nenv_get ${k} "${f}"`], { encoding: 'utf8' }).stdout;
  assert.equal(get('A'), 'son'); // son değer geçerli
  assert.equal(get('B'), 'iki');
  assert.equal(get('C'), 'uc');
  assert.equal(get('YOK'), '');
});
