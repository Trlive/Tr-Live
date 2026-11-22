// Ana bayi / Alt bayi kuralları.
//
// Bu testler POSTGRES İSTEMEZ: servis fonksiyonları bir istemci ("c") alıyor, biz de sahte
// bir istemci veriyoruz. Böylece iş kuralları (yetki, iki kat sınırı, bakiye matematiği,
// çift kayıt) CI'nın hızlı `backend` işinde her seferinde sınanıyor.
//
// Sahte istemci SQL'i metninden tanıyor. Bu kırılgan görünür ama kasıtlı: sorgu metni
// değişirse test patlar ve biri gidip sahte istemciyi gerçeğe göre güncellemek zorunda
// kalır. Sessizce yanlış şeyi sınamaktansa gürültülü kırılmak iyidir.
import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
const { transferToSub, setDealerParent } = await import('../src/modules/dealers/dealers.service.js');

/** Bellekte bayi tablosu + sorguları metninden tanıyan sahte istemci. */
function fakeDb(dealers) {
  const rows = new Map(dealers.map((d) => [d.id, { is_active: true, owner_user_id: null, parent_dealer_id: null, ...d }]));
  const ledger = [];
  const audit = [];
  const unknown = [];

  async function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();

    if (s.includes('SELECT COUNT(*)::int AS n FROM dealer_accounts WHERE parent_dealer_id')) {
      const n = [...rows.values()].filter((d) => d.parent_dealer_id === params[0]).length;
      return { rows: [{ n }] };
    }
    if (s.startsWith('SELECT id, name, coin_balance, parent_dealer_id')) {
      const d = rows.get(params[0]);
      // Gerçek sorguda `AND is_active = TRUE` var: kapalı bayi hiç dönmez.
      return { rows: d && d.is_active ? [{ ...d }] : [] };
    }
    if (s.startsWith('SELECT id, parent_dealer_id FROM dealer_accounts')) {
      const d = rows.get(params[0]);
      return { rows: d ? [{ id: d.id, parent_dealer_id: d.parent_dealer_id }] : [] };
    }
    if (s.startsWith('SELECT id FROM dealer_accounts')) {
      const d = rows.get(params[0]);
      return { rows: d ? [{ id: d.id }] : [] };
    }
    if (s.includes('SET coin_balance = coin_balance - $1')) {
      rows.get(params[1]).coin_balance = (BigInt(rows.get(params[1]).coin_balance) - BigInt(params[0])).toString();
      return { rows: [] };
    }
    if (s.includes('SET coin_balance = coin_balance + $1')) {
      rows.get(params[1]).coin_balance = (BigInt(rows.get(params[1]).coin_balance) + BigInt(params[0])).toString();
      return { rows: [] };
    }
    if (s.includes('SET parent_dealer_id = NULL')) {
      rows.get(params[0]).parent_dealer_id = null;
      return { rows: [] };
    }
    if (s.includes('SET parent_dealer_id = $2')) {
      rows.get(params[0]).parent_dealer_id = params[1];
      return { rows: [] };
    }
    if (s.includes('INSERT INTO dealer_transactions')) {
      ledger.push({ dealerId: params[0], type: s.match(/'(sub_transfer_\w+)'/)?.[1], coins: params[2], note: params[3] });
      return { rows: [] };
    }
    if (s.includes('INSERT INTO financial_audit_logs')) { audit.push(params); return { rows: [] }; }

    // Tanımadığı sorguyu SESSİZCE yutmaz: testin sonunda bu liste boş olmalı.
    unknown.push(s.slice(0, 70));
    return { rows: [] };
  }
  const total = () => [...rows.values()].reduce((a, d) => a + BigInt(d.coin_balance), 0n);
  return { query, rows, ledger, audit, unknown, total };
}

const ANA = '11111111-1111-1111-1111-111111111111';
const ALT = '22222222-2222-2222-2222-222222222222';
const YABANCI = '33333333-3333-3333-3333-333333333333';

function tree() {
  return fakeDb([
    { id: ANA, name: 'Ana Bayi', coin_balance: '1000' },
    { id: ALT, name: 'Alt Bayi', coin_balance: '0', parent_dealer_id: ANA, owner_user_id: 'u-alt' },
    { id: YABANCI, name: 'Başka Ana', coin_balance: '500' },
  ]);
}

test('aktarım: ana bayiden düşer, alt bayiye eklenir, toplam Coin DEĞİŞMEZ', async () => {
  const db = tree();
  const before = db.total();
  const out = await transferToSub(db, { parentId: ANA, subId: ALT, coins: 300n, actorId: 'admin' });

  assert.equal(out.parentBalance, '700');
  assert.equal(out.subBalance, '300');
  assert.equal(db.rows.get(ANA).coin_balance, '700');
  assert.equal(db.rows.get(ALT).coin_balance, '300');
  // En önemli iddia: Coin yaratılmadı.
  assert.equal(db.total(), before);
  assert.deepEqual(db.unknown, []);
});

