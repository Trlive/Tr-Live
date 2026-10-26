import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/id_badge.dart';
import 'agency_center.dart';
import 'agency_screen.dart' show periodTitle;

/// Pay oranı penceresi (yüzde). Dönüş: baz puan (bps) ya da null.
Future<int?> askShare(BuildContext context, {required int maxBps, int initialBps = 1000, String title = 'Asistan payı'}) async {
  var value = initialBps.clamp(0, maxBps).toDouble();
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, setS) => AlertDialog(
        title: Text(title),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Asistan, davet ettiği yayıncıların ajans priminden bu oranda pay alır (en fazla ${agPct(maxBps)}).', style: const TextStyle(fontSize: 12.5, color: Pal.textDim)),
          const SizedBox(height: 12),
          Center(child: Text(agPct(value.round()), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900, color: Pal.amber))),
          if (maxBps > 0)
            Slider(
              value: value,
              min: 0,
              max: maxBps.toDouble(),
              divisions: (maxBps / 100).round().clamp(1, 100).toInt(),
              onChanged: (v) => setS(() => value = v),
            )
          else
            const Text('Asistan payı yönetim ayarlarında kapalı (%0).', style: TextStyle(fontSize: 12, color: Pal.textDim)),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Kaydet')),
        ],
      ),
    ),
  );
  return ok == true ? value.round() : null;
}

// ------------------------------------------------------------------ Asistanlar
class AgencyAssistantsScreen extends StatefulWidget {
  final String agencyId;
  const AgencyAssistantsScreen({super.key, required this.agencyId});

  @override
  State<AgencyAssistantsScreen> createState() => _AgencyAssistantsScreenState();
}

class _AgencyAssistantsScreenState extends State<AgencyAssistantsScreen> {
  int _v = 0;
  int _maxBps = 5000;

  void _reload() {
    if (mounted) setState(() => _v++);
  }

