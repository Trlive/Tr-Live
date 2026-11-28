// Dolar cüzdanı (uygulamada "Fasulye": 1 Fasulye = 1 dolar = 100 sent): yayıncı ve ajans sahiplerinin maaş / prim bakiyesi
// ve bu bakiyeden yapılan çıkışlar:
//  0) Coin'e çevirme: Fasulye anında düşer, karşılığı Coin (ayardaki kurdan) kullanıcının kendisine ya da seçtiği başka
//     bir kullanıcıya yüklenir. Geri alınamaz.
//  1) Admin'e gönderim (çekim talebi): tutar hemen bakiyeden düşer ve talep "bekliyor" olur; admin ödeyince "ödendi",
//     reddederse (ya da kullanıcı vazgeçerse) tutar cüzdana geri döner.
//  2) Coin bayisine gönderim: tutar anında düşer, karşılığı Coin (ayardaki kurdan) bayinin satış stokuna eklenir.
//     Geri alınamaz; bayi parayı kullanıcıya platform dışında öder.
// Kurallar: bütün tutarlar sent (BigInt); bakiye asla eksiye düşmez (koşullu UPDATE + veritabanı CHECK); her hareket
// usd_transactions defterine balance_after ile yazılır; aynı kaynak (özet / talep) iki kez işlenemez (tekil indeks).
import crypto from 'node:crypto';
import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { getConfig } from '../system/app_config.service.js';
import { BROADCASTER_CONTRACT_SQL, agencyContractSql } from '../contracts/contracts.rules.js';

export const CREDIT_TYPES = ['salary', 'agency_bonus', 'assistant_share', 'referral_bonus'];

export function usdSettings(cfg) {
  return {
    enabled: cfg.usdEnabled !== false,
    withdrawMinCents: BigInt(cfg.usdWithdrawMinCents),
    dealerMinCents: BigInt(cfg.usdDealerMinCents),
    coinsPerUsd: BigInt(cfg.usdDealerCoinsPerUsd),
    exchangeCoinsPerUsd: BigInt(cfg.usdCoinsPerUsd),
    // "Diğerleri için" (başka kullanıcıya Coin gönderme) kuru; 0 = kendine çevirmeyle aynı (YoHo: kendine 8.800, başkasına 9.600 / $).
    sendCoinsPerUsd: BigInt(cfg.usdCoinsPerUsdOthers || 0) > 0n ? BigInt(cfg.usdCoinsPerUsdOthers) : BigInt(cfg.usdCoinsPerUsd),
    exchangeMinCents: BigInt(cfg.usdExchangeMinCents),
  };
}
export const settingsJson = (s) => ({
  enabled: s.enabled, withdrawMinCents: String(s.withdrawMinCents), dealerMinCents: String(s.dealerMinCents), coinsPerUsd: String(s.coinsPerUsd),
  exchangeCoinsPerUsd: String(s.exchangeCoinsPerUsd), sendCoinsPerUsd: String(s.sendCoinsPerUsd), exchangeMinCents: String(s.exchangeMinCents),
});
/** Sent tutarını Fasulye metnine çevirir (1250n → "12,5"; 1000n → "10"). */
export const beansText = (cents) => {
  const n = BigInt(cents);
  const frac = String(n % 100n).padStart(2, '0').replace(/0+$/, '');
  return `${n / 100n}${frac ? `,${frac}` : ''}`;
};

/** Sent tutarını doğrular: pozitif tam sayı (en çok 12 hane). */
export function centsOf(value, field = 'Tutar') {
  const s = typeof value === 'number' && Number.isInteger(value) ? String(value) : String(value ?? '').trim();
  if (!/^\d{1,12}$/.test(s) || BigInt(s) <= 0n) throw fail(`${field} geçersiz.`);
  return BigInt(s);
}
/** Gönderilen dolar tutarının Coin karşılığı (aşağı yuvarlanır; 1 dolar = coinsPerUsd Coin). */
export const coinsFor = (cents, coinsPerUsd) => (BigInt(cents) * BigInt(coinsPerUsd)) / 100n;

