// Sözleşme onay sistemi: kim hangi sözleşmeyi onaylamalı, metin kişiye nasıl doldurulur, onay nasıl kaydedilir.
//
// Akış (karar: herkese uygulama içi onay; docs/sozlesmeler/OKU_once.md):
//  1. Uygulama GET /api/contracts/:kind ile kişiye doldurulmuş metni ve özetini (SHA-256) alır, kullanıcı sonuna kadar kaydırır.
//  2. Kullanıcı onay kutusunu işaretler ve telefonuna gelen SMS koduyla Firebase üzerinden doğrular (idToken). SMS yapılandırılmamışsa
//     hesap şifresi istenir. Kullanılan yöntem kayda yazılır.
//  3. POST /api/contracts/:kind/accept: sunucu metni AYNI şekilde yeniden üretir; özet uygulamanın gördüğüyle aynı olmalı (arada
//     metin değiştiyse reddedilir). Onay ve PDF tek işlemde yazılır; kayıtlar veritabanında değiştirilemez (migration 119).
//
// Yürürlük kuralı (sözleşme md. 20.3): yeni sürüm yayımlanınca eski sürümün onayı geçerliliğini korur; kapılar "herhangi bir sürüm
// onaylı mı?" diye bakar, uygulama da güncel sürümü onaylatmak için kullanıcıya sorar.
import crypto from 'node:crypto';
import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { getConfig, phoneVerifyOn } from '../system/app_config.service.js';
import { verifyPhoneToken } from '../notifications/firebase_verify.service.js';
import { checkPassword } from '../../middleware/authentication/auth.js';
import { normalizePhone } from '../auth/auth.routes.js';
import { buildContractPdf } from './contract_pdf.js';

export const KINDS = Object.freeze({
  broadcaster: { prefix: 'YAY', title: 'TR LIVE Yayıncı Sözleşmesi', seq: 'contract_no_broadcaster', party: 'Yayıncı' },
  agency: { prefix: 'AJS', title: 'TR LIVE Ajans Sahibi ve Yayıncı Yönetimi Sözleşmesi', seq: 'contract_no_agency', party: 'Ajans Sahibi' },
  dealer: { prefix: 'BAY', title: 'TR LIVE Coin Bayilik Sözleşmesi', seq: 'contract_no_dealer', party: 'Bayi' },
});
export const isKind = (k) => Object.hasOwn(KINDS, k);
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Kullanıcının bu türdeki ilişkisi (yoksa null): sözleşmenin taraf bilgisine ve "gerekli mi" sorusuna temel. */
export async function relationOf(userId, kind, run = query) {
  if (kind === 'broadcaster') {
    const r = (await run(`SELECT b.status, a.name AS agency_name, a.agency_code FROM broadcasters b LEFT JOIN agencies a ON a.id = b.agency_id
                          WHERE b.user_id = $1 AND b.status IN ('pending','approved')`, [userId])).rows[0];
    return r ? { label: 'Yayıncı', extra: r.agency_name ? [['Bağlı ajans', `${r.agency_name}${r.agency_code ? ` (${r.agency_code})` : ''}`]] : [] } : null;
  }
  if (kind === 'agency') {
    const r = (await run(`SELECT id, name, agency_code FROM agencies WHERE owner_id = $1 AND status IN ('pending','active') ORDER BY created_at LIMIT 1`, [userId])).rows[0];
    return r ? { label: 'Ajans Sahibi', extra: [['Ajans', `${r.name}${r.agency_code ? ` (Ajans kodu ${r.agency_code})` : ''}`], ['Ajans ID', r.id]] } : null;
  }
  if (kind === 'dealer') {
    const r = (await run(`SELECT d.id, d.name, d.parent_dealer_id, p.name AS parent_name FROM dealer_accounts d LEFT JOIN dealer_accounts p ON p.id = d.parent_dealer_id
                          WHERE d.owner_user_id = $1 AND d.is_active ORDER BY d.created_at LIMIT 1`, [userId])).rows[0];
    return r ? {
      label: 'Bayi',
      extra: [['Bayi', r.name], ['Bayi ID', r.id], ['Bayi seviyesi', r.parent_dealer_id ? 'Alt Bayi' : 'Ana Bayi'],
        ...(r.parent_dealer_id ? [['Üst bayi', `${r.parent_name ?? ''} (${r.parent_dealer_id})`]] : [])],
    } : null;
  }
  return null;
}

