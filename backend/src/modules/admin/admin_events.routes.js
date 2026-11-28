// Yönetici paneli — resmi etkinlikler ve dönem kapatma.
// Ortak yardımcılar ve import'lar: admin.shared.js
import { Router } from 'express';
import { transferPeriod } from '../wallet/salary_transfer.service.js';
import { salaryStatus } from '../wallet/instant_salary.service.js';
import { BROADCASTER_CONTRACT_SQL, agencyContractSql } from '../contracts/contracts.rules.js';
import { SALARY_PAYABLE_SQL, STATEMENT_TABLES, agencyStatementJson, announceUserChange, normalizePhone, assistantStatementJson, closePeriod, creditPeriod, creditStatement, fail, hostStatementJson, isWalletPeriod, loadConfig, notifyUser, oneOf, parsePeriodKey, periodKey, previousPeriod, query, referralStatementJson, requireSuperAdmin, text, tx, uuid } from './admin.shared.js';

export const router = Router();

// ---------------- Resmi etkinlikler, dönem kapatma, KYC ----------------
router.post('/events', async (req, res) => {
  const title = text(req.body?.title, 'Başlık', { min: 3, max: 120, required: true });
  const startsAt = new Date(req.body?.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw fail('Başlangıç zamanı geçersiz.');
  const r = await query(`INSERT INTO official_events(title, starts_at, created_by) VALUES($1,$2,$3) RETURNING id, title, starts_at`, [title, startsAt.toISOString(), req.user.id]);
  res.status(201).json({ event: r.rows[0] });
});

router.get('/events', async (req, res) => {
  const r = await query(
    `SELECT e.id, e.title, e.starts_at, (SELECT COUNT(*)::int FROM official_event_attendance a WHERE a.event_id = e.id) AS attendees
     FROM official_events e ORDER BY e.starts_at DESC LIMIT 100`,
  );
  res.json({ events: r.rows.map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, attendees: e.attendees })) });
});

router.post('/events/:id/attendance', async (req, res) => {
  const eventId = uuid(req.params.id, 'Etkinlik');
  const userIds = (Array.isArray(req.body?.userIds) ? req.body.userIds : []).slice(0, 200).map((x) => uuid(x, 'Kullanıcı'));
  if (!userIds.length) throw fail('En az bir kullanıcı gerekli.');
  if (!(await query(`SELECT 1 FROM official_events WHERE id = $1`, [eventId])).rowCount) throw fail('Etkinlik bulunamadı.', 404);
  const r = await query(
    `INSERT INTO official_event_attendance(event_id, user_id, marked_by)
     SELECT $1, b.user_id, $3 FROM broadcasters b WHERE b.user_id = ANY($2::uuid[]) ON CONFLICT DO NOTHING`, [eventId, userIds, req.user.id],
  );
  res.json({ ok: true, added: r.rowCount });
});

// Dönemi kapat (hesap özetleri üretir). period boş ise bir önceki dönem.

// Dönemi kapat (hesap özetleri üretir). period boş ise bir önceki dönem.
// Bir yayıncının maaşı neden yatmıyor: yayıncının gördüğü teşhisin aynısı (destek ekibi için).
router.get('/payouts/salary-status/:userId', async (req, res) => {
  res.json(await salaryStatus(uuid(req.params.userId, 'Kullanıcı')));
});

router.post('/payouts/close', requireSuperAdmin, async (req, res) => {
  const cfg = await loadConfig();
  let key = req.body?.period;
  if (!key) key = previousPeriod(cfg.settings.cycle).key;
  try { parsePeriodKey(key); } catch (e) { throw fail(e.message); }
  const out = await closePeriod({ adminId: req.user.id, periodKey: key, force: req.body?.force === true });
  const { rewardedUserIds, paidHosts, currency, ...rest } = out;
  res.status(201).json(rest);
  // Ödül alanların görünümü odalarda yenilenir; maaşı oluşan yayıncılara bildirim gider (hata asıl işlemi bozmaz).
  for (const id of rewardedUserIds) announceUserChange(id);
  for (const h of paidHosts) {
    const amount = `${(Number(BigInt(h.cents)) / 100).toFixed(2)} ${currency}`;
    notifyUser(h.userId, 'agency_salary', 'Maaş özetin hazır', `${out.periodKey} dönemi maaşın hesaplandı: ${amount}. Yayıncı Merkezi → Maaş özetlerim.`, {});
  }
});

