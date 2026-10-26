import 'package:flutter/material.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/id_badge.dart';
import 'agency_center.dart';
import 'agency_screen.dart' show periodTitle;

const _blockText = {'days': 'gün', 'hours': 'saat', 'game': 'oyun saati'};

String _md(dynamic day) {
  final s = (day ?? '').toString();
  return s.length >= 10 ? s.substring(5) : s;
}

String _methodText(dynamic m) => m == 2 ? 'Yöntem 2 · bakiye' : m == 1 ? 'Yöntem 1 · toplam elmas' : '';

/// Yayıncı istatistikleri: ajansın yayıncıları (asistan yalnızca davet ettiklerini görür).
class AgencyHostsScreen extends StatefulWidget {
  final String agencyId;
  const AgencyHostsScreen({super.key, required this.agencyId});

  @override
  State<AgencyHostsScreen> createState() => _AgencyHostsScreenState();
}

class _AgencyHostsScreenState extends State<AgencyHostsScreen> {
  int _v = 0;
  String _filter = 'all';
  String _sort = 'diamonds';
  String _q = '';

  void _reload() {
    if (mounted) setState(() => _v++);
  }

  Future<Map<String, dynamic>> _load() async {
    final res = await Future.wait([
      Api.get('/api/agency-center/${widget.agencyId}/hosts'),
      Api.get('/api/agencies/${widget.agencyId}/requests'),
    ]);
    return {'hosts': res[0], 'requests': listOf(res[1]['requests'])};
  }

  Future<void> _remove(Map<String, dynamic> h) async {
    if (!await confirm(context, '${h['displayName']} ajanstan çıkarılsın mı? Bu ayki ajans primi yalnızca ajanstayken aldığı elmasa göre hesaplanır.', action: 'Çıkar', destructive: true)) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/agencies/${widget.agencyId}/broadcasters/${h['id']}/remove'));
    if (r != null && mounted) {
      toast(context, 'Yayıncı ajanstan çıkarıldı.');
      _reload();
    }
  }

  Future<void> _cancelInvite(Map<String, dynamic> r) async {
    final res = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/invites/${r['id']}/cancel'));
    if (res != null && mounted) _reload();
  }