export async function currentTemplate(kind, run = query) {
  return (await run(`SELECT * FROM contract_templates WHERE kind = $1 ORDER BY published_at DESC, id DESC LIMIT 1`, [kind])).rows[0] ?? null;
}

/**
 * Kişiye doldurulmuş metin: sistemin doldurduğu taraf bilgileri + şablon metni. Aynı girdi her zaman aynı metni verir (özet
 * bu metinden alınır); onay anında yeniden üretilip uygulamanın gördüğüyle karşılaştırılır.
 */
export function renderContract({ kind, template, user, relation, company }) {
  const k = KINDS[kind];
  const rows = [
    ['Sözleşme', `${template.title} · Sürüm ${template.version}`],
    ['Şablon özeti (SHA-256)', template.sha256],
    ['TR LIVE işletmecisi', company || 'Madde 1.1\'de belirtilen işletmeci'],
    [`${k.party} adı`, user.display_name || user.username],
    ['TR LIVE kullanıcı ID', user.public_id ?? user.id],
    ['Kullanıcı adı', user.username],
    ...(user.phone ? [['Doğrulanmış telefon', user.phone]] : []),
    ...(relation?.extra ?? []),
  ];
  const party = rows.map(([a, b]) => `${a}: ${b}`).join('\n');
  return `## SİSTEM TARAFINDAN DOLDURULAN TARAF BİLGİLERİ\n\n${party}\n\nMadde 1'deki boş alanlar yukarıdaki bilgilerle doldurulmuş sayılır. Yasal ad, kimlik numarası ve adres, kimlik doğrulaması (KYC) kayıtlarından alınır.\n\n---\n\n${template.body}`;
}

/** Kullanıcının durumu: gereken her tür için güncel sürüm, son onay ve güncel mi. */
export async function statusFor(userId, run = query) {
  const out = [];
  for (const kind of Object.keys(KINDS)) {
    const relation = await relationOf(userId, kind, run);
    if (!relation) continue;
    const t = await currentTemplate(kind, run);
    const last = (await run(
      `SELECT id, contract_no, version, template_id, accepted_at FROM contract_acceptances WHERE user_id = $1 AND kind = $2 ORDER BY accepted_at DESC LIMIT 1`,
      [userId, kind],
    )).rows[0] ?? null;
    out.push({
      kind, title: t?.title ?? KINDS[kind].title, published: Boolean(t), version: t?.version ?? null,
      accepted: last ? { id: last.id, contractNo: last.contract_no, version: last.version, acceptedAt: last.accepted_at } : null,
      upToDate: Boolean(t && last && last.template_id === t.id),
      required: Boolean(t),
    });
  }
  return out;
}

/** Kapı: bu tür için yayımlanmış bir sözleşme varsa kullanıcının en az bir sürümü onaylamış olması gerekir. */
export async function hasAccepted(userId, kind, run = query) {
  const t = await currentTemplate(kind, run);
  if (!t) return true;
  return (await run(`SELECT 1 FROM contract_acceptances WHERE user_id = $1 AND kind = $2 LIMIT 1`, [userId, kind])).rowCount > 0;
}


/** Kişiye özel metin + özet (uygulamanın göstereceği). */
export async function viewFor(user, kind) {
  if (!isKind(kind)) throw fail('Sözleşme türü geçersiz.', 404);
  const relation = await relationOf(user.id, kind);
  if (!relation) throw fail('Bu sözleşme sizin için geçerli değil.', 404);
  const template = await currentTemplate(kind);
  if (!template) throw fail('Bu sözleşme henüz yayımlanmadı.', 404);
  const cfg = await getConfig();
  const text = renderContract({ kind, template, user, relation, company: cfg.contractCompany });
  return { kind, title: template.title, version: template.version, templateId: template.id, text, sha256: sha256(text), relation, template };
}

/** İkinci adım doğrulaması: SMS (Firebase idToken, hesaptaki numara) ya da SMS kapalıysa hesap şifresi. */
async function verifySecondFactor(user, { idToken, password }) {
  const cfg = await getConfig();
  if (phoneVerifyOn(cfg)) {
    if (!idToken) throw fail('Onay için telefonunuza gelen SMS kodunu girin.', 428);
    const phone = normalizePhone(await verifyPhoneToken(idToken, cfg.firebaseProjectId));
    if (!phone || !user.phone || phone !== user.phone) throw fail('Doğrulanan numara hesabınızdaki telefon numarasıyla aynı değil.', 403);
    return { method: 'sms', phone };
  }
  if (!user.password_hash) throw fail('SMS doğrulaması kapalı ve hesabınızda şifre yok. Önce şifre belirleyin.', 409);
  if (!password || !(await checkPassword(String(password).slice(0, 200), user.password_hash))) throw fail('Şifre hatalı.', 403);
  return { method: 'password', phone: user.phone ?? null };
}