// ---------------- Ay başı maaş aktarımı ----------------

/// Aktarım çalışmalarının kaydı: hangi dönem, ne zaman, kaç kişiye, kaç kişi atlandı.
///
/// Panelde bunun görünmesi önemli: "aktarım yapıldı mı" sorusunun yanıtı burada ve
/// atlananların sayısı, telefonunu doğrulamamış yayıncıları gösteriyor.
router.get('/salary-transfers', requireSuperAdmin, async (req, res) => {
  const r = await query(
    `SELECT r.period_key, r.started_at, r.finished_at, r.trigger, r.paid_count, r.paid_cents, r.skipped_count,
            u.username AS started_by_username
       FROM salary_transfer_runs r LEFT JOIN users u ON u.id = r.started_by
      ORDER BY r.started_at DESC LIMIT 50`,
  );
  res.json({ runs: r.rows.map((x) => ({
    periodKey: x.period_key, startedAt: x.started_at, finishedAt: x.finished_at,
    trigger: x.trigger, startedBy: x.started_by_username ?? null,
    paidCount: x.paid_count, paidCents: String(x.paid_cents), skippedCount: x.skipped_count,
  })) });
});

/// Aktarımı ELLE başlat (ayın 1–3 penceresini beklemeden).
///
/// "Bir kere" güvencesi burada da geçerli: aynı dönem ikinci kez başlatılırsa hiçbir şey
/// yapılmaz ve `already: true` döner. Bu uca iki kez basmak kimseye iki kez para yazdırmaz.
router.post('/salary-transfers/:periodKey', requireSuperAdmin, async (req, res) => {
  const periodKey = text(req.params.periodKey, 'Dönem', { max: 16, required: true });
  res.json(await transferPeriod({ periodKey, trigger: 'manual', actorId: req.user.id }));
});

router.get('/payouts', async (req, res) => {
  const r = await query(
    `SELECT p.id, p.period_key, p.cycle, p.starts_at, p.ends_at, p.closed_at,
       (SELECT COUNT(*)::int FROM host_statements h WHERE h.period_id = p.id) AS hosts,
       (SELECT COUNT(*)::int FROM host_statements h WHERE h.period_id = p.id AND h.status = 'pending' AND h.salary_cents > 0) AS pending_hosts,
       (SELECT COALESCE(SUM(salary_cents),0) FROM host_statements h WHERE h.period_id = p.id AND h.status <> 'void') AS total_salary_cents,
       (SELECT COALESCE(SUM(salary_cents),0) FROM host_statements h WHERE h.period_id = p.id AND h.status = 'paid') AS paid_salary_cents,
       (SELECT COUNT(*)::int FROM agency_statements a WHERE a.period_id = p.id) AS agencies,
       (SELECT COUNT(*)::int FROM agency_statements a WHERE a.period_id = p.id AND a.status = 'pending') AS pending_agencies,
       (SELECT COALESCE(SUM(owner_cents),0) FROM agency_statements a WHERE a.period_id = p.id AND a.status <> 'void') AS total_owner_cents,
       (SELECT COUNT(*)::int FROM assistant_statements s WHERE s.period_id = p.id) AS assistants,
       (SELECT COUNT(*)::int FROM assistant_statements s WHERE s.period_id = p.id AND s.status = 'pending') AS pending_assistants,
       (SELECT COALESCE(SUM(amount_cents),0) FROM assistant_statements s WHERE s.period_id = p.id AND s.status <> 'void') AS total_assistant_cents,
       (SELECT COUNT(*)::int FROM referral_statements s WHERE s.period_id = p.id) AS referrals,
       (SELECT COUNT(*)::int FROM referral_statements s WHERE s.period_id = p.id AND s.status = 'pending') AS pending_referrals,
       (SELECT COALESCE(SUM(amount_cents),0) FROM referral_statements s WHERE s.period_id = p.id AND s.status <> 'void') AS total_referral_cents
     FROM payout_periods p ORDER BY p.starts_at DESC LIMIT 52`,
  );
  res.json({ periods: r.rows.map((p) => ({
    id: p.id, periodKey: p.period_key, cycle: p.cycle, startsAt: p.starts_at, endsAt: p.ends_at, closedAt: p.closed_at,
    hosts: p.hosts, pendingHosts: p.pending_hosts, totalSalaryCents: String(p.total_salary_cents), paidSalaryCents: String(p.paid_salary_cents),
    agencies: p.agencies, pendingAgencies: p.pending_agencies, totalOwnerCents: String(p.total_owner_cents),
    assistants: p.assistants, pendingAssistants: p.pending_assistants, totalAssistantCents: String(p.total_assistant_cents),
    referrals: p.referrals, pendingReferrals: p.pending_referrals, totalReferralCents: String(p.total_referral_cents),
  })) });
});