// Bakiyeyi değiştirir ve deftere yazar. [c] bir işlem (transaction) istemcisi olmalıdır.
async function move(c, { userId, cents, type, refType = null, refId = null, note = null, actorId = null }) {
  const amount = BigInt(cents);
  if (amount === 0n) throw fail('Tutar sıfır olamaz.');
  const r = amount > 0n
    ? await c.query(`UPDATE users SET usd_cents = usd_cents + $2, updated_at = NOW() WHERE id = $1 RETURNING usd_cents`, [userId, amount.toString()])
    : await c.query(`UPDATE users SET usd_cents = usd_cents - $2, updated_at = NOW() WHERE id = $1 AND usd_cents >= $2 RETURNING usd_cents`, [userId, (-amount).toString()]);
  if (!r.rows[0]) {
    if (amount > 0n) throw fail('Kullanıcı bulunamadı.', 404);
    throw fail('Bakiyeniz yetersiz.', 409);
  }
  const after = BigInt(r.rows[0].usd_cents);
  await c.query(
    `INSERT INTO usd_transactions(user_id, type, amount_cents, balance_after, ref_type, ref_id, note, created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [userId, type, amount.toString(), after.toString(), refType, refId, note, actorId],
  );
  return after;
}
export const creditUsd = (c, o) => { if (BigInt(o.cents) <= 0n) throw fail('Tutar geçersiz.'); return move(c, o); };
export const debitUsd = (c, o) => { if (BigInt(o.cents) <= 0n) throw fail('Tutar geçersiz.'); return move(c, { ...o, cents: -BigInt(o.cents) }); };

// Özet türü → tablo, defter türü, tutar sütunu ve alıcı (owner: ajans sahibi).
const STATEMENTS = {
  host: { table: 'host_statements', type: 'salary', amount: 'salary_cents', owner: false },
  agency: { table: 'agency_statements', type: 'agency_bonus', amount: 'owner_cents', owner: true },
  assistant: { table: 'assistant_statements', type: 'assistant_share', amount: 'amount_cents', owner: false },
  referral: { table: 'referral_statements', type: 'referral_bonus', amount: 'amount_cents', owner: true },
};

/** Dönem "cüzdan dönemi" mi (özetleri ödenirken tutar cüzdana yatırılır). */
export async function isWalletPeriod(c, periodId) {
  return (await c.query(`SELECT wallet_mode FROM payout_periods WHERE id = $1`, [periodId])).rows[0]?.wallet_mode === true;
}

/** Tek bir hesap özetinin tutarını alıcısının cüzdanına yatırır (özetin durumunu DEĞİŞTİRMEZ). Yatırılan tutarı döndürür. */
export async function creditStatement(c, kind, row, adminId) {
  const st = STATEMENTS[kind];
  const cents = BigInt(row[st.amount] ?? 0);
  if (cents <= 0n) return 0n;
  const userId = st.owner ? (await c.query(`SELECT owner_id FROM agencies WHERE id = $1`, [row.agency_id])).rows[0]?.owner_id : row.user_id;
  if (!userId) throw fail('Özetin alıcısı bulunamadı.', 409);
  await creditUsd(c, { userId, cents, type: st.type, refType: st.table, refId: row.id, actorId: adminId });
  return cents;
}

/**
 * Dönemin bekleyen hesap özetlerini cüzdanlara yatırır ve "ödendi" yapar (dönem kapatılırken ve toplu ödemede çağrılır).
 * Yayıncı maaşı yayıncıya, ajans primi ve davet primi ajans sahibine, asistan payı asistana gider.
 * Kimlik doğrulaması (KYC) onaylı olmayan yayıncının maaşı YATIRILMAZ; özet bekler (admin KYC'yi onaylayınca öder).
 * kinds: yalnızca bu türler (verilmezse hepsi).
 */
/**
 * Maaşın ödenebilmesi için kullanıcıda aranan koşul — SQL parçası, "u" takma adlı users ile.
 *
 * TEK YERDE olmasının sebebi: bu koşul iki ayrı sorguda kullanılıyor (cüzdana yatırma ve
 * özeti "ödendi" işaretleme). İkisi ayrışırsa, koşulu birinde tutup diğerinde tutmayan bir
 * yayıncının özeti "ödendi" olur ama parası hiç yatmaz — yani maaş sessizce kaybolur.
 * Aynı metni iki yere yazmak bu hatayı davet ediyordu.
 *
 * Koşul: telefon bağlı ve doğrulanmış. Kimlik fotoğrafı istenmiyor (sahibinin kararı);
 * geri kalan doğrulamayı ödemeyi yapacak aracı şirket belirleyecek.
 */
// + Sözleşme kapısı (contracts.rules.js): yayıncı sözleşmesi yayımlandıysa en az bir sürümü onaylanmış olmalı. Dönem kapanışı,
// toplu ödeme ve ay içi avans bu koşulu kullanır; onaylanmamış maaş kaybolmaz, onaydan sonra yatar.
export const SALARY_PAYABLE_SQL = `u.phone IS NOT NULL AND u.phone_verified_at IS NOT NULL AND ${BROADCASTER_CONTRACT_SQL}`;

export async function creditPeriod(c, periodId, adminId, { kinds = null, note = 'Dolar cüzdanına yatırıldı' } = {}) {
  const sets = [
    // Maaş ödemesinin kapısı: TELEFON DOĞRULAMASI.
    //
    // Eskiden `u.kyc_status = 'approved'` idi, yani her yayıncı için yöneticinin kimlik
    // onayı gerekiyordu. Sahibinin kararı: kimlik fotoğrafı istenmeyecek, telefon bağlamak
    // yeterli; geri kalan doğrulamayı ödemeyi yapacak aracı şirket belirleyecek.
    //
    // `kyc_status` sütunu KALDIRILMADI: aracı şirketin ileride isteyebileceği doğrulama
    // için yerinde duruyor. Burada yalnızca maaşın cüzdana geçme koşulu değişti.
    //
    // Telefonu doğrulanmamış yayıncının maaşı KAYBOLMUYOR: özet 'pending' kalıyor ve
    // telefonunu doğruladıktan sonraki çalışmada ödeniyor.
    { kind: 'host', table: 'host_statements', type: 'salary', sql: `SELECT s.id, s.user_id, s.salary_cents AS cents FROM host_statements s JOIN users u ON u.id = s.user_id WHERE s.period_id = $1 AND s.status = 'pending' AND s.salary_cents > 0 AND ${SALARY_PAYABLE_SQL}` },
    { kind: 'agency', table: 'agency_statements', type: 'agency_bonus', sql: `SELECT s.id, a.owner_id AS user_id, s.owner_cents AS cents FROM agency_statements s JOIN agencies a ON a.id = s.agency_id WHERE s.period_id = $1 AND s.status = 'pending' AND s.owner_cents > 0 AND ${agencyContractSql('a.owner_id')}` },
    { kind: 'assistant', table: 'assistant_statements', type: 'assistant_share', sql: `SELECT s.id, s.user_id, s.amount_cents AS cents FROM assistant_statements s WHERE s.period_id = $1 AND s.status = 'pending' AND s.amount_cents > 0` },
    { kind: 'referral', table: 'referral_statements', type: 'referral_bonus', sql: `SELECT s.id, a.owner_id AS user_id, s.amount_cents AS cents FROM referral_statements s JOIN agencies a ON a.id = s.agency_id WHERE s.period_id = $1 AND s.status = 'pending' AND s.amount_cents > 0 AND ${agencyContractSql('a.owner_id')}` },
  ];
  const out = { count: 0, cents: 0n };
  for (const set of sets) {
    if (kinds && !kinds.includes(set.kind)) continue;
    for (const r of (await c.query(set.sql, [periodId])).rows) {
      if (!r.user_id) continue;
      await creditUsd(c, { userId: r.user_id, cents: BigInt(r.cents), type: set.type, refType: set.table, refId: r.id, actorId: adminId });
      await c.query(`UPDATE ${set.table} SET status = 'paid', paid_at = NOW(), paid_by = $2, pay_note = $3 WHERE id = $1`, [r.id, adminId, note]);
      out.count += 1;
      out.cents += BigInt(r.cents);
    }
  }
  return out;
}

const txJson = (t) => ({ id: t.id, type: t.type, amountCents: String(t.amount_cents), balanceAfter: String(t.balance_after), note: t.note, createdAt: t.created_at });
export const withdrawalJson = (w) => ({
  id: w.id, amountCents: String(w.amount_cents), method: w.method, account: w.account, status: w.status,
  adminNote: w.admin_note ?? null, decidedAt: w.decided_at, createdAt: w.created_at,
  ...(w.username !== undefined ? { userId: w.user_id, username: w.username, displayName: w.display_name ?? null } : {}),
});

/** Cüzdan özeti: bakiye, ayarlar, son hareketler ve çekim talepleri. */
export async function walletOf(userId) {
  const u = (await query(`SELECT usd_cents, kyc_status FROM users WHERE id = $1`, [userId])).rows[0];
  if (!u) throw fail('Kullanıcı bulunamadı.', 404);
  // Kimlik doğrulaması onaylanmadığı için cüzdana yatmayı bekleyen maaş (cüzdan dönemlerinin bekleyen özetleri).
  const held = (await query(
    `SELECT COALESCE(SUM(s.salary_cents), 0)::bigint AS cents FROM host_statements s JOIN payout_periods p ON p.id = s.period_id
     WHERE s.user_id = $1 AND s.status = 'pending' AND p.wallet_mode`, [userId],
  )).rows[0].cents;
  const txs = (await query(`SELECT * FROM usd_transactions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 60`, [userId])).rows;
  const wds = (await query(`SELECT * FROM usd_withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30`, [userId])).rows;
  return {
    balanceCents: String(u.usd_cents),
    heldSalaryCents: String(held ?? 0),
    kycStatus: u.kyc_status,
    settings: settingsJson(usdSettings(await getConfig())),
    transactions: txs.map(txJson),
    withdrawals: wds.map(withdrawalJson),
  };
}

/** Admin'e gönderim: tutar hemen düşer, talep bekler. */
export async function requestWithdrawal(userId, { cents, method, account }) {
  const s = usdSettings(await getConfig());
  if (!s.enabled) throw fail('Dolar gönderimi şu an kapalı.', 403);
  if (cents < s.withdrawMinCents) throw fail(`En az ${Number(s.withdrawMinCents) / 100} dolar gönderebilirsiniz.`);
  const id = crypto.randomUUID();
  return tx(async (c) => {
    // Önce bakiye düşülür (yetersizse hiçbir kayıt oluşmaz), sonra talep yazılır.
    await debitUsd(c, { userId, cents, type: 'withdraw_request', refType: 'usd_withdrawal', refId: id, actorId: userId });
    const w = (await c.query(
      `INSERT INTO usd_withdrawals(id, user_id, amount_cents, method, account) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [id, userId, cents.toString(), method, account],
    )).rows[0];
    return withdrawalJson(w);
  });
}