  Future<void> _invite(int maxBps) async {
    final u = await pickUser(context);
    if (u == null || !mounted) return;
    final bps = await askShare(context, maxBps: maxBps, title: '${u['displayName']} · asistan payı');
    if (bps == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/assistants/invite', {'userId': u['id'], 'shareBps': bps}));
    if (r != null && mounted) {
      toast(context, 'Asistanlık daveti gönderildi. Davet 7 gün geçerlidir.');
      _reload();
    }
  }

  Future<void> _share(Map<String, dynamic> a, int maxBps) async {
    final bps = await askShare(context, maxBps: maxBps, initialBps: (a['shareBps'] as num?)?.toInt() ?? 0);
    if (bps == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/assistants/${a['id']}/share', {'shareBps': bps}));
    if (r != null && mounted) _reload();
  }

  Future<void> _remove(Map<String, dynamic> a, {bool pending = false}) async {
    final name = mapOf(a['user'])?['displayName'] ?? '';
    if (!await confirm(context, pending ? '$name kişisine gönderilen davet geri alınsın mı?' : '$name asistanlıktan kaldırılsın mı? Davet ettiği yayıncılar ajansınızda kalır.', action: pending ? 'Geri al' : 'Kaldır', destructive: !pending)) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/assistants/${a['id']}/remove'));
    if (r != null && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Ajans asistanlarım'),
          bottom: const TabBar(tabs: [Tab(text: 'Asistanlar'), Tab(text: 'Davetler'), Tab(text: 'Kaldırılanlar')]),
        ),
        floatingActionButton: FloatingActionButton.extended(
          onPressed: () => _invite(_maxBps),
          icon: const Icon(Icons.person_add_alt_1),
          label: const Text('Asistan davet et'),
        ),
        body: AsyncBody<Map<String, dynamic>>(
          version: _v,
          load: () async {
            final d = await Api.get('/api/agency-center/${widget.agencyId}/assistants');
            _maxBps = (d['maxShareBps'] as num?)?.toInt() ?? 5000;
            return d;
          },
          builder: (context, d, reload) {
            final cur = (d['currency'] ?? 'USD').toString();
            final maxBps = (d['maxShareBps'] as num?)?.toInt() ?? 5000;
            final active = listOf(d['active']);
            final pending = listOf(d['pending']);
            final history = listOf(d['history']);
            final header = Padding(
              padding: const EdgeInsets.fromLTRB(4, 0, 4, 10),
              child: Text(
                'En fazla ${d['maxAssistants']} asistan (bekleyen davetler dahil). Asistan yayıncı davet edebilir, ajans istatistiklerini görür; '
                'davet ettiği yayıncıların ajans priminden belirlediğiniz oranda pay alır (ödemeyi yönetim yapar).',
                style: const TextStyle(fontSize: 12, color: Pal.textDim),
              ),
            );
            Widget list(List<Widget> children, String empty) => RefreshIndicator(
                  onRefresh: reload,
                  child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 90), children: [
                    header,
                    if (children.isEmpty) Padding(padding: const EdgeInsets.all(32), child: Text(empty, textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim))),
                    ...children,
                  ]),
                );
            return TabBarView(children: [
              list([
                for (final a in active)
                  AgCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        UserAvatar(user: mapOf(a['user']), radius: 22),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text((mapOf(a['user'])?['displayName'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
                            IdBadge(user: mapOf(a['user']), fontSize: 11, color: Pal.textDim),
                            Text('Asistan: ${agDate(a['since'])} tarihinden beri', style: const TextStyle(fontSize: 11, color: Pal.textDim)),
                          ]),
                        ),
                        PopupMenuButton<String>(
                          onSelected: (v) {
                            if (v == 'share') _share(a, maxBps);
                            if (v == 'remove') _remove(a);
                          },
                          itemBuilder: (_) => const [
                            PopupMenuItem(value: 'share', child: Text('Pay oranını değiştir')),
                            PopupMenuItem(value: 'remove', child: Text('Asistanı kaldır')),
                          ],
                        ),
                      ]),
                      const SizedBox(height: 10),
                      AgGrid(columns: 3, children: [
                        AgStat(label: 'Pay oranı', value: agPct((a['shareBps'] as num?)?.toInt() ?? 0), color: Pal.amber),
                        AgStat(label: 'Davet ettiği', value: '${a['hosts'] ?? 0}', sub: 'yayıncı'),
                        AgStat(label: 'Bu ay payı', value: fmtMoney(a['amountCents'], cur), sub: 'prim ${fmtMoney(a['baseCents'], cur)}', color: Pal.green),
                      ]),
                    ]),
                  ),
              ], 'Henüz asistanınız yok. Aşağıdan davet edebilirsiniz.'),
              list([
                for (final p in pending)
                  AgCard(
                    child: Row(children: [
                      UserAvatar(user: mapOf(p['user']), radius: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text((mapOf(p['user'])?['displayName'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('Pay ${agPct((p['shareBps'] as num?)?.toInt() ?? 0)} · ${agLeft(p['expiresAt'])} içinde yanıtlanmazsa düşer', style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
                        ]),
                      ),
                      TextButton(onPressed: () => _remove(p, pending: true), child: const Text('Geri al')),
                    ]),
                  ),
              ], 'Bekleyen asistanlık daveti yok.'),
              list([
                for (final hst in history)
                  ListTile(
                    leading: UserAvatar(user: mapOf(hst['user']), radius: 18),
                    title: Text((mapOf(hst['user'])?['displayName'] ?? '').toString()),
                    subtitle: Text('${const {'removed': 'Kaldırıldı', 'resigned': 'Kendisi ayrıldı', 'rejected': 'Daveti reddetti', 'cancelled': 'Davet geri alındı / süresi doldu'}[hst['status']] ?? hst['status']}'
                        ' · ${agDate(hst['endedAt'] ?? hst['respondedAt'] ?? hst['createdAt'], clock: true)}'),
                    trailing: Text(agPct((hst['shareBps'] as num?)?.toInt() ?? 0), style: const TextStyle(color: Pal.textDim)),
                  ),
              ], 'Kayıt yok.'),
            ]);
          },
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ Transfer geçmişi
const kTransferKinds = {
  'join': 'Ajansa katıldı',
  'transfer': 'Ajans değişikliği',
  'leave': 'Ajanstan ayrılma',
  'removed': 'Ajanstan çıkarıldı',
  'admin': 'Yönetim işlemi',
};
const kTransferStatus = {
  'pending_source': 'Ajans onayı bekliyor',
  'pending_platform': 'Platform incelemesinde',
  'approved': 'Onaylandı',
  'rejected': 'Reddedildi',
  'cancelled': 'İptal edildi',
};
Color transferColor(String? s) => switch (s) {
      'approved' => Pal.green,
      'rejected' => Pal.red,
      'cancelled' => Pal.textDim,
      _ => Pal.amber,
    };

class AgencyTransfersScreen extends StatefulWidget {
  final String agencyId;
  const AgencyTransfersScreen({super.key, required this.agencyId});