  Future<void> _invite() async {
    final u = await pickUser(context);
    if (u == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/invite', {'userId': u['id']}));
    if (r == null || !mounted) return;
    toast(context, r['transfer'] == true ? 'Davet gönderildi; kabul ederse transfer isteği oluşur.' : 'Davet gönderildi.');
    _reload();
  }

  bool _match(Map<String, dynamic> h) {
    if (_q.isNotEmpty) {
      final t = '${h['displayName']} ${h['username']} ${h['publicId']}'.toLowerCase();
      if (!t.contains(_q.toLowerCase())) return false;
    }
    switch (_filter) {
      case 'live':
        return h['liveNow'] == true;
      case 'new':
        return h['isNew'] == true;
      case 'dropped':
        return h['dropped'] == true;
      case 'risk':
        return h['behindDays'] == true;
      case 'paid':
        return agBig(h['salaryCents']) > BigInt.zero;
      default:
        return true;
    }
  }

  int _cmp(Map<String, dynamic> a, Map<String, dynamic> b) {
    switch (_sort) {
      case 'hours':
        return ((b['seconds'] as num?) ?? 0).compareTo((a['seconds'] as num?) ?? 0);
      case 'days':
        return ((b['validDays'] as num?) ?? 0).compareTo((a['validDays'] as num?) ?? 0);
      case 'prim':
        return agBig(b['agencyCents']).compareTo(agBig(a['agencyCents']));
      case 'salary':
        return agBig(b['salaryCents']).compareTo(agBig(a['salaryCents']));
      default:
        return agBig(b['diamonds']).compareTo(agBig(a['diamonds']));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Yayıncı istatistikleri'), actions: [
        IconButton(tooltip: 'Yayıncı davet et', icon: const Icon(Icons.person_add_alt_1), onPressed: _invite),
      ]),
      body: AsyncBody<Map<String, dynamic>>(
        version: _v,
        load: _load,
        builder: (context, data, reload) {
          final d = mapOf(data['hosts']) ?? {};
          final role = (d['role'] ?? '').toString();
          final cur = (d['currency'] ?? 'USD').toString();
          final req = mapOf(d['requirements']) ?? {};
          final all = listOf(d['hosts']);
          final hosts = all.where(_match).toList()..sort(_cmp);
          final requests = listOf(data['requests']).where((r) => r['direction'] == 'invite').toList();
          final filters = <(String, String)>[('all', 'Tümü'), ('live', 'Canlı'), ('new', 'Yeni'), ('paid', 'Maaş alan'), ('dropped', 'Düşüşte'), ('risk', 'Gün riski')];
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 10, 12, 24), children: [
              TextField(
                decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Ad veya ID ile ara', isDense: true, border: OutlineInputBorder()),
                onChanged: (v) => setState(() => _q = v.trim()),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(children: [
                  for (final f in filters)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(
                        label: Text('${f.$2}${f.$1 == 'all' ? ' (${all.length})' : ''}'),
                        selected: _filter == f.$1,
                        onSelected: (_) => setState(() => _filter = f.$1),
                      ),
                    ),
                ]),
              ),
              Row(children: [
                Text('${hosts.length} yayıncı', style: const TextStyle(color: Pal.textDim, fontSize: 12)),
                const Spacer(),
                const Text('Sırala: ', style: TextStyle(color: Pal.textDim, fontSize: 12)),
                DropdownButton<String>(
                  value: _sort,
                  underline: const SizedBox.shrink(),
                  items: const [
                    DropdownMenuItem(value: 'diamonds', child: Text('Elmas')),
                    DropdownMenuItem(value: 'hours', child: Text('Yayın süresi')),
                    DropdownMenuItem(value: 'days', child: Text('Geçerli gün')),
                    DropdownMenuItem(value: 'salary', child: Text('Maaş')),
                    DropdownMenuItem(value: 'prim', child: Text('Ajans primi')),
                  ],
                  onChanged: (v) => setState(() => _sort = v ?? _sort),
                ),
              ]),
              Text('Geçerli gün: en az ${req['validDayMinutes'] ?? 60} dk yayın yapılan gün. Elmas: yayıncı onayından sonra alınan hediyeler (kendine gönderilenler hariç).',
                  style: const TextStyle(fontSize: 11, color: Pal.textDim)),
              const SizedBox(height: 8),
              if (requests.isNotEmpty)
                AgCard(
                  title: 'Bekleyen davetler (${requests.length})',
                  child: Column(children: [
                    for (final r in requests)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        leading: UserAvatar(user: mapOf(r['user']), radius: 16),
                        title: Text((mapOf(r['user'])?['displayName'] ?? '').toString()),
                        subtitle: Text('${agDate(r['createdAt'], clock: true)}${mapOf(r['invitedBy']) != null ? ' · Davet: ${mapOf(r['invitedBy'])?['displayName']}' : ''}'),
                        trailing: TextButton(onPressed: () => _cancelInvite(r), child: const Text('Geri al')),
                      ),
                  ]),
                ),
              if (hosts.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(all.isEmpty ? (role == 'assistant' ? 'Henüz davet ettiğiniz bir yayıncı yok.' : 'Henüz yayıncı yok. Sağ üstten davet gönderebilirsiniz.') : 'Bu filtrede yayıncı yok.',
                      textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim)),
                ),
              for (final h in hosts) _hostCard(h, cur, role, req),
            ]),
          );
        },
      ),
    );
  }

  Widget _metric(IconData icon, String text, {Color color = Pal.text}) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: Pal.textDim),
        const SizedBox(width: 3),
        Text(text, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
      ]);

  Widget _hostCard(Map<String, dynamic> h, String cur, String role, Map<String, dynamic> req) {
    final change = h['changePct'] as num?;
    final next = mapOf(h['next']);
    final diamonds = agBig(h['diamonds']);
    final nextDia = agBig(next?['diamonds']);
    final level = h['level'];
    final blocked = h['blocked'];
    final blockedBy = h['blockedBy'] is List ? (h['blockedBy'] as List).map((e) => e.toString()).toList() : <String>[];
    final invitedBy = mapOf(h['invitedBy']);
    return AgCard(
      padding: const EdgeInsets.fromLTRB(12, 12, 6, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Stack(clipBehavior: Clip.none, children: [
            UserAvatar(user: h, radius: 22),
            if (h['liveNow'] == true)
              Positioned(
                right: -2,
                bottom: -2,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(color: Pal.red, borderRadius: BorderRadius.circular(6), border: Border.all(color: Pal.surface, width: 1.5)),
                  child: const Text('CANLI', style: TextStyle(fontSize: 7.5, fontWeight: FontWeight.w900, color: Colors.white)),
                ),
              ),
          ]),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Wrap(spacing: 5, runSpacing: 3, crossAxisAlignment: WrapCrossAlignment.center, children: [
                Text((h['displayName'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                if (h['isNew'] == true) const AgPill('Yeni', color: Pal.green),
                if (h['dropped'] == true) const AgPill('Düşüşte', color: Color(0xFFF97316)),
                if (h['behindDays'] == true) const AgPill('Gün riski', color: Color(0xFFF97316)),
              ]),
              IdBadge(user: h, fontSize: 11, color: Pal.textDim),
              if (invitedBy != null) Text('Davet eden: ${invitedBy['displayName']}', style: const TextStyle(fontSize: 11, color: Pal.textDim)),
            ]),
          ),
          if (role == 'owner')
            PopupMenuButton<String>(
              onSelected: (v) {
                if (v == 'remove') _remove(h);
              },
              itemBuilder: (_) => const [PopupMenuItem(value: 'remove', child: Text('Ajanstan çıkar'))],
            ),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 14, runSpacing: 6, children: [
          _metric(Icons.diamond_outlined, fmtNumber(h['diamonds']), color: Pal.cyan),
          _metric(Icons.timer_outlined, fmtDuration((h['seconds'] as num?) ?? 0)),
          _metric(Icons.event_available, '${h['validDays'] ?? 0} gün'),
          _metric(Icons.today, 'Bugün ${fmtDuration((h['todaySeconds'] as num?) ?? 0)}'),
          if (req['requireGameHours'] == true || ((h['gameSeconds'] as num?) ?? 0) > 0) _metric(Icons.sports_esports, fmtDuration((h['gameSeconds'] as num?) ?? 0)),
        ]),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.only(right: 6),
          child: Row(children: [
            Expanded(
              child: Text(
                level == null ? 'Maaş seviyesi yok' : 'Seviye $level · ${fmtMoney(h['salaryCents'], cur)}',
                style: TextStyle(fontWeight: FontWeight.w800, color: level == null ? Pal.textDim : Pal.green),
              ),
            ),
            Text('Prim ${fmtMoney(h['agencyCents'], cur)}${h['agencyLevel'] != null ? ' (Sv ${h['agencyLevel']})' : ''}',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Pal.pink)),
          ]),
        ),
        if (level != null) Text(_methodText(h['method']), style: const TextStyle(fontSize: 11, color: Pal.textDim)),
        if (blocked != null && blockedBy.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 6, right: 6),
            child: Text('⚠ $blocked. seviyenin elmas kotası tamam; ${blockedBy.map((e) => _blockText[e] ?? e).join(', ')} şartı eksik.',
                style: const TextStyle(fontSize: 11.5, color: Color(0xFFFDBA74))),
          ),
        if (next != null)
          Padding(
            padding: const EdgeInsets.only(right: 6),
            child: AgProgress(
              label: 'Sonraki seviye ${next['level']}',
              valueText: '${fmtNumber(next['remaining'])} 💎 kaldı',
              ratio: agRatio(diamonds, nextDia),
            ),
          ),
        if (change != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('${change >= 0 ? '▲' : '▼'} ${change.abs().toStringAsFixed(1)}% geçen ayın aynı dönemine göre (${fmtNumber(h['lastSameDiamonds'])} 💎)',
                style: TextStyle(fontSize: 11, color: change >= 0 ? Pal.green : Pal.red)),
          ),
      ]),
    );
  }
}

