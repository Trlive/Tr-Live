// Sözleşme onay sistemi: kim hangi sözleşmeyi onaylamalı, metin kişiye nasıl doldurulur, onay nasıl kaydedilir.
//
// Akış (sahibin kararı, v2.152.21: rakiplerdeki gibi işlemle birlikte kabul; SMS ve PDF yok):
//  - Yayıncı sözleşmesi: ajans davetini kabul ederken (ya da ajans sahibi kendini yayıncı eklerken) aynı işlemde kabul edilir.
//    Uygulama düğmenin altında "kabul ederek sözleşmeyi kabul etmiş olursunuz" notunu ve metne bağlantıyı gösterir, istekte
//    contract: true gönderir. Göndermeyen (eski) uygulamaya 428 contract_required döner ve sözleşme ekranı açılır.
//  - Ajans ve bayi sözleşmesi: hesabı yönetici açar; panel ilk açılırken 428 → sözleşme ekranı → tek dokunuşla kabul.
//  - Kayıt: kim, hangi sürüm, ne zaman, hangi işlemle (via), kişiye doldurulmuş metnin özeti, IP, cihaz. Değiştirilemez (migration 119).
//
// Yürürlük kuralı (sözleşme md. 20.3): yeni sürüm yayımlanınca eski sürümün onayı geçerliliğini korur; kapılar "herhangi bir sürüm
// onaylı mı?" diye bakar, uygulama da güncel sürümü onaylatmak için kullanıcıya sorar.
import crypto from 'node:crypto';
import { query, tx } from '../../infrastructure/database/database.js';
import { fail } from '../../shared/errors/http.js';
import { getConfig } from '../system/app_config.service.js';

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


/**
 * Kişiye özel metin + özet (uygulamanın göstereceği). Yayıncı sözleşmesi, kişi henüz yayıncı değilken de (davet kabul ederken)
 * görüntülenebilir; ajans ve bayi sözleşmesi yalnızca tarafına gösterilir.
 */
export async function viewFor(user, kind, run = query) {
  if (!isKind(kind)) throw fail('Sözleşme türü geçersiz.', 404);
  let relation = await relationOf(user.id, kind, run);
  if (!relation && kind === 'broadcaster') relation = { label: 'Yayıncı', extra: [] };
  if (!relation) throw fail('Bu sözleşme sizin için geçerli değil.', 404);
  const template = await currentTemplate(kind, run);
  if (!template) throw fail('Bu sözleşme henüz yayımlanmadı.', 404);
  const cfg = await getConfig();
  const text = renderContract({ kind, template, user, relation, company: cfg.contractCompany });
  return { kind, title: template.title, version: template.version, templateId: template.id, text, sha256: sha256(text), relation, template };
}

/**
 * Kabul kaydı (tek dokunuş). c verilirse çağıranın işleminde yazılır (ör. davet kabulüyle aynı işlem: biri olmadan diğeri olmaz).
 * shownSha verilirse uygulamanın gösterdiği metinle karşılaştırılır (arada metin güncellendiyse 409); işlemle birlikte kabulde
 * (davet) metin o an üretilir ve özeti kaydedilir. Aynı sürüm ikinci kez kaydedilmez.
 */
export async function recordAcceptance(user, kind, { shownSha = null, via = 'panel', ip = null, device = {} } = {}, c = null) {
  const run = c ? (t, p) => c.query(t, p) : query;
  const v = await viewFor(user, kind, run);
  if (shownSha && shownSha !== v.sha256) throw fail('Sözleşme metni güncellendi. Lütfen güncel metni yeniden açın.', 409);
  const write = async (cc) => {
    // Aynı kullanıcı aynı sürümü iki kez kaydetmesin (çift dokunma, yeniden deneme): kullanıcı satırı kilitlenir.
    await cc.query(`SELECT 1 FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
    const dup = (await cc.query(`SELECT id, contract_no FROM contract_acceptances WHERE user_id = $1 AND template_id = $2`, [user.id, v.templateId])).rows[0];
    if (dup) return { id: dup.id, contractNo: dup.contract_no, already: true };
    const n = (await cc.query(`SELECT nextval('${KINDS[kind].seq}') AS n`)).rows[0].n;
    const contractNo = `${KINDS[kind].prefix}-${String(n).padStart(6, '0')}`;
    const party = { name: user.display_name || user.username, userId: user.id, publicId: user.public_id ?? null, username: user.username, phone: user.phone ?? null, relation: v.relation.extra };
    const row = (await cc.query(
      `INSERT INTO contract_acceptances(contract_no, user_id, template_id, kind, version, rendered_sha256, template_sha256, party, method, phone, ip, device, via)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'clickwrap',$9,$10,$11,$12) RETURNING id, accepted_at`,
      [contractNo, user.id, v.templateId, kind, v.version, v.sha256, v.template.sha256, JSON.stringify(party), user.phone ?? null, ip, JSON.stringify(device ?? {}), via],
    )).rows[0];
    return { id: row.id, contractNo, acceptedAt: row.accepted_at, already: false };
  };
  return c ? write(c) : tx(write);
}

/**
 * İşlemle birlikte kabul (yayıncı olurken): sözleşme yayımlanmamışsa ya da zaten kabul edilmişse bir şey yapmaz. Edilmemişse ve
 * uygulama contract: true göndermişse aynı işlemde kaydeder; göndermemişse 428 contract_required fırlatır (eski uygulama sürümü).
 */
export async function acceptWithAction(c, user, kind, { consent, via, ip, device }) {
  const run = (t, p) => c.query(t, p);
  if (!(await currentTemplate(kind, run))) return null;
  if ((await run(`SELECT 1 FROM contract_acceptances WHERE user_id = $1 AND kind = $2 LIMIT 1`, [user.id, kind])).rowCount) return null;
  if (consent !== true) {
    throw Object.assign(fail(`${KINDS[kind].title} kabul edilmeden devam edilemez.`, 428), { contractKind: kind });
  }
  return recordAcceptance(user, kind, { via, ip, device }, c);
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