test('aktarım her iki tarafın defterine de yazılır', async () => {
  const db = tree();
  await transferToSub(db, { parentId: ANA, subId: ALT, coins: 100n, actorId: 'admin' });
  assert.equal(db.ledger.length, 2);
  const out = db.ledger.find((x) => x.type === 'sub_transfer_out');
  const inn = db.ledger.find((x) => x.type === 'sub_transfer_in');
  assert.equal(out.dealerId, ANA);
  assert.equal(inn.dealerId, ALT);
  assert.equal(out.coins, '100');
  assert.equal(inn.coins, '100');
  assert.equal(db.audit.length, 1, 'finansal denetim kaydı yazılmalı');
});

test('aktarım: alt bayinin sahibi anlık bildirim için döner', async () => {
  const db = tree();
  const out = await transferToSub(db, { parentId: ANA, subId: ALT, coins: 10n, actorId: 'admin' });
  assert.equal(out.subOwnerId, 'u-alt');
});

test('aktarım: BAŞKASININ alt bayisine gönderilemez', async () => {
  const db = tree();
  await assert.rejects(
    () => transferToSub(db, { parentId: YABANCI, subId: ALT, coins: 10n, actorId: 'a' }),
    /alt bayiniz değil/,
  );
  assert.equal(db.total(), 1500n, 'reddedilen aktarımda bakiye oynamamalı');
});

test('aktarım: alt bayi kendi altına aktarım yapamaz (iki kat kuralı)', async () => {
  const db = tree();
  await assert.rejects(
    () => transferToSub(db, { parentId: ALT, subId: ANA, coins: 10n, actorId: 'a' }),
    /kendi altına aktarım yapamaz/,
  );
});

test('aktarım: kendine, sıfıra, eksiye ve bakiyenin üstüne izin yok', async () => {
  const db = tree();
  await assert.rejects(() => transferToSub(db, { parentId: ANA, subId: ANA, coins: 5n, actorId: 'a' }), /kendine/);
  await assert.rejects(() => transferToSub(db, { parentId: ANA, subId: ALT, coins: 0n, actorId: 'a' }), /0 olamaz/);
  await assert.rejects(() => transferToSub(db, { parentId: ANA, subId: ALT, coins: -5n, actorId: 'a' }), /0 olamaz/);
  await assert.rejects(() => transferToSub(db, { parentId: ANA, subId: ALT, coins: 1001n, actorId: 'a' }), /yetersiz/);
  assert.equal(db.total(), 1500n);
  assert.equal(db.ledger.length, 0, 'başarısız aktarım defter kaydı bırakmaz');
});

test('aktarım: kapalı bayiye gönderilemez', async () => {
  const db = tree();
  db.rows.get(ALT).is_active = false;
  await assert.rejects(() => transferToSub(db, { parentId: ANA, subId: ALT, coins: 10n, actorId: 'a' }), /bulunamadı/);
});

test('ebeveyn atama: alt bayi, başkasına ana bayi OLAMAZ (üç kat engellenir)', async () => {
  const db = tree();
  await assert.rejects(
    () => setDealerParent(db, { dealerId: YABANCI, parentId: ALT }),
    /en fazla iki kat/,
  );
  assert.equal(db.rows.get(YABANCI).parent_dealer_id, null);
});

test('ebeveyn atama: alt bayisi olan bayi, alt bayi yapılamaz', async () => {
  const db = tree();
  await assert.rejects(
    () => setDealerParent(db, { dealerId: ANA, parentId: YABANCI }),
    /alt bayileri var/,
  );
});

test('ebeveyn atama: bayi kendi ana bayisi olamaz', async () => {
  const db = tree();
  await assert.rejects(() => setDealerParent(db, { dealerId: YABANCI, parentId: YABANCI }), /kendi ana bayisi/);
});

test('ebeveyn atama: null bağı kaldırır, bayi yeniden ana bayi olur', async () => {
  const db = tree();
  const out = await setDealerParent(db, { dealerId: ALT, parentId: null });
  assert.equal(out.parentId, null);
  assert.equal(db.rows.get(ALT).parent_dealer_id, null);
  // Artık ana bayi olduğu için kendi altına bayi alabilir.
  await setDealerParent(db, { dealerId: YABANCI, parentId: ALT });
  assert.equal(db.rows.get(YABANCI).parent_dealer_id, ALT);
});

test('ebeveyn atama: olmayan bayi ve olmayan ana bayi 404', async () => {
  const db = tree();
  await assert.rejects(() => setDealerParent(db, { dealerId: 'yok', parentId: ANA }), /Bayi bulunamadı/);
  await assert.rejects(() => setDealerParent(db, { dealerId: YABANCI, parentId: 'yok' }), /Ana bayi bulunamadı/);
});
