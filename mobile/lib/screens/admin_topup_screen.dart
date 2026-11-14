import 'package:flutter/material.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';

/// Yönetici (admin) ekranı: bayilerin bakiye taleplerini inceler. Onayda bayi bakiyesi sunucuda atomik olarak artar ve
/// financial_audit_logs'a yazılır; red bakiyeyi değiştirmez. Yalnızca system_role === 'admin' erişebilir (uç nokta da
/// requireSuperAdmin ile korunur).
class AdminTopupScreen extends StatefulWidget {
  const AdminTopupScreen({super.key});

  @override
  State<AdminTopupScreen> createState() => _AdminTopupScreenState();
}

class _AdminTopupScreenState extends State<AdminTopupScreen> {
  int _version = 0;
  String _status = 'pending';
  bool _busy = false;

  Future<void> _review(Map<String, dynamic> r, String decision) async {
    final approve = decision == 'approve';
    final coins = fmtNumber(r['requestedCoins']);
    if (!await confirm(
      context,
      approve
          ? '$coins Coin, "${r['dealerName'] ?? r['username'] ?? 'bayi'}" hesabına yüklenecek. Ödemenin alındığını teyit ettiniz mi?'
          : 'Bu talep reddedilecek. Bakiye değişmez.',
      action: approve ? 'Onayla' : 'Reddet',
      destructive: !approve,
    )) {
      return;
    }
    if (!mounted) return;
    setState(() => _busy = true);
    final res = await guard(context, () => Api.postOnce('/api/admin/topup-requests/${r['id']}/review', {'decision': decision}));
    if (!mounted) return;
    setState(() => _busy = false);
    if (res != null) {
      toast(context, approve ? 'Onaylandı. Bakiye yüklendi.' : 'Talep reddedildi.');
      setState(() => _version++);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Bayi bakiye talepleri')),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(Gap.l, Gap.s, Gap.l, 0),
          child: SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'pending', label: Text('Bekleyen')),
              ButtonSegment(value: 'approved', label: Text('Onaylı')),
              ButtonSegment(value: 'rejected', label: Text('Reddedilen')),
            ],
            selected: {_status},
            onSelectionChanged: (s) => setState(() {
              _status = s.first;
              _version++;
            }),
          ),
        ),
        Expanded(
          child: AsyncBody<Map<String, dynamic>>(
            version: _version,
            load: () => Api.get('/api/admin/topup-requests', query: {'status': _status}),
            builder: (context, data, reload) {
              final requests = listOf(data['requests']);
              if (requests.isEmpty) {
                return RefreshIndicator(
                  onRefresh: reload,
                  child: ListView(children: const [Padding(padding: EdgeInsets.all(40), child: Center(child: Text('Talep yok.', style: TextStyle(color: Pal.textDim))))]),
                );
              }
              return RefreshIndicator(
                onRefresh: reload,
                child: ListView(padding: const EdgeInsets.all(Gap.l), children: [for (final r in requests) _card(r)]),
              );
            },
          ),
        ),
      ]),
    );
  }

  Widget _card(Map<String, dynamic> r) {
    final pending = (r['status']?.toString() ?? 'pending') == 'pending';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(Gap.m),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.storefront, size: 20, color: Pal.gold),
            const SizedBox(width: Gap.s),
            Expanded(child: Text('${r['dealerName'] ?? '-'} · @${r['username'] ?? '-'}', style: const TextStyle(fontWeight: FontWeight.w700))),
          ]),
          const SizedBox(height: Gap.xs),
          Text('${fmtNumber(r['requestedCoins'])} Coin · paket ${r['packageCode'] ?? '-'}', style: const TextStyle(color: Pal.text)),
          if ((r['referenceNote'] ?? '').toString().isNotEmpty)
            Padding(padding: const EdgeInsets.only(top: 4), child: Text('Not: ${r['referenceNote']}', style: const TextStyle(color: Pal.textDim, fontSize: 12.5))),
          if (pending) ...[
            const SizedBox(height: Gap.s),
            Row(children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy ? null : () => _review(r, 'approve'),
                  icon: const Icon(Icons.check, size: 18),
                  label: const Text('Onayla'),
                ),
              ),
              const SizedBox(width: Gap.s),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _review(r, 'reject'),
                  style: OutlinedButton.styleFrom(foregroundColor: Pal.red),
                  icon: const Icon(Icons.close, size: 18),
                  label: const Text('Reddet'),
                ),
              ),
            ]),
          ] else
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                r['status'] == 'approved' ? 'Onaylandı' : 'Reddedildi',
                style: TextStyle(color: r['status'] == 'approved' ? Pal.green : Pal.red, fontWeight: FontWeight.w600, fontSize: 12.5),
              ),
            ),
        ]),
      ),
    );
  }
}