// ------------------------------------------------------------------ Kazanç detayları
class AgencyEarningsScreen extends StatelessWidget {
  final String agencyId;
  const AgencyEarningsScreen({super.key, required this.agencyId});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kazanç detayları')),
      body: AsyncBody<Map<String, dynamic>>(
        load: () => Api.get('/api/agency-center/$agencyId/earnings'),
        builder: (context, d, reload) {
          final role = (d['role'] ?? '').toString();
          final isOwner = role != 'assistant';
          final cur = (d['currency'] ?? 'USD').toString();
          final t = mapOf(d['totals']) ?? {};
          final days = listOf(d['days']);
          final hosts = listOf(d['hosts']);
          final assistants = listOf(d['assistants']);
          final statements = listOf(d['statements']);
          final period = mapOf(d['period']) ?? {};
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
              AgCard(
                title: 'Dönem ${periodTitle((period['key'] ?? '').toString())}',
                child: AgGrid(children: isOwner
                    ? [
                        AgStat(label: 'Toplam ajans primi', value: fmtMoney(t['commissionCents'], cur), color: Pal.green, icon: Icons.payments_outlined),
                        AgStat(label: 'Ekip elması', value: fmtNumber(t['teamDiamonds']), icon: Icons.diamond_outlined),
                        AgStat(label: 'Asistan payları', value: fmtMoney(t['assistantCents'], cur), color: const Color(0xFF60A5FA), icon: Icons.support_agent),
                        AgStat(label: 'Size kalan', value: fmtMoney(t['ownerCents'], cur), color: Pal.amber, icon: Icons.account_balance_wallet_outlined),
                      ]
                    : [
                        AgStat(label: 'Payınız (${agPct((t['shareBps'] as num?)?.toInt() ?? 0)})', value: fmtMoney(t['myCents'], cur), color: Pal.green, icon: Icons.payments_outlined),
                        AgStat(label: 'Yayıncılarınızın primi', value: fmtMoney(t['baseCents'], cur), icon: Icons.groups),
                      ]),
              ),
              if (days.isNotEmpty)
                AgCard(
                  title: 'Günlük elmas ve prim',
                  child: _DailyBars(days: days, currency: cur),
                ),
              AgCard(
                title: 'Yayıncı bazında prim',
                child: hosts.isEmpty
                    ? const Text('Bu dönem henüz hediye yok.', style: TextStyle(color: Pal.textDim))
                    : Column(children: [
                        for (final h in hosts)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            leading: UserAvatar(user: h, radius: 17),
                            title: Text('${h['displayName'] ?? h['username'] ?? ''}${h['inAgency'] == false ? ' (ayrıldı)' : ''}'),
                            subtitle: Text('${fmtNumber(h['agencyDiamonds'])} 💎 · ${h['level'] == null ? 'seviye yok' : 'Sv ${h['level']}'}'
                                '${mapOf(h['invitedBy']) != null ? ' · ${mapOf(h['invitedBy'])?['displayName']}' : ''}'),
                            trailing: Text(fmtMoney(h['agencyCents'], cur), style: const TextStyle(fontWeight: FontWeight.w800, color: Pal.pink)),
                          ),
                      ]),
              ),
              if (isOwner && assistants.isNotEmpty)
                AgCard(
                  title: 'Asistan payları',
                  child: Column(children: [
                    for (final a in assistants)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        dense: true,
                        leading: UserAvatar(user: a, radius: 17),
                        title: Text((a['displayName'] ?? '').toString()),
                        subtitle: Text('${agPct((a['shareBps'] as num?)?.toInt() ?? 0)} · ${a['hosts']} yayıncı · prim ${fmtMoney(a['baseCents'], cur)}'),
                        trailing: Text(fmtMoney(a['amountCents'], cur), style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF60A5FA))),
                      ),
                  ]),
                ),
              AgCard(
                title: 'Kapanan dönemler',
                child: statements.isEmpty
                    ? const Text('Henüz kapanmış dönem yok.', style: TextStyle(color: Pal.textDim))
                    : Column(children: [
                        for (final s in statements)
                          ListTile(
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                            leading: Icon(
                              s['status'] == 'paid' ? Icons.check_circle : s['status'] == 'void' ? Icons.cancel : Icons.hourglass_bottom,
                              color: s['status'] == 'paid' ? Pal.green : s['status'] == 'void' ? Pal.red : Pal.amber,
                            ),
                            title: Text('${periodTitle((s['periodKey'] ?? '').toString())} · ${fmtMoney(isOwner ? s['ownerCents'] : s['amountCents'], cur)}'),
                            subtitle: Text(isOwner
                                ? 'Toplam prim ${fmtMoney(s['commissionCents'], cur)} · asistanlar ${fmtMoney(s['assistantCents'], cur)} · ${s['hostCount']} yayıncı'
                                : 'Yayıncı primi ${fmtMoney(s['baseCents'], cur)} · ${agPct((s['shareBps'] as num?)?.toInt() ?? 0)}'),
                            trailing: Text(s['status'] == 'paid' ? 'Ödendi' : s['status'] == 'void' ? 'İptal' : 'Bekliyor', style: const TextStyle(fontSize: 12)),
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

class _DailyBars extends StatefulWidget {
  final List<Map<String, dynamic>> days;
  final String currency;
  const _DailyBars({required this.days, required this.currency});

  @override
  State<_DailyBars> createState() => _DailyBarsState();
}

class _DailyBarsState extends State<_DailyBars> {
  int? _sel;

  @override
  Widget build(BuildContext context) {
    final days = widget.days;
    var max = BigInt.one;
    for (final d in days) {
      final v = agBig(d['diamonds']);
      if (v > max) max = v;
    }
    final sel = _sel ?? days.length - 1;
    final cur = days[sel.clamp(0, days.length - 1).toInt()];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('${cur['day']}: ${fmtNumber(cur['diamonds'])} 💎 · prim +${fmtMoney(cur['primCents'], widget.currency)}',
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      SizedBox(
        height: 110,
        child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          for (var i = 0; i < days.length; i++)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => setState(() => _sel = i),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 1),
                  child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                    Container(
                      height: 4 + 96 * agRatio(agBig(days[i]['diamonds']), max),
                      decoration: BoxDecoration(
                        color: i == sel ? Pal.amber : (agBig(days[i]['primCents']) > BigInt.zero ? Pal.pink : Pal.cyan.withValues(alpha: 0.55)),
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(3)),
                      ),
                    ),
                  ]),
                ),
              ),
            ),
        ]),
      ),
      const SizedBox(height: 4),
      Row(children: [
        Text(_md(days.first['day']), style: const TextStyle(fontSize: 10, color: Pal.textDim)),
        const Spacer(),
        Text(_md(days.last['day']), style: const TextStyle(fontSize: 10, color: Pal.textDim)),
      ]),
      const SizedBox(height: 4),
      const Text('Pembe çubuk: o gün bir yayıncı yeni prim seviyesine geçti.', style: TextStyle(fontSize: 10.5, color: Pal.textDim)),
    ]);
  }
}
