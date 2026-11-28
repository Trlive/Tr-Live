// Sözleşme kapılarının SQL karşılıkları (bağımlılık yok: cüzdan ve maaş servisleri döngüsel import olmadan kullanabilsin).
//
// Kural (sözleşme md. 20.3): o tür için yayımlanmış bir sözleşme YOKSA kapı açıktır (sistem bugünkü gibi çalışır); varsa kişinin
// en az bir sürümü onaylamış olması gerekir. Güncel sürümü onaylatmak uygulamanın işidir; eski sürümün onayı geçerliliğini korur.
// Onaylanmamış ödeme KAYBOLMAZ: özet 'pending' kalır ve onaydan sonraki ödeme çalışmasında yatar.

/** u = users satırı (yayıncı). */
export const BROADCASTER_CONTRACT_SQL = `(NOT EXISTS (SELECT 1 FROM contract_templates ct WHERE ct.kind = 'broadcaster')
  OR EXISTS (SELECT 1 FROM contract_acceptances ca WHERE ca.user_id = u.id AND ca.kind = 'broadcaster'))`;

/** ownerExpr: ajans sahibinin kullanıcı kimliği ifadesi (ör. a.owner_id). */
export const agencyContractSql = (ownerExpr) => `(NOT EXISTS (SELECT 1 FROM contract_templates ct WHERE ct.kind = 'agency')
  OR EXISTS (SELECT 1 FROM contract_acceptances ca WHERE ca.user_id = ${ownerExpr} AND ca.kind = 'agency'))`;
