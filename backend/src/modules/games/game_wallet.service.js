// Oyun paketleri için Coin cüzdanı: her hareket idempotenttir (txId), cüzdan geçmişine ve mali denetim kaydına yazılır.
import { query, tx } from '../../infrastructure/database/database.js';
import { hub } from '../../infrastructure/websocket/realtime.js';

// Oyun paketlerine verilen sözleşme "Number bakiye"dir. Bakiye veritabanında BIGINT; 2^53'ü aşarsa Number() sessizce
// yuvarlardı. Bu yüzden tüm hesap BigInt ile yapılır, yalnızca dışarıya verirken Number'a çevrilir ve güvenli sınırda
// kırpılır. Tam değer isteyen paketler için sonuçta `balanceText` (metin) da bulunur.
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const toNumber = (big) => Number(big > SAFE ? SAFE : big < -SAFE ? -SAFE : big);
const view = (big) => ({ balance: toNumber(big), balanceText: big.toString() });

export class CoinWallet {
  constructor(name = 'Oyun', game = 'game') { this.name = name; this.game = game; }
  async balance(userId) {
    const r = await query(`SELECT coins FROM users WHERE id = $1`, [userId]);
    return toNumber(BigInt(r.rows[0]?.coins ?? 0));
  }
  debit(userId, amount, txId, meta) { return this.#move(userId, -Math.floor(Number(amount)), txId, meta, 'activity_spend', `Etkinlik kaybı: ${this.name}`); }
  credit(userId, amount, txId, meta) { return this.#move(userId, Math.floor(Number(amount)), txId, meta, 'activity_win', `Etkinlik kazancı: ${this.name}`); }

  async #move(userId, delta, txId, meta, type, label) {
    if (!Number.isFinite(delta)) return { ok: false, error: 'BAD_AMOUNT' };
    const amt = BigInt(delta);
    const out = await tx(async (c) => {
      const u = (await c.query(`SELECT coins FROM users WHERE id = $1 AND account_status = 'active' FOR UPDATE`, [userId])).rows[0];
      if (!u) return { ok: false, error: 'NO_USER', balance: 0 };
      const old = (await c.query(`SELECT balance_after FROM game_wallet_tx WHERE tx_id = $1`, [String(txId)])).rows[0];
      if (old) return { ok: true, ...view(BigInt(old.balance_after)), dup: true };
      const before = BigInt(u.coins);
      const after = before + amt;
      if (after < 0n) return { ok: false, error: 'INSUFFICIENT_FUNDS', ...view(before) };
      if (amt === 0n) return { ok: true, ...view(before) };
      await c.query(`UPDATE users SET coins = $2, updated_at = NOW() WHERE id = $1`, [userId, after.toString()]);
      await c.query(`INSERT INTO game_wallet_tx(tx_id, user_id, delta, balance_after) VALUES($1,$2,$3,$4)`, [String(txId), userId, amt.toString(), after.toString()]);
      await c.query(
        `INSERT INTO wallet_transactions(user_id, transaction_type, coin_amount, reference_id, description) VALUES($1,$2,$3,$4,$5)`,
        [userId, type, amt.toString(), String(txId).slice(0, 120), label],
      );
      await c.query(
        `INSERT INTO financial_audit_logs(user_id, action, reference_type, reference_id, amount_coins, balance_before, balance_after, metadata)
         VALUES($1,$2,'game_round',$3,$4,$5,$6,$7)`,
        [userId, type, String(txId).slice(0, 120), amt.toString(), before.toString(), after.toString(), JSON.stringify({ game: this.game, ...(meta ?? {}) })],
      );
      return { ok: true, ...view(after), changed: true };
    });
    if (out.changed) hub.sendToUser(userId, { type: 'wallet', coins: out.balanceText });
    return out.changed ? { ok: true, balance: out.balance, balanceText: out.balanceText } : out;
  }
}