router.get('/payouts/:id', async (req, res) => {
  const id = uuid(req.params.id, 'Dönem');
  const p = (await query(`SELECT * FROM payout_periods WHERE id = $1`, [id])).rows[0];
  if (!p) throw fail('Dönem bulunamadı.', 404);
  const args = [id, p.period_key, p.starts_at, p.ends_at];
  const hosts = (await query(
    `SELECT h.*, $2::text AS period_key, $3::timestamptz AS starts_at, $4::timestamptz AS ends_at, u.username, u.display_name, u.public_id, u.kyc_status,
       a.name AS agency_name
     FROM host_statements h JOIN users u ON u.id = h.user_id LEFT JOIN agencies a ON a.id = h.agency_id
     WHERE h.period_id = $1 ORDER BY h.salary_cents DESC, h.diamonds DESC`, args,
  )).rows;
  const agencies = (await query(
    `SELECT s.*, $2::text AS period_key, $3::timestamptz AS starts_at, $4::timestamptz AS ends_at, a.name AS agency_name,
       u.username AS owner_username, u.kyc_status AS owner_kyc
     FROM agency_statements s JOIN agencies a ON a.id = s.agency_id JOIN users u ON u.id = a.owner_id
     WHERE s.period_id = $1 ORDER BY s.commission_cents DESC, s.commission_diamonds DESC`, args,
  )).rows;
  const assistants = (await query(
    `SELECT s.*, $2::text AS period_key, $3::timestamptz AS starts_at, $4::timestamptz AS ends_at, a.name AS agency_name, u.username, u.display_name, u.kyc_status
     FROM assistant_statements s JOIN agencies a ON a.id = s.agency_id JOIN users u ON u.id = s.user_id
     WHERE s.period_id = $1 ORDER BY s.amount_cents DESC`, args,
  )).rows;
  const referrals = (await query(
    `SELECT s.*, $2::text AS period_key, $3::timestamptz AS starts_at, $4::timestamptz AS ends_at, a.name AS agency_name, ia.name AS invited_agency_name
     FROM referral_statements s JOIN agencies a ON a.id = s.agency_id JOIN agencies ia ON ia.id = s.invited_agency_id
     WHERE s.period_id = $1 ORDER BY s.amount_cents DESC`, args,
  )).rows;
  res.json({
    period: { id: p.id, periodKey: p.period_key, cycle: p.cycle, startsAt: p.starts_at, endsAt: p.ends_at, closedAt: p.closed_at, currency: p.config?.settings?.currency ?? null, walletMode: p.wallet_mode === true },
    hostStatements: hosts.map((h) => ({ ...hostStatementJson(h), publicId: h.public_id, kycStatus: h.kyc_status })),
    agencyStatements: agencies.map((a) => ({ ...agencyStatementJson(a), ownerUsername: a.owner_username, ownerKyc: a.owner_kyc })),
    assistantStatements: assistants.map((s) => ({ ...assistantStatementJson(s), kycStatus: s.kyc_status })),
    referralStatements: referrals.map(referralStatementJson),
  });
});

