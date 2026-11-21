import test from 'node:test';
import assert from 'node:assert/strict';
import { blankSql, checkPluginSql, createdTables, tablesOf } from '../src/modules/games/sandbox/sql_guard.js';

const MINE = ['g_tombala_rounds', 'g_tombala_scores'];
const okq = (sql) => checkPluginSql(sql, MINE);

test('kendi tablosuna erişim serbest', () => {
  assert.deepEqual(okq('SELECT * FROM g_tombala_rounds WHERE id = $1'), { ok: true });
  assert.deepEqual(okq('INSERT INTO g_tombala_scores(user_id, score) VALUES($1,$2)'), { ok: true });
  assert.deepEqual(okq('UPDATE g_tombala_rounds SET state = $1 WHERE id = $2'), { ok: true });
  assert.deepEqual(okq('DELETE FROM g_tombala_scores WHERE user_id = $1'), { ok: true });
});

test('başka tabloya erişim reddedilir — asıl mesele bu', () => {
  for (const sql of [
    'SELECT coins FROM users WHERE id = $1',
    'UPDATE users SET coins = coins + 1000000 WHERE id = $1',
    'SELECT * FROM wallet_transactions',
    'DELETE FROM admin_sessions',
    'INSERT INTO users(username, display_name) VALUES($1,$2)',
  ]) {
    const r = okq(sql);
    assert.equal(r.ok, false, `geçti: ${sql}`);
    assert.match(r.reason, /yetkiniz yok/);
  }
});

test('JOIN ile yan kapıdan girilemez', () => {
  const r = okq('SELECT s.score, u.username FROM g_tombala_scores s JOIN users u ON u.id = s.user_id');
  assert.equal(r.ok, false);
  assert.match(r.reason, /users/);
});

test('alt sorgu da denetlenir', () => {
  assert.equal(okq('SELECT * FROM g_tombala_rounds WHERE id IN (SELECT id FROM users)').ok, false);
});

test('CTE adı tablo sanılmaz ama içindeki gerçek tablo denetlenir', () => {
  assert.deepEqual(okq('WITH son AS (SELECT * FROM g_tombala_rounds) SELECT * FROM son'), { ok: true });
  assert.equal(okq('WITH son AS (SELECT * FROM users) SELECT * FROM son').ok, false);
});

test('zincirleme komut (;) reddedilir', () => {
  assert.equal(okq('SELECT 1 FROM g_tombala_rounds; DROP TABLE users').ok, false);
  // Sondaki tek noktalı virgül sorun değil.
  assert.deepEqual(okq('SELECT 1 FROM g_tombala_rounds;'), { ok: true });
});

test('şema değiştiren komutlar çalışma anında yasak', () => {
  for (const sql of ['DROP TABLE g_tombala_rounds', 'ALTER TABLE g_tombala_rounds ADD COLUMN x int', 'CREATE TABLE y(a int)', 'TRUNCATE g_tombala_rounds', 'GRANT ALL ON users TO public']) {
    assert.equal(okq(sql).ok, false, `geçti: ${sql}`);
  }
});

test('sistem nesneleri yasak', () => {
  assert.equal(okq('SELECT * FROM pg_catalog.pg_tables').ok, false);
  assert.equal(okq('SELECT * FROM information_schema.tables').ok, false);
  assert.equal(okq("SELECT current_setting('x') FROM g_tombala_rounds").ok, false);
  assert.equal(okq('SELECT pg_sleep(100) FROM g_tombala_rounds').ok, false);
});

test('dize içindeki tablo adı erişim sayılmaz (yanlış alarm olmasın)', () => {
  assert.deepEqual(okq("INSERT INTO g_tombala_scores(note) VALUES('from users join wallet_transactions')"), { ok: true });
});

test('yorum arkasına komut saklanamaz', () => {
  // Yorum silinir; arkasındaki gerçek tablo yine görülür.
  assert.equal(okq('SELECT * FROM /* g_tombala_rounds */ users').ok, false);
  assert.deepEqual(okq('SELECT * FROM g_tombala_rounds -- users\n'), { ok: true });
});

test('iç içe blok yorum doğru kapanır', () => {
  // İç içe yorumu saymasaydık, ilk "*/" ile erken kapanır ve "users" yorum sanılırdı.
  assert.deepEqual(okq('SELECT 1 FROM g_tombala_rounds /* dış /* iç */ hâlâ yorum */'), { ok: true });
});

test("dolar tırnak ('$$') içeriği kod sanılmaz", () => {
  assert.deepEqual(okq('INSERT INTO g_tombala_scores(note) VALUES($tag$ select from users $tag$)'), { ok: true });
});

test("'' kaçışı dizeyi erken bitirmez", () => {
  assert.deepEqual(okq("INSERT INTO g_tombala_scores(note) VALUES('it''s from users')"), { ok: true });
});

test('blankSql uzunluğu korur: konumlar kaymaz', () => {
  const s = "SELECT 'abc' /* yorum */ FROM t -- son";
  assert.equal(blankSql(s).length, s.length);
});

test('tablesOf: takma ad ve şema', () => {
  assert.deepEqual(tablesOf('SELECT * FROM g_a r JOIN g_b b ON b.id = r.id').sort(), ['g_a', 'g_b']);
  assert.deepEqual(tablesOf('SELECT * FROM public.g_a'), ['public.g_a']);
});

test('createdTables: kurulum SQL\'inden sahiplik çıkarılır', () => {
  const sql = `
    CREATE TABLE IF NOT EXISTS g_tombala_rounds(id serial primary key);
    CREATE INDEX idx_x ON g_tombala_rounds(id);
    CREATE TABLE g_tombala_scores(user_id uuid);
    -- CREATE TABLE yorumda_olan(x int);
  `;
  assert.deepEqual(createdTables(sql).sort(), ['g_tombala_rounds', 'g_tombala_scores']);
});

test('izin listesi boşsa hiçbir tabloya erişilemez', () => {
  assert.equal(checkPluginSql('SELECT * FROM g_tombala_rounds', []).ok, false);
});