/** Onay: özet karşılaştırması, ikinci adım, numara, PDF ve değiştirilemez kayıt. */
export async function accept(user, kind, { sha: shownSha, scrolled, idToken, password, ip, device }) {
  const v = await viewFor(user, kind);
  if (scrolled !== true) throw fail('Onaylamadan önce sözleşmenin tamamını okuyun.', 400);
  if (shownSha !== v.sha256) throw fail('Sözleşme metni güncellendi. Lütfen güncel metni yeniden açıp okuyun.', 409);
  const factor = await verifySecondFactor(user, { idToken, password });
  return tx(async (c) => {
    // Aynı kullanıcı aynı sürümü iki kez onaylamasın (çift dokunma, yeniden deneme): kullanıcı satırı kilitlenir.
    await c.query(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
    const dup = (await c.query(`SELECT id, contract_no FROM contract_acceptances WHERE user_id = $1 AND template_id = $2`, [user.id, v.templateId])).rows[0];
    if (dup) return { id: dup.id, contractNo: dup.contract_no, already: true };
    const n = (await c.query(`SELECT nextval('${KINDS[kind].seq}') AS n`)).rows[0].n;
    const contractNo = `${KINDS[kind].prefix}-${String(n).padStart(6, '0')}`;
    const acceptedAt = new Date();
    const party = { name: user.display_name || user.username, userId: user.id, publicId: user.public_id ?? null, username: user.username, phone: factor.phone, relation: v.relation.extra };
    const header = [
      ['Sözleşme No', contractNo],
      ['Sürüm', v.version],
      ['Onay zamanı (UTC)', acceptedAt.toISOString()],
      ['Onaylayan', `${party.name} (kullanıcı ID ${party.publicId ?? party.userId})`],
      ['Onay yöntemi', factor.method === 'sms' ? `Metnin sonuna kadar görüntülenmesi + onay kutusu + SMS kodu (${factor.phone})` : 'Metnin sonuna kadar görüntülenmesi + onay kutusu + hesap şifresi'],
      ['IP adresi', ip ?? '-'],
      ['Metin özeti (SHA-256)', v.sha256],
    ];
    const pdf = buildContractPdf({ title: v.title, header, body: v.text, footer: contractNo, createdAt: acceptedAt });
    const row = (await c.query(
      `INSERT INTO contract_acceptances(contract_no, user_id, template_id, kind, version, rendered_sha256, template_sha256, party, method, phone, ip, device, accepted_at, pdf_sha256, pdf)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [contractNo, user.id, v.templateId, kind, v.version, v.sha256, v.template.sha256, JSON.stringify(party), factor.method, factor.phone, ip ?? null,
        JSON.stringify(device ?? {}), acceptedAt, sha256(pdf), pdf],
    )).rows[0];
    return { id: row.id, contractNo, acceptedAt, already: false };
  });
}

/** Yeni sürüm yayımlar (yalnızca süper yönetici). Yayımlanan metin değiştirilemez. */
export async function publishTemplate({ kind, version, title, body, adminId }) {
  if (!isKind(kind)) throw fail('Sözleşme türü geçersiz.');
  const v = String(version ?? '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){0,2}$/.test(v)) throw fail('Sürüm biçimi geçersiz (ör. 1.2).');
  const t = String(title ?? '').trim() || KINDS[kind].title;
  const b = String(body ?? '').replace(/\r\n?/g, '\n').trim();
  if (b.length < 100) throw fail('Sözleşme metni çok kısa.');
  if (b.length > 200000) throw fail('Sözleşme metni çok uzun.');
  if (/\[KARAR:/i.test(b)) throw fail('Metinde doldurulmamış [KARAR: …] notu var. Yayımlamadan önce kararı verip notu silin.');
  try {
    const r = await query(
      `INSERT INTO contract_templates(kind, version, title, body, sha256, published_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id, published_at`,
      [kind, v, t, b, sha256(b), adminId],
    );
    return { id: r.rows[0].id, kind, version: v, title: t, sha256: sha256(b), publishedAt: r.rows[0].published_at };
  } catch (e) {
    if (e.code === '23505') throw fail('Bu türde bu sürüm zaten yayımlandı. Değişiklik için yeni sürüm numarası verin.', 409);
    throw e;
  }
}
