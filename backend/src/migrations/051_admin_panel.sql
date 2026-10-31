-- v2.70: Web yönetim paneli sorguları için dizinler (kullanıcının gönderdiği hediyeler, hakkındaki şikâyetler,
-- yetkilinin işlem kaydı, oda sahibine göre odalar, platform geneli cüzdan hareketleri, günlük istatistik).
CREATE INDEX IF NOT EXISTS idx_gift_tx_sender_time ON gift_transactions(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_user_id, created_at DESC) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_room ON reports(room_id, created_at DESC) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_admin_created ON financial_audit_logs(admin_id, created_at DESC) WHERE admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_owner_created ON rooms(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_created ON wallet_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