// Bekleyen talebi kapatır. paid: admin ödedi. rejected / cancelled: tutar cüzdana geri döner.
async function closeWithdrawal(id, status, { actorId, note = null, ownerId = null }) {
  return tx(async (c) => {
    const w = (await c.query(`SELECT * FROM usd_withdrawals WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!w || (ownerId && w.user_id !== ownerId)) throw fail('Talep bulunamadı.', 404);
    if (w.status !== 'pending') throw fail('Bu talep zaten sonuçlandırılmış.', 409);
    const row = (await c.query(
      `UPDATE usd_withdrawals SET status = $2, admin_note = $3, decided_by = $4, decided_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status, note, actorId],
    )).rows[0];
    if (status !== 'paid') {
      await creditUsd(c, { userId: w.user_id, cents: BigInt(w.amount_cents), type: 'withdraw_refund', refType: 'usd_withdrawal', refId: w.id, note, actorId });
    }
    if (!ownerId) {
      await c.query(
        `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,$3,'usd_withdrawal',$4,$5)`,
        [actorId, w.user_id, status === 'paid' ? 'usd_withdraw_paid' : 'usd_withdraw_rejected', w.id, JSON.stringify({ amountCents: String(w.amount_cents), method: w.method, note })],
      );
    }
    return withdrawalJson(row);
  });
}
export const payWithdrawal = (adminId, id, note) => closeWithdrawal(id, 'paid', { actorId: adminId, note });
export const rejectWithdrawal = (adminId, id, note) => closeWithdrawal(id, 'rejected', { actorId: adminId, note });
export const cancelWithdrawal = (userId, id) => closeWithdrawal(id, 'cancelled', { actorId: userId, ownerId: userId });