  @override
  State<AgencyTransfersScreen> createState() => _AgencyTransfersScreenState();
}

class _AgencyTransfersScreenState extends State<AgencyTransfersScreen> {
  int _v = 0;
  String _dir = 'all';
  String _status = 'all';

  void _reload() {
    if (mounted) setState(() => _v++);
  }

  Future<void> _decide(Map<String, dynamic> t, bool approve) async {
    String? note;
    if (approve) {
      final what = t['kind'] == 'leave' ? 'ajanstan ayrılmasını' : '"${mapOf(t['to'])?['name']}" ajansına geçmesini';
      if (!await confirm(context, '${mapOf(t['user'])?['displayName']} kişisinin $what onaylıyor musunuz?', action: 'Onayla')) return;
    } else {
      note = await askText(context, 'Reddetme nedeni (isteğe bağlı)', hint: 'Örn. sözleşme süresi dolmadı');
      if (!mounted) return;
      if (!await confirm(context, 'Transfer reddedilsin mi? Yayıncı 7 gün içinde platform incelemesi isteyebilir.', action: 'Reddet', destructive: true)) return;
    }
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/agency-transfers/${t['id']}/respond', {'approve': approve, if (note != null) 'note': note}));
    if (r == null || !mounted) return;
    toast(context, approve ? (r['applied'] == true ? 'Onaylandı.' : 'Uygulanamadı: ${r['note'] ?? ''}') : 'Reddedildi.');
    _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transfer geçmişi')),
      body: AsyncBody<Map<String, dynamic>>(
        version: '$_v|$_dir|$_status',
        load: () => Api.get('/api/agency-center/${widget.agencyId}/transfers', query: {'dir': _dir, 'status': _status}),
        builder: (context, d, reload) {
          final counts = mapOf(d['counts']) ?? {};
          final list = listOf(d['transfers']);
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
              AgGrid(columns: 3, children: [
                AgStat(label: 'Katılan', value: '${counts['joined'] ?? 0}', color: Pal.green, icon: Icons.login),
                AgStat(label: 'Ayrılan', value: '${counts['left'] ?? 0}', color: Pal.red, icon: Icons.logout),
                AgStat(label: 'Onay bekleyen', value: '${counts['pending'] ?? 0}', color: Pal.amber, icon: Icons.hourglass_top),
              ]),
              const SizedBox(height: 10),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'all', label: Text('Tümü')),
                  ButtonSegment(value: 'in', label: Text('Gelen')),
                  ButtonSegment(value: 'out', label: Text('Giden')),
                ],
                selected: {_dir},
                onSelectionChanged: (s) => setState(() => _dir = s.first),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final s in const [('all', 'Tümü'), ('pending', 'Bekleyen'), ('approved', 'Onaylı'), ('rejected', 'Reddedilen'), ('cancelled', 'İptal')])
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(label: Text(s.$2), selected: _status == s.$1, onSelected: (_) => setState(() => _status = s.$1)),
                    ),
                ]),
              ),
              const SizedBox(height: 4),
              const Text('Ajansınızdan ayrılmak / başka ajansa geçmek isteyen yayıncı için onayınız istenir; süresi içinde yanıt verilmezse istek otomatik onaylanır.',
                  style: TextStyle(fontSize: 11, color: Pal.textDim)),
              const SizedBox(height: 8),
              if (list.isEmpty) const Padding(padding: EdgeInsets.all(32), child: Text('Kayıt yok.', textAlign: TextAlign.center, style: TextStyle(color: Pal.textDim))),
              for (final t in list) _item(t),
            ]),
          );
        },
      ),
    );
  }

  Widget _item(Map<String, dynamic> t) {
    final u = mapOf(t['user']);
    final from = mapOf(t['from']);
    final to = mapOf(t['to']);
    final status = t['status']?.toString();
    final inbound = t['direction'] == 'in';
    return AgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          UserAvatar(user: u, radius: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text((u?['displayName'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w800)),
              IdBadge(user: u, fontSize: 11, color: Pal.textDim),
            ]),
          ),
          AgPill(kTransferStatus[status] ?? (status ?? ''), color: transferColor(status)),
        ]),
        const SizedBox(height: 8),
        Row(children: [
          Icon(inbound ? Icons.call_received : Icons.call_made, size: 16, color: inbound ? Pal.green : Pal.red),
          const SizedBox(width: 6),
          Text(kTransferKinds[t['kind']] ?? t['kind'].toString(), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const Spacer(),
          Text(agDate(t['createdAt'], clock: true), style: const TextStyle(fontSize: 11, color: Pal.textDim)),
        ]),
        if (from != null || to != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('${from?['name'] ?? '—'}  →  ${to?['name'] ?? (t['kind'] == 'leave' || t['kind'] == 'removed' ? 'ajanssız' : '—')}', style: const TextStyle(fontSize: 12.5)),
          ),
        if (mapOf(t['invitedBy']) != null) Text('Davet eden asistan: ${mapOf(t['invitedBy'])?['displayName']}', style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
        if (status == 'pending_source' && t['autoAt'] != null)
          Text('${agLeft(t['autoAt'])} içinde yanıt verilmezse otomatik onaylanır.', style: const TextStyle(fontSize: 11.5, color: Pal.amber)),
        if ((t['note'] ?? '').toString().isNotEmpty) Text('Not: ${t['note']}', style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
        if (t['canDecide'] == true)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => _decide(t, false), child: const Text('Reddet'))),
              const SizedBox(width: 8),
              Expanded(child: FilledButton(onPressed: () => _decide(t, true), child: const Text('Onayla'))),
            ]),
          ),
      ]),
    );
  }
}

