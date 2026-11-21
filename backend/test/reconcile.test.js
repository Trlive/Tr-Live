// F-02: Mutabakat, bakiye ile defter arasındaki farkı yakalamalı; tutarlı durumda alarm vermemeli.
import test from 'node:test';
import assert from 'node:assert/strict';

test('mutabakat: tutarlı hareketi geçirir, defter yazmayan değişimi yakalar',
  { skip: !process.env.DATABASE_URL && 'DATABASE_URL yok', timeout: 120000 }, async () => {
    const { query } = await import('../src/infrastructure/database/database.js');
    const { runReconciliation } = await import('../src/modules/wallet/reconcile.service.js');
    const mk = async (coins) => (await query(
      `INSERT INTO users(username, display_name, coins) VALUES($1,$1,$2) RETURNING id`,
      ['rc_' + Math.random().toString(36).slice(2, 9), coins],
    )).rows[0].id;
    const [ok, bad] = [await mk(1000), await mk(1000)];
    const mine = (r) => r.filter((x) => [ok, bad].includes(x.userId ?? x.user_id));
    try {
      // 1) Taban alınır; iki kullanıcı da tutarlı.
      await runReconciliation({ manual: true });
      let open = (await query(`SELECT user_id FROM wallet_recon_items WHERE user_id = ANY($1::uuid[])`, [[ok, bad]])).rows;
      assert.equal(mine(open).length, 0, 'taban alındıktan hemen sonra fark olmamalı');

      // 2) Kurallara uyan hareket: bakiye + defter birlikte.
      await query(`UPDATE users SET coins = coins - 250 WHERE id = $1`, [ok]);
      await query(
        `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, description) VALUES($1,'store_purchase',$2,'test')`,
        [ok, '-250'],
      );
      // 3) Kuralı bozan hareket: bakiye değişti, defter yazılmadı (gerçek hayatta unutulan bir kod yolu).
      await query(`UPDATE users SET coins = coins + 700 WHERE id = $1`, [bad]);

      const out = await runReconciliation({ manual: true });
      assert.ok(out.mismatches >= 1, 'defter yazmayan değişim yakalanmadı');
      const items = (await query(
        `SELECT user_id, coin_diff FROM wallet_recon_items WHERE run_id = $1 AND user_id = ANY($2::uuid[])`,
        [out.runId, [ok, bad]],
      )).rows;
      assert.equal(items.length, 1, 'yalnızca bozuk kullanıcı işaretlenmeliydi');
      assert.equal(items[0].user_id, bad);
      assert.equal(String(items[0].coin_diff), '700', 'fark tutarı yanlış');

      // 4) Alarm mali denetim günlüğüne yazıldı mı?
      const alarm = await query(
        `SELECT 1 FROM financial_audit_logs WHERE action = 'reconcile_mismatch' AND reference_id = $1`, [String(out.runId)],
      );
      assert.equal(alarm.rowCount, 1, 'alarm kaydı yazılmadı');

      // 5) Fark bir kez raporlanır: taban ilerlemediği için aynı fark tekrar görünür (kapanana kadar).
      const again = await runReconciliation({ manual: true });
      assert.ok(again.mismatches >= 1, 'çözülmemiş fark ikinci çalışmada da görünmeli');
    } finally {
      for (const id of [ok, bad]) {
        await query(`DELETE FROM wallet_recon_items WHERE user_id = $1`, [id]).catch(() => {});
        await query(`DELETE FROM wallet_recon_baseline WHERE user_id = $1`, [id]).catch(() => {});
        await query(`DELETE FROM wallet_transactions WHERE user_id = $1`, [id]).catch(() => {});
        await query(`DELETE FROM users WHERE id = $1`, [id]).catch(() => {});
      }
    }
  });

test('basım bütçesi: aylık sınır aşılırsa yükleme reddedilir',
  { skip: !process.env.DATABASE_URL && 'DATABASE_URL yok', timeout: 60000 }, async () => {
    const { query, tx } = await import('../src/infrastructure/database/database.js');
    const { chargeBudget, listBudgets, periodKey } = await import('../src/modules/wallet/coin_budgets.service.js');
    const uid = (await query(`INSERT INTO users(username, display_name, coins) VALUES($1,$1,0) RETURNING id`,
      ['bg_' + Math.random().toString(36).slice(2, 9)])).rows[0].id;
    await query(`INSERT INTO coin_budgets(key, name, monthly_limit) VALUES('t_test','Test bütçesi',1000) ON CONFLICT (key) DO UPDATE SET monthly_limit = 1000, enabled = TRUE`);
    try {
      // Gerçek yükleme yolunun yaptığını yapar: bütçe denetimi + defter satırı, AYNI transaction'da.
      // Aylık kullanım artık yalnızca defterden okunuyor (ayrı basım tablosu kaldırıldı), bu yüzden
      // defter satırı yazılmazsa sınır da denetlenemez — test tam olarak bu bağı doğruluyor.
      const issue = (amount, reason) => tx(async (c) => {
        await chargeBudget(c, { key: 't_test', userId: uid, adminId: null, delta: amount, reason });
        await c.query(`INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, description) VALUES($1,'t_test',$2,$3)`,
          [uid, amount.toString(), reason]);
      });
      await issue(600n, 'ilk');
      await assert.rejects(() => issue(600n, 'sınırı aşan'), /sınırı aşılıyor/, 'sınır aşıldığı hâlde kabul edildi');
      await issue(400n, 'tam sınır');
      const b = (await listBudgets(periodKey())).find((x) => x.key === 't_test');
      assert.equal(b.used, '1000');
      assert.equal(b.left, '0');
      // Kapalı bütçeye yazılamaz.
      await query(`UPDATE coin_budgets SET enabled = FALSE WHERE key = 't_test'`);
      await assert.rejects(() => tx((c) => chargeBudget(c, { key: 't_test', userId: uid, adminId: null, delta: 1n })), /kapalı/);
    } finally {
      await query(`DELETE FROM wallet_transactions WHERE user_id = $1`, [uid]).catch(() => {});
      await query(`DELETE FROM coin_budgets WHERE key = 't_test'`).catch(() => {});
      await query(`DELETE FROM wallet_recon_baseline WHERE user_id = $1`, [uid]).catch(() => {});
      await query(`DELETE FROM users WHERE id = $1`, [uid]).catch(() => {});
    }
  });