/** Dolar gönderilebilecek (aktif) bayiler. */
export async function transferDealers(userId) {
  const r = await query(
    `SELECT d.id, d.name, u.username, u.display_name, u.avatar_url FROM dealer_accounts d JOIN users u ON u.id = d.owner_user_id
     WHERE d.is_active = TRUE AND d.owner_user_id <> $1 AND u.account_status = 'active' ORDER BY d.name LIMIT 200`, [userId],
  );
  return r.rows.map((d) => ({ id: d.id, name: d.name, username: d.username, displayName: d.display_name ?? null, avatarUrl: d.avatar_url ?? null }));
}

/** Bayiye gönderim: dolar anında düşer, karşılığı Coin bayinin stokuna eklenir. Geri alınamaz. */
export async function transferToDealer(userId, { dealerId, cents }) {
  const s = usdSettings(await getConfig());
  if (!s.enabled) throw fail('Dolar gönderimi şu an kapalı.', 403);
  if (cents < s.dealerMinCents) throw fail(`En az ${Number(s.dealerMinCents) / 100} dolar gönderebilirsiniz.`);
  const coins = coinsFor(cents, s.coinsPerUsd);
  if (coins <= 0n) throw fail('Tutar çok küçük.');
  const id = crypto.randomUUID();
  return tx(async (c) => {
    const d = (await c.query(`SELECT id, name, owner_user_id, coin_balance FROM dealer_accounts WHERE id = $1 AND is_active = TRUE FOR UPDATE`, [dealerId])).rows[0];
    if (!d) throw fail('Bayi bulunamadı.', 404);
    if (d.owner_user_id === userId) throw fail('Kendi bayi hesabınıza gönderemezsiniz.');
    const sender = (await c.query(`SELECT username FROM users WHERE id = $1`, [userId])).rows[0];
    // Önce bakiye düşülür (yetersizse hiçbir kayıt oluşmaz), sonra gönderim ve bayi stoku yazılır.
    const balance = await debitUsd(c, { userId, cents, type: 'dealer_transfer', refType: 'usd_dealer_transfer', refId: id, note: `Bayi: ${d.name}`, actorId: userId });
    const t = (await c.query(
      `INSERT INTO usd_dealer_transfers(id, user_id, dealer_id, amount_cents, coins_per_usd, coins) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
      [id, userId, d.id, cents.toString(), s.coinsPerUsd.toString(), coins.toString()],
    )).rows[0];
    const after = (await c.query(`UPDATE dealer_accounts SET coin_balance = coin_balance + $2 WHERE id = $1 RETURNING coin_balance`, [d.id, coins.toString()])).rows[0];
    await c.query(
      `INSERT INTO dealer_transactions(dealer_id, admin_id, user_id, type, coin_amount, description) VALUES($1,NULL,$2,'usd_transfer',$3,$4)`,
      [d.id, userId, coins.toString(), `Dolar gönderimi: @${sender?.username ?? '?'} ${Number(cents) / 100} $ → ${coins} Coin`],
    );
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
       VALUES(NULL,$1,'usd_dealer_transfer','dealer',$2,$3,$4,$5,$6)`,
      [userId, d.id, coins.toString(), String(d.coin_balance), String(after.coin_balance), JSON.stringify({ amountCents: String(cents), coinsPerUsd: String(s.coinsPerUsd), transferId: t.id })],
    );
    return { id: t.id, dealerId: d.id, dealerName: d.name, amountCents: String(cents), coins: String(coins), balanceCents: String(balance), createdAt: t.created_at };
  });
}

/**
 * Fasulyeyi Coin'e çevirir. targetUserId verilmezse Coin kullanıcının kendisine, verilirse o kullanıcıya yüklenir.
 * Anında işlenir ve geri alınamaz. Fasulye çıkışı deftere, Coin girişi alıcının Coin geçmişine yazılır.
 */
export async function exchangeToCoins(userId, { cents, targetUserId = null }) {
  const s = usdSettings(await getConfig());
  if (!s.enabled) throw fail('Fasulye işlemleri şu an kapalı.', 403);
  if (cents < s.exchangeMinCents) throw fail(`En az ${beansText(s.exchangeMinCents)} Fasulye çevirebilirsiniz.`);
  const toId = targetUserId ?? userId;
  const self = toId === userId;
  const rate = self ? s.exchangeCoinsPerUsd : s.sendCoinsPerUsd;
  const coins = coinsFor(cents, rate);
  if (coins <= 0n) throw fail('Tutar çok küçük.');
  const id = crypto.randomUUID();
  return tx(async (c) => {
    // İki kullanıcı aynı anda birbirine gönderirse kilitlenme (deadlock) olmasın diye satırlar kimlik sırasıyla kilitlenir.
    const rows = (await c.query(
      `SELECT id, username, display_name, coins, account_status FROM users WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [[userId, toId]],
    )).rows;
    const me = rows.find((r) => r.id === userId);
    const to = rows.find((r) => r.id === toId);
    if (!me) throw fail('Kullanıcı bulunamadı.', 404);
    if (!to || to.account_status !== 'active') throw fail('Kullanıcı bulunamadı.', 404);
    if (!self) {
      const blocked = (await c.query(
        `SELECT 1 FROM user_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1) LIMIT 1`, [userId, toId],
      )).rowCount;
      if (blocked) throw fail('Bu kullanıcıya gönderemezsiniz.', 403);
    }
    // Önce Fasulye düşülür (yetersizse hiçbir kayıt oluşmaz), sonra çevirme kaydı ve Coin yazılır.
    const balance = await debitUsd(c, {
      userId, cents, type: self ? 'coin_exchange' : 'coin_send', refType: 'usd_coin_exchange', refId: id,
      note: self ? `${coins} Coin` : `@${to.username}: ${coins} Coin`, actorId: userId,
    });
    const t = (await c.query(
      `INSERT INTO usd_coin_exchanges(id, user_id, target_user_id, amount_cents, coins_per_usd, coins) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
      [id, userId, toId, cents.toString(), rate.toString(), coins.toString()],
    )).rows[0];
    const before = BigInt(to.coins);
    const after = BigInt((await c.query(`UPDATE users SET coins = coins + $2, updated_at = NOW() WHERE id = $1 RETURNING coins`, [toId, coins.toString()])).rows[0].coins);
    await c.query(
      `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,$2,$3,$4,$5)`,
      [toId, self ? 'bean_exchange' : 'bean_received', coins.toString(), id,
        self ? `${beansText(cents)} Fasulye → ${coins} Coin` : `@${me.username} gönderdi: ${beansText(cents)} Fasulye → ${coins} Coin`],
    );
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
       VALUES(NULL,$1,'usd_coin_exchange','usd_coin_exchange',$2,$3,$4,$5,$6)`,
      [toId, id, coins.toString(), before.toString(), after.toString(),
        JSON.stringify({ fromUserId: userId, amountCents: String(cents), coinsPerUsd: String(rate) })],
    );
    return {
      id: t.id, self, amountCents: String(cents), coins: String(coins), balanceCents: String(balance), createdAt: t.created_at,
      target: { id: to.id, username: to.username, displayName: to.display_name ?? null }, sender: { username: me.username, displayName: me.display_name ?? null },
      coinBalance: self ? String(after) : null,
    };
  });
}

/** Admin: elle düzeltme (işaretli tutar). Eksiye düşüremez. */
export async function adminAdjust(adminId, { userId, cents, note }) {
  return tx(async (c) => {
    const after = await move(c, { userId, cents, type: 'admin_adjust', note, actorId: adminId });
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2::uuid,'usd_admin_adjust','user',$2::text,$3)`,
      [adminId, userId, JSON.stringify({ amountCents: String(cents), note })],
    );
    return { balanceCents: String(after) };
  });
}