// ------------------------------------------------------------------ Davet merkezi
class InviteCenterScreen extends StatefulWidget {
  final String agencyId;
  const InviteCenterScreen({super.key, required this.agencyId});

  @override
  State<InviteCenterScreen> createState() => _InviteCenterScreenState();
}

class _InviteCenterScreenState extends State<InviteCenterScreen> {
  int _v = 0;

  void _reload() {
    if (mounted) setState(() => _v++);
  }

  Future<void> _propose() async {
    final u = await pickUser(context);
    if (u == null || !mounted) return;
    final f = await formDialog(context, 'Ajans öner: ${u['displayName']}', ['Ajans adı', 'Not (isteğe bağlı)']);
    if (f == null || !mounted) return;
    final name = (f['Ajans adı'] ?? '').trim();
    if (name.length < 3) return toast(context, 'Ajans adı en az 3 karakter olmalı.', error: true);
    final note = (f['Not (isteğe bağlı)'] ?? '').trim();
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/referrals', {'userId': u['id'], 'name': name, if (note.isNotEmpty) 'note': note}));
    if (r != null && mounted) {
      toast(context, 'Öneriniz yönetime iletildi. Onaylanınca ajans açılır ve davet eden olarak siz kaydedilirsiniz.');
      _reload();
    }
  }