// Ödeme platform dışında (banka / havale vb.) yapılır; burada "ödendi" işaretlenir ve isteğe bağlı not (dekont no) yazılır.
// Yayıncı maaşı için KYC onayı şarttır.
router.post('/statements/:kind/:id/pay', requireSuperAdmin, async (req, res) => {
  const kind = oneOf(req.params.kind, Object.keys(STATEMENT_TABLES), 'Tür');
  const id = uuid(req.params.id, 'Özet');
  const note = text(req.body?.note, 'Not', { max: 200 });
  const t = STATEMENT_TABLES[kind];
  await tx(async (c) => {
    const row = (await c.query(`SELECT * FROM ${t.table} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!row) throw fail('Özet bulunamadı.', 404);
    if (row.status !== 'pending') throw fail('Bu özet zaten işlenmiş.', 409);
    if (kind === 'host' && BigInt(row.salary_cents) > 0n) {
      const k = (await c.query(`SELECT kyc_status FROM users WHERE id = $1`, [row.user_id])).rows[0]?.kyc_status;
      if (k !== 'approved') throw fail('Yayıncının kimlik doğrulaması (KYC) onaylı değil.', 409);
    }
    // Sözleşme kapısı (contracts.rules.js): toplu ödemeyle aynı kural, tek tek ödemede de geçerli.
    if (BigInt(row[t.amount] ?? 0) > 0n && (kind === 'host' || kind === 'agency' || kind === 'referral')) {
      const ownerSql = kind === 'host' ? `SELECT ${BROADCASTER_CONTRACT_SQL} AS ok FROM users u WHERE u.id = $1`
        : `SELECT ${agencyContractSql('a.owner_id')} AS ok FROM agencies a WHERE a.id = $1`;
      const ok = (await c.query(ownerSql, [kind === 'host' ? row.user_id : row.agency_id])).rows[0]?.ok;
      if (!ok) throw fail(kind === 'host' ? 'Yayıncı, yayıncı sözleşmesini henüz onaylamadı.' : 'Ajans sahibi, ajans sözleşmesini henüz onaylamadı.', 409);
    }
    // Cüzdan döneminde "öde" = tutarı alıcının dolar cüzdanına yatır (platform dışı ödeme yapılmaz).
    const wallet = await isWalletPeriod(c, row.period_id);
    if (wallet) await creditStatement(c, kind, row, req.user.id);
    await c.query(`UPDATE ${t.table} SET status = 'paid', paid_at = NOW(), paid_by = $2, pay_note = $3 WHERE id = $1`, [id, req.user.id, note || (wallet ? 'Dolar cüzdanına yatırıldı' : null)]);
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,$3,$4,$5,$6)`,
      [req.user.id, row.user_id ?? null, t.action, t.table, id, JSON.stringify({ amountCents: String(row[t.amount] ?? 0), note })],
    );
  });
  res.json({ ok: true });
});

// Toplu "ödendi": dönemin bekleyen özetleri (yayıncıda KYC onayı olmayanlar atlanır).

// Toplu "ödendi": dönemin bekleyen özetleri (yayıncıda KYC onayı olmayanlar atlanır).
router.post('/payouts/:id/pay-all', requireSuperAdmin, async (req, res) => {
  const periodId = uuid(req.params.id, 'Dönem');
  const kind = oneOf(req.body?.kind, Object.keys(STATEMENT_TABLES), 'Tür');
  const note = text(req.body?.note, 'Not', { max: 200 });
  const t = STATEMENT_TABLES[kind];
  const out = await tx(async (c) => {
    // Cüzdan döneminde tutarlar önce cüzdanlara yatırılır (telefonu doğrulanmamış yayıncılar atlanır,
    // özetleri 'pending' kalır ve sonraki çalışmada ödenir); kalan sıfır tutarlı özetler aşağıda kapanır.
    const walletOut = (await isWalletPeriod(c, periodId)) ? await creditPeriod(c, periodId, req.user.id, { kinds: [kind], note: note || 'Dolar cüzdanına yatırıldı' }) : null;
    const r = kind === 'host'
      ? await c.query(
          `UPDATE host_statements h SET status = 'paid', paid_at = NOW(), paid_by = $2, pay_note = $3 FROM users u
           -- Koşul creditPeriod ile AYNI kaynaktan: ayrışırsa özet "ödendi" olur ama para yatmaz.
           WHERE h.period_id = $1 AND h.status = 'pending' AND u.id = h.user_id AND (h.salary_cents = 0 OR (${SALARY_PAYABLE_SQL}))
           RETURNING h.id, h.salary_cents AS amount`, [periodId, req.user.id, note],
        )
      : await c.query(
          `UPDATE ${t.table} SET status = 'paid', paid_at = NOW(), paid_by = $2, pay_note = $3 WHERE period_id = $1 AND status = 'pending'
           RETURNING id, ${t.amount} AS amount`, [periodId, req.user.id, note],
        );
    const left = (await c.query(`SELECT COUNT(*)::int AS n FROM ${t.table} WHERE period_id = $1 AND status = 'pending'`, [periodId])).rows[0].n;
    const total = r.rows.reduce((s, x) => s + BigInt(x.amount ?? 0), 0n) + (walletOut?.cents ?? 0n);
    const paid = r.rowCount + (walletOut?.count ?? 0);
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'payout_period',$3,$4)`,
      [req.user.id, `${t.action}_bulk`, periodId, JSON.stringify({ count: paid, totalCents: total.toString(), skipped: left, note, wallet: walletOut !== null })],
    );
    return { paid, skipped: left, totalCents: total.toString() };
  });
  res.json({ ok: true, ...out });
});

// Özeti iptal et (hatalı / şüpheli). Yöntem 2 ile maaşa çevrilen elmaslar yayıncıya iade edilir.

// Özeti iptal et (hatalı / şüpheli). Yöntem 2 ile maaşa çevrilen elmaslar yayıncıya iade edilir.
router.post('/statements/:kind/:id/void', requireSuperAdmin, async (req, res) => {
  const kind = oneOf(req.params.kind, Object.keys(STATEMENT_TABLES), 'Tür');
  const id = uuid(req.params.id, 'Özet');
  const note = text(req.body?.note, 'Not', { max: 200 });
  const t = STATEMENT_TABLES[kind];
  const out = await tx(async (c) => {
    const row = (await c.query(`SELECT * FROM ${t.table} WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!row) throw fail('Özet bulunamadı.', 404);
    if (row.status !== 'pending') throw fail('Yalnızca bekleyen özet iptal edilebilir.', 409);
    await c.query(`UPDATE ${t.table} SET status = 'void', paid_at = NOW(), paid_by = $2, pay_note = $3 WHERE id = $1`, [id, req.user.id, note]);
    let refunded = 0n;
    if (kind === 'host' && BigInt(row.consumed_diamonds ?? 0) > 0n) {
      refunded = BigInt(row.consumed_diamonds);
      await c.query(`UPDATE users SET diamonds = diamonds + $2, updated_at = NOW() WHERE id = $1`, [row.user_id, refunded.toString()]);
      await c.query(
        `INSERT INTO wallet_transactions(user_id, transaction_type, diamond_amount, reference_id, description) VALUES($1,'salary_conversion_refund',$2,$3,$4)`,
        [row.user_id, refunded.toString(), id, 'Maaş özeti iptal edildi: maaşa çevrilen elmaslar iade edildi'],
      );
    }
    await c.query(
      `INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, reference_id, metadata) VALUES($1,$2,'statement_void',$3,$4,$5)`,
      [req.user.id, row.user_id ?? null, t.table, id, JSON.stringify({ note, refundedDiamonds: refunded.toString() })],
    );
    return { refunded: refunded.toString() };
  });
  res.json({ ok: true, refundedDiamonds: out.refunded });
});