/** Admin: bekleyen talepler ve toplam yükümlülük. */
export async function adminOverview(status = 'pending') {
  const st = ['pending', 'paid', 'rejected', 'cancelled'].includes(status) ? status : 'pending';
  const rows = (await query(
    `SELECT w.*, u.username, u.display_name FROM usd_withdrawals w JOIN users u ON u.id = w.user_id WHERE w.status = $1
     ORDER BY w.created_at ${st === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`, [st],
  )).rows;
  const sum = (await query(
    `SELECT (SELECT COALESCE(SUM(usd_cents), 0) FROM users)::text AS wallets,
            (SELECT COALESCE(SUM(amount_cents), 0) FROM usd_withdrawals WHERE status = 'pending')::text AS pending,
            (SELECT COUNT(*) FROM usd_withdrawals WHERE status = 'pending')::int AS pending_count,
            (SELECT COALESCE(SUM(amount_cents), 0) FROM usd_withdrawals WHERE status = 'paid')::text AS paid,
            (SELECT COALESCE(SUM(amount_cents), 0) FROM usd_dealer_transfers)::text AS dealer_cents,
            (SELECT COALESCE(SUM(coins), 0) FROM usd_dealer_transfers)::text AS dealer_coins,
            (SELECT COALESCE(SUM(amount_cents), 0) FROM usd_coin_exchanges)::text AS exchange_cents,
            (SELECT COALESCE(SUM(coins), 0) FROM usd_coin_exchanges)::text AS exchange_coins`,
  )).rows[0];
  return {
    withdrawals: rows.map(withdrawalJson),
    totals: { walletCents: sum.wallets, pendingCents: sum.pending, pendingCount: sum.pending_count, paidCents: sum.paid, dealerCents: sum.dealer_cents, dealerCoins: sum.dealer_coins, exchangeCents: sum.exchange_cents, exchangeCoins: sum.exchange_coins },
    settings: settingsJson(usdSettings(await getConfig())),
  };
}