  Future<void> _cancel(Map<String, dynamic> a) async {
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/referrals/${a['id']}/cancel'));
    if (r != null && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Davet Merkezi')),
      floatingActionButton: FloatingActionButton.extended(onPressed: _propose, icon: const Icon(Icons.add_business), label: const Text('Ajans öner')),
      body: AsyncBody<Map<String, dynamic>>(
        version: _v,
        load: () => Api.get('/api/agency-center/${widget.agencyId}/invite-center'),
        builder: (context, d, reload) {
          final cur = (d['currency'] ?? 'USD').toString();
          final r = mapOf(d['rewards']) ?? {};
          final code = (d['code'] ?? '').toString();
          final invited = listOf(d['invited']);
          final apps = listOf(d['applications']);
          final stmts = listOf(d['statements']);
          final ranking = listOf(d['ranking']);
          final bps = (d['referralBps'] as num?)?.toInt() ?? 0;
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 90), children: [
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(16),
                  gradient: const LinearGradient(colors: [Color(0xFFFF4FA8), Color(0xFF8B5CF6)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Ajans davet et, primden pay kazan', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 16)),
                  const SizedBox(height: 4),
                  Text('Davet ettiğiniz ajansların her dönemki ajans priminin ${agPct(bps)}\'i size ödenir.', style: const TextStyle(color: Colors.white, fontSize: 12.5)),
                  const SizedBox(height: 12),
                  Row(children: [
                    const Text('Davet kodunuz', style: TextStyle(color: Colors.white70, fontSize: 12)),
                    const SizedBox(width: 8),
                    Text(code, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 20, letterSpacing: 2)),
                    const Spacer(),
                    IconButton(
                      color: Colors.white,
                      icon: const Icon(Icons.copy),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: 'TR Live\'da ajans açmak ister misin? Davet kodum: $code'));
                        toast(context, 'Davet metni kopyalandı.');
                      },
                    ),
                  ]),
                ]),
              ),
              AgCard(
                title: 'Davet ödüllerim',
                child: AgGrid(columns: 3, children: [
                  AgStat(label: 'Bugün', value: fmtMoney(r['todayCents'], cur), color: Pal.green),
                  AgStat(label: 'Dün', value: fmtMoney(r['yesterdayCents'], cur)),
                  AgStat(label: 'Bu ay (tahmini)', value: fmtMoney(r['monthCents'], cur), color: Pal.amber),
                  AgStat(label: 'Ödenen', value: fmtMoney(r['paidCents'], cur), color: Pal.green),
                  AgStat(label: 'Ödeme bekleyen', value: fmtMoney(r['pendingCents'], cur), color: Pal.amber),
                  AgStat(label: 'Davet ettiğim', value: '${invited.length}', sub: 'ajans'),
                ]),
              ),
              AgCard(
                title: 'Davet ettiğim ajanslar',
                child: invited.isEmpty
                    ? const Text('Henüz davet ettiğiniz ajans yok. "Ajans öner" ile yönetime aday bildirin.', style: TextStyle(color: Pal.textDim, fontSize: 12.5))
                    : Column(children: [
                        for (final a in invited)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: UserAvatar(user: mapOf(a['owner']), radius: 18),
                            title: Text('${a['name']}${a['status'] != 'active' ? ' (${a['status']})' : ''}'),
                            subtitle: Text('${mapOf(a['owner'])?['displayName'] ?? ''} · ${a['hosts']} yayıncı · ${fmtNumber(a['monthDiamonds'])} 💎 · prim ${fmtMoney(a['monthPrimCents'], cur)}'),
                            trailing: Text(fmtMoney(a['myRewardCents'], cur), style: const TextStyle(fontWeight: FontWeight.w800, color: Pal.green)),
                          ),
                      ]),
              ),
              if (apps.isNotEmpty)
                AgCard(
                  title: 'Önerilerim',
                  child: Column(children: [
                    for (final a in apps)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        leading: UserAvatar(user: mapOf(a['user']), radius: 16),
                        title: Text('${a['name']} · ${mapOf(a['user'])?['displayName'] ?? ''}'),
                        subtitle: Text('${const {'pending': 'Yönetim onayı bekliyor', 'approved': 'Onaylandı, ajans açıldı', 'rejected': 'Onaylanmadı', 'cancelled': 'Geri alındı'}[a['status']] ?? a['status']} · ${agDate(a['createdAt'])}'),
                        trailing: a['status'] == 'pending' ? TextButton(onPressed: () => _cancel(a), child: const Text('Geri al')) : null,
                      ),
                  ]),
                ),
              if (ranking.isNotEmpty)
                AgCard(
                  title: 'Davet sıralaması',
                  child: Column(children: [
                    for (var i = 0; i < ranking.length; i++)
                      Container(
                        padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 6),
                        decoration: BoxDecoration(color: ranking[i]['isMe'] == true ? Pal.cyan.withValues(alpha: 0.12) : null, borderRadius: BorderRadius.circular(8)),
                        child: Row(children: [
                          SizedBox(width: 28, child: Text('${i + 1}', style: TextStyle(fontWeight: FontWeight.w900, color: i < 3 ? Pal.amber : Pal.textDim))),
                          Expanded(child: Text(ranking[i]['name'].toString(), overflow: TextOverflow.ellipsis)),
                          Text('${ranking[i]['invited']} ajans', style: const TextStyle(fontWeight: FontWeight.w700)),
                        ]),
                      ),
                  ]),
                ),
              if (stmts.isNotEmpty)
                AgCard(
                  title: 'Kapanan dönemler',
                  child: Column(children: [
                    for (final s in stmts)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        leading: Icon(s['status'] == 'paid' ? Icons.check_circle : Icons.hourglass_bottom, color: s['status'] == 'paid' ? Pal.green : Pal.amber),
                        title: Text('${periodTitle((s['periodKey'] ?? '').toString())} · ${s['invitedAgencyName'] ?? ''}'),
                        subtitle: Text('Prim ${fmtMoney(s['baseCents'], cur)} × ${agPct((s['bps'] as num?)?.toInt() ?? 0)}'),
                        trailing: Text(fmtMoney(s['amountCents'], cur), style: const TextStyle(fontWeight: FontWeight.w800)),
                      ),
                  ]),
                ),
            ]),
          );
        },
      ),
    );
  }
}