router.get('/kyc', async (req, res) => {
  const status = oneOf(String(req.query.status ?? 'pending'), ['pending', 'approved', 'rejected'], 'Durum');
  const r = await query(`SELECT id, username, display_name, kyc_status FROM users WHERE kyc_status = $1 ORDER BY username LIMIT 200`, [status]);
  res.json({ users: r.rows.map((u) => ({ id: u.id, username: u.username, displayName: u.display_name, kycStatus: u.kyc_status })) });
});

router.post('/users/:userId/kyc', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const status = oneOf(req.body?.status, ['approved', 'rejected', 'none'], 'Durum');
  const r = await query(`UPDATE users SET kyc_status = $2 WHERE id = $1 RETURNING id`, [userId, status]);
  if (!r.rowCount) throw fail('Kullanıcı bulunamadı.', 404);
  await query(`INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, metadata) VALUES($1,$2,'kyc_status','user',$3)`, [req.user.id, userId, JSON.stringify({ status })]);
  res.json({ ok: true, status });
});

// Telefonu elle doğrula (SMS doğrulaması kurulu değilken maaşın açılması için). Süper yönetici; denetim kaydı tutulur.
// Maaş şartı (SALARY_PAYABLE_SQL) doğrulanmış telefon istiyor: Firebase ayarı yoksa yayıncı kendi başına doğrulayamaz.
router.post('/users/:userId/phone-verify', requireSuperAdmin, async (req, res) => {
  const userId = uuid(req.params.userId, 'Kullanıcı');
  const verified = req.body?.verified !== false;
  const phone = req.body?.phone ? normalizePhone(req.body.phone) : undefined;
  if (req.body?.phone && !phone) throw fail('Telefon numarası geçersiz (ör. +905xxxxxxxxx).');
  let r;
  try {
    r = await query(
      `UPDATE users SET phone = COALESCE($3, phone), phone_verified_at = CASE WHEN $2 THEN COALESCE(phone_verified_at, NOW()) ELSE NULL END, updated_at = NOW()
       WHERE id = $1 AND ($2 = FALSE OR COALESCE($3, phone) IS NOT NULL) RETURNING id, phone, phone_verified_at`,
      [userId, verified, phone ?? null],
    );
  } catch (e) {
    if (e.code === '23505') throw fail('Bu telefon numarası başka bir hesapta kayıtlı.', 409);
    throw e;
  }
  if (!r.rowCount) throw fail(verified ? 'Kullanıcının telefon numarası yok; önce numarayı girin.' : 'Kullanıcı bulunamadı.', verified ? 400 : 404);
  await query(`INSERT INTO financial_audit_logs(admin_id, user_id, action, reference_type, metadata) VALUES($1,$2,'phone_verify_manual','user',$3)`,
    [req.user.id, userId, JSON.stringify({ verified, phone: r.rows[0].phone })]);
  res.json({ ok: true, phone: r.rows[0].phone, phoneVerifiedAt: r.rows[0].phone_verified_at });
});

router.get('/finance/audit', requireSuperAdmin, async (req, res) => {
  const limit = Math.max(1, Math.min(Math.floor(Number(req.query.limit)) || 100, 500));
  const userId = req.query.userId ? uuid(String(req.query.userId), 'Kullanıcı') : null;
  const r = await query(
    `SELECT * FROM financial_audit_logs WHERE ($1::uuid IS NULL OR user_id = $1) ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  res.json({ logs: r.rows });
});

// ---------------- Basım bütçeleri (sıfırdan üretilen Coin) ----------------
