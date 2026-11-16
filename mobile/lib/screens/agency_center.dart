import 'usd_wallet_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import 'agency_screen.dart' show AgencyStatementsScreen;
import 'agency_hosts.dart';
import 'agency_team.dart';

// ------------------------------------------------------------------ ortak yardımcılar
BigInt agBig(dynamic v) => BigInt.tryParse((v ?? '0').toString()) ?? BigInt.zero;
String _two(int n) => n.toString().padLeft(2, '0');

String agDate(dynamic iso, {bool clock = false}) {
  final d = DateTime.tryParse((iso ?? '').toString())?.toLocal();
  if (d == null) return '-';
  final s = '${_two(d.day)}.${_two(d.month)}.${d.year}';
  return clock ? '$s ${_two(d.hour)}:${_two(d.minute)}' : s;
}

/// Kalan süre: "2 gün 5 sa" / "3 sa 10 dk".
String agLeft(dynamic iso) {
  final d = DateTime.tryParse((iso ?? '').toString())?.toLocal();
  if (d == null) return '';
  final diff = d.difference(DateTime.now());
  if (diff.isNegative) return 'az sonra';
  if (diff.inDays > 0) return '${diff.inDays} gün ${diff.inHours % 24} sa';
  if (diff.inHours > 0) return '${diff.inHours} sa ${diff.inMinutes % 60} dk';
  return '${diff.inMinutes} dk';
}

String agPct(int bps) {
  final v = bps / 100;
  return v == v.roundToDouble() ? '%${v.toInt()}' : '%${v.toStringAsFixed(1)}';
}

const kBadgeNames = {'bronz': 'Bronz', 'gumus': 'Gümüş', 'altin': 'Altın', 'super': 'Süper', 'ozel': 'Özel'};

/// Koyu kart (ajans ekranlarının ortak kutusu).
class AgCard extends StatelessWidget {
  final String? title;
  final Widget? trailing;
  final Widget child;
  final EdgeInsetsGeometry padding;
  const AgCard({super.key, this.title, this.trailing, required this.child, this.padding = const EdgeInsets.all(14)});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: padding,
      decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Pal.outline)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(children: [
              Expanded(child: Text(title!, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
              if (trailing != null) trailing!,
            ]),
          ),
        child,
      ]),
    );
  }
}

/// Küçük istatistik kutusu.
class AgStat extends StatelessWidget {
  final String label;
  final String value;
  final String? sub;
  final Color? subColor;
  final IconData? icon;
  final Color color;
  const AgStat({super.key, required this.label, required this.value, this.sub, this.subColor, this.icon, this.color = Pal.cyan});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
      decoration: BoxDecoration(color: Pal.surfaceHi, borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Row(children: [
          if (icon != null) Padding(padding: const EdgeInsets.only(right: 4), child: Icon(icon, size: 13, color: Pal.textDim)),
          Expanded(child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11, color: Pal.textDim))),
        ]),
        const SizedBox(height: 4),
        FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: color))),
        if (sub != null) Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 10.5, color: subColor ?? Pal.textDim, fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

/// İki sütunlu kutu ızgarası (sabit yükseklik gerektirmez).
class AgGrid extends StatelessWidget {
  final List<Widget> children;
  final int columns;
  const AgGrid({super.key, required this.children, this.columns = 2});

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i += columns) {
      final cells = <Widget>[];
      for (var j = 0; j < columns; j++) {
        if (j > 0) cells.add(const SizedBox(width: 8));
        cells.add(Expanded(child: i + j < children.length ? children[i + j] : const SizedBox.shrink()));
      }
      if (rows.isNotEmpty) rows.add(const SizedBox(height: 8));
      rows.add(IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: cells)));
    }
    return Column(children: rows);
  }
}

class AgPill extends StatelessWidget {
  final String text;
  final Color color;
  final IconData? icon;
  const AgPill(this.text, {super.key, this.color = Pal.cyan, this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withValues(alpha: 0.45))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) Padding(padding: const EdgeInsets.only(right: 3), child: Icon(icon, size: 12, color: color)),
        Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}

/// Etiket + ilerleme çubuğu.
class AgProgress extends StatelessWidget {
  final String label;
  final String valueText;
  final double ratio;
  final bool done;
  const AgProgress({super.key, required this.label, required this.valueText, required this.ratio, this.done = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(label, style: const TextStyle(fontSize: 12.5))),
          Text(valueText, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: done ? Pal.green : Pal.textDim)),
          if (done) const Padding(padding: EdgeInsets.only(left: 4), child: Icon(Icons.check_circle, size: 15, color: Pal.green)),
        ]),
        const SizedBox(height: 5),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: ratio.clamp(0.0, 1.0).toDouble(),
            minHeight: 7,
            backgroundColor: Pal.surfaceHi,
            valueColor: AlwaysStoppedAnimation(done ? Pal.green : Pal.cyan),
          ),
        ),
      ]),
    );
  }
}

double agRatio(BigInt value, BigInt target) => target <= BigInt.zero ? 1 : (value.toDouble() / target.toDouble()).clamp(0, 1).toDouble();

// ------------------------------------------------------------------ giriş
/// Profil → Ajans Merkezi. Ajans sahibi ya da asistan "Ajansım" ekranını görür.
class AgencyCenterScreen extends StatefulWidget {
  const AgencyCenterScreen({super.key});

  @override
  State<AgencyCenterScreen> createState() => _AgencyCenterScreenState();
}

class _AgencyCenterScreenState extends State<AgencyCenterScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Ajans Merkezi')),
      body: AsyncBody<Map<String, dynamic>>(
        load: () => Api.get('/api/agency-center/me'),
        builder: (context, me, reload) {
          final owned = mapOf(me['owned']);
          final assistant = mapOf(me['assistant']);
          final aAgency = mapOf(assistant?['agency']);
          if (owned != null && owned['status'] == 'active') return AgencyHomeView(agencyId: owned['id'].toString());
          if (aAgency != null) return AgencyHomeView(agencyId: aAgency['id'].toString());
          final msg = owned != null
              ? (owned['status'] == 'pending' ? 'Ajansınız yönetici onayı bekliyor.' : 'Ajansınız şu anda kullanılamıyor. Destek ile iletişime geçin.')
              : 'Bir ajansınız ya da asistanlık göreviniz yok. Ajanslar yönetici tarafından açılır.';
          return EmptyState(icon: Icons.business_outlined, text: msg);
        },
      ),
    );
  }
}

// ------------------------------------------------------------------ Ajansım
class AgencyHomeView extends StatefulWidget {
  final String agencyId;
  const AgencyHomeView({super.key, required this.agencyId});

  @override
  State<AgencyHomeView> createState() => _AgencyHomeViewState();
}

class _AgencyHomeViewState extends State<AgencyHomeView> {
  int _v = 0;
  bool _statsOpen = true;

  void _reload() {
    if (mounted) setState(() => _v++);
  }

  Future<Map<String, dynamic>> _load() async {
    final res = await Future.wait([Api.get('/api/agency-center/${widget.agencyId}/home'), Api.get('/api/agencies/mine')]);
    return {'home': res[0], 'mine': res[1]};
  }

  Future<void> _open(Widget page) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    _reload();
  }

  Future<void> _inviteHost() async {
    final u = await pickUser(context);
    if (u == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/invite', {'userId': u['id']}));
    if (r == null || !mounted) return;
    toast(context, r['transfer'] == true
        ? '${u['displayName']} başka bir ajansta: kabul ederse transfer isteği oluşur.'
        : '${u['displayName']} kullanıcısına yayıncı daveti gönderildi.');
    _reload();
  }

  Future<void> _selfJoin() async {
    if (!await confirm(context, 'Kendi ajansınızda yayıncı olmak istiyor musunuz?')) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/agencies/${widget.agencyId}/self-join'));
    if (r != null && mounted) {
      toast(context, 'Artık ajansınızın yayıncısısınız.');
      _reload();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AsyncBody<Map<String, dynamic>>(
      version: _v,
      load: _load,
      builder: (context, data, reload) {
        final h = mapOf(data['home']) ?? {};
        final mine = mapOf(data['mine']) ?? {};
        final role = (h['role'] ?? 'owner').toString();
        final isOwner = role != 'assistant';
        final a = mapOf(h['agency']) ?? {};
        final cur = (h['currency'] ?? 'USD').toString();
        final period = mapOf(h['period']) ?? {};
        final earn = mapOf(h['earnings']) ?? {};
        final st = mapOf(h['stats']) ?? {};
        final grade = mapOf(h['grade']) ?? {};
        final rank = mapOf(h['rank']) ?? {};
        final tasks = listOf(h['tasks']);
        final membership = mapOf(mine['membership']);
        final hostAgency = mapOf(membership?['agency']);
        final ownerIsHost = membership?['broadcasterStatus'] == 'approved' && hostAgency?['id'] == a['id'];
        final canAnnounce = role == 'owner' || (role == 'assistant' && a['assistantsCanAnnounce'] == true);
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
            _header(a, role, grade),
            _earningsCard(earn, cur, period, isOwner),
            if ((a['announcement'] ?? '').toString().isNotEmpty || canAnnounce) _announcement(a, canAnnounce),
            _actions(h, isOwner, canAnnounce, a),
            _statsCard(st, cur),
            _rankCard(rank),
            _tasksCard(grade, tasks),
            if (role == 'owner' && !ownerIsHost && membership?['broadcasterStatus'] != 'suspended')
              AgCard(
                child: Row(children: [
                  const Icon(Icons.podcasts, color: Pal.pink),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      hostAgency != null ? 'Şu an "${hostAgency['name']}" ajansında yayıncısınız; kendi ajansınıza geçmek için önce oradan ayrılın.' : 'Kendi ajansınızda yayıncı olarak maaş ve yayın kayıtlarınızı görebilirsiniz.',
                      style: const TextStyle(fontSize: 12.5),
                    ),
                  ),
                  if (hostAgency == null) FilledButton(onPressed: _selfJoin, child: const Text('Yayıncı ol')),
                ]),
              ),
          ]),
        );
      },
    );
  }

  Widget _header(Map<String, dynamic> a, String role, Map<String, dynamic> grade) {
    final logo = Api.absoluteUrl(a['logoUrl'] as String?);
    final code = a['agencyCode']?.toString();
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => _open(AgencyInfoScreen(agencyId: widget.agencyId)),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(colors: [Color(0xFF2B1F45), Color(0xFF17130C)], begin: Alignment.topLeft, end: Alignment.bottomRight),
          border: Border.all(color: const Color(0x668B5CF6)),
        ),
        child: Row(children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: const Color(0xFF6D28D9),
            backgroundImage: logo == null ? null : NetImage(logo, targetW: 168, targetH: 168),
            child: logo == null ? const Icon(Icons.business_center_rounded, color: Colors.white, size: 28) : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Flexible(child: Text((a['name'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900))),
                const SizedBox(width: 6),
                if (grade['name'] != null) _gradeBadge(grade['name'].toString()),
              ]),
              const SizedBox(height: 4),
              Wrap(spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                AgPill(role == 'assistant' ? 'Asistan' : role == 'admin' ? 'Yönetici' : 'Ajans sahibi', color: role == 'assistant' ? const Color(0xFF60A5FA) : Pal.amber),
                if (code != null)
                  InkWell(
                    onTap: () {
                      Clipboard.setData(ClipboardData(text: code));
                      toast(context, 'Ajans kodu kopyalandı.');
                    },
                    child: AgPill('Kod $code', color: Pal.textDim, icon: Icons.copy),
                  ),
                AgPill('${a['broadcasterCount'] ?? 0} yayıncı', color: Pal.green, icon: Icons.podcasts),
              ]),
            ]),
          ),
          const Icon(Icons.chevron_right, color: Pal.textDim),
        ]),
      ),
    );
  }

  Widget _gradeBadge(String g) {
    const colors = {
      'S': [Color(0xFFFF4FA8), Color(0xFF8B5CF6)],
      'A': [Color(0xFFFFD54F), Color(0xFFE08A00)],
      'B': [Color(0xFF5CF2FF), Color(0xFF2563EB)],
      'C': [Color(0xFF86EFAC), Color(0xFF16A34A)],
    };
    final c = colors[g] ?? const [Color(0xFF9CA3AF), Color(0xFF4B5563)];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
      decoration: BoxDecoration(gradient: LinearGradient(colors: c), borderRadius: BorderRadius.circular(6)),
      child: Text('$g Seviye', style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w900, color: Colors.white)),
    );
  }

  Widget _earningsCard(Map<String, dynamic> e, String cur, Map<String, dynamic> period, bool isOwner) {
    Widget mini(String label, String value) => Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: const TextStyle(fontSize: 11, color: Colors.white70)),
            const SizedBox(height: 2),
            FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: Colors.white))),
          ]),
        );
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(16), gradient: const LinearGradient(colors: kGoldDeep, begin: Alignment.topLeft, end: Alignment.bottomRight)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(isOwner ? 'Bu ay tahmini ajans primi' : 'Bu ay tahmini asistan payınız', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
          Text('${period['key'] ?? ''} · ${period['daysLeft'] ?? 0} gün kaldı', style: const TextStyle(color: Colors.white70, fontSize: 11)),
        ]),
        const SizedBox(height: 6),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(fmtMoney(isOwner ? e['monthCents'] : e['myCents'], cur), style: const TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w900)),
        ),
        const SizedBox(height: 10),
        Row(children: isOwner
            ? [
                mini('Bugün', '+${fmtMoney(e['todayCents'], cur)}'),
                mini('Dün', '+${fmtMoney(e['yesterdayCents'], cur)}'),
                mini('Asistan payları', fmtMoney(e['assistantCents'], cur)),
                mini('Size kalan', fmtMoney(e['ownerCents'], cur)),
              ]
            : [
                mini('Pay oranı', agPct((e['shareBps'] as num?)?.toInt() ?? 0)),
                mini('Davet ettiğim', '${e['myHosts'] ?? 0} yayıncı'),
                mini('Yayıncılarımın primi', fmtMoney(e['myBaseCents'], cur)),
              ]),
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: Colors.white, backgroundColor: Colors.black26, shape: const StadiumBorder()),
            onPressed: () => _open(AgencyEarningsScreen(agencyId: widget.agencyId)),
            icon: const Icon(Icons.insights, size: 18),
            label: const Text('Kazanç detayları'),
          ),
        ),
        const Text('Prim, yayıncının ajansınızdayken aldığı elmasın ulaştığı seviyeye göre hesaplanır; kesin tutar dönem kapanınca belli olur.',
            style: TextStyle(color: Colors.white70, fontSize: 10.5)),
      ]),
    );
  }

  Widget _announcement(Map<String, dynamic> a, bool canEdit) {
    final text = (a['announcement'] ?? '').toString();
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: canEdit ? () => _open(AgencyInfoScreen(agencyId: widget.agencyId, editAnnouncement: true)) : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: const Color(0x2238BDF8), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0x5538BDF8))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.campaign_rounded, color: Color(0xFF38BDF8)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Ajans duyurusu', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: Color(0xFF7DD3FC))),
              const SizedBox(height: 3),
              Text(text.isEmpty ? 'Yayıncılarınıza duyuru yazmak için dokunun.' : text, style: TextStyle(fontSize: 13, color: text.isEmpty ? Pal.textDim : Pal.text)),
              if (text.isNotEmpty && a['announcementAt'] != null)
                Padding(padding: const EdgeInsets.only(top: 3), child: Text(agDate(a['announcementAt'], clock: true), style: const TextStyle(fontSize: 10.5, color: Pal.textDim))),
            ]),
          ),
          if (canEdit) const Icon(Icons.edit, size: 16, color: Pal.textDim),
        ]),
      ),
    );
  }

  Widget _actions(Map<String, dynamic> h, bool isOwner, bool canAnnounce, Map<String, dynamic> a) {
    final pendingT = (h['pendingTransfers'] as num?)?.toInt() ?? 0;
    final items = <(IconData, Color, String, int, VoidCallback)>[
      (Icons.groups_rounded, const Color(0xFF34D399), 'Yayıncılar', 0, () => _open(AgencyHostsScreen(agencyId: widget.agencyId))),
      (Icons.person_add_alt_1, const Color(0xFFFF9F1C), 'Yayıncı davet et', 0, _inviteHost),
      if (isOwner) (Icons.support_agent, const Color(0xFF60A5FA), 'Asistanlar', 0, () => _open(AgencyAssistantsScreen(agencyId: widget.agencyId))),
      (Icons.swap_horiz_rounded, const Color(0xFFF472B6), 'Transfer geçmişi', pendingT, () => _open(AgencyTransfersScreen(agencyId: widget.agencyId))),
      if (isOwner) (Icons.card_giftcard, const Color(0xFFFFC43D), 'Davet merkezi', 0, () => _open(InviteCenterScreen(agencyId: widget.agencyId))),
      if (canAnnounce) (Icons.campaign_outlined, const Color(0xFF38BDF8), 'Duyuru', 0, () => _open(AgencyInfoScreen(agencyId: widget.agencyId, editAnnouncement: true))),
      (Icons.table_chart_outlined, const Color(0xFFA78BFA), 'Maaş tablosu', 0, () => _open(const PayTableScreen())),
      (Icons.receipt_long, const Color(0xFFB3A584), 'Hesap özetleri', 0, () => _open(AgencyStatementsScreen(agencyId: widget.agencyId, assistant: !isOwner))),
      (Icons.account_balance_wallet_outlined, const Color(0xFFF2B92A), 'Fasulye cüzdanı', 0, () => _open(const UsdWalletScreen())),
    ];
    return AgCard(
      padding: const EdgeInsets.fromLTRB(6, 12, 6, 6),
      child: LayoutBuilder(builder: (context, c) {
        final w = (c.maxWidth / 4).floorToDouble();
        return Wrap(children: [
          for (final it in items)
            SizedBox(
              width: w,
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: it.$5,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 2),
                  child: Column(children: [
                    Badge(
                      isLabelVisible: it.$4 > 0,
                      label: Text('${it.$4}'),
                      child: Container(
                        width: 42,
                        height: 42,
                        decoration: BoxDecoration(color: it.$2.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(13)),
                        child: Icon(it.$1, color: it.$2, size: 23),
                      ),
                    ),
                    const SizedBox(height: 5),
                    Text(it.$3, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 11, height: 1.15)),
                  ]),
                ),
              ),
            ),
        ]);
      }),
    );
  }

  Widget _statsCard(Map<String, dynamic> st, String cur) {
    final change = st['changePct'] as num?;
    final changeText = change == null ? 'geçen ay veri yok' : '${change >= 0 ? '▲' : '▼'} ${change.abs().toStringAsFixed(1)}% geçen aya göre';
    final changeColor = change == null ? Pal.textDim : (change >= 0 ? Pal.green : Pal.red);
    return AgCard(
      title: 'Ajans istatistikleri',
      trailing: IconButton(
        visualDensity: VisualDensity.compact,
        icon: Icon(_statsOpen ? Icons.expand_less : Icons.expand_more),
        onPressed: () => setState(() => _statsOpen = !_statsOpen),
      ),
      child: Column(children: [
        AgGrid(children: [
          AgStat(label: 'Bu ay elmas', value: '${fmtNumber(st['monthDiamonds'])} 💎', sub: changeText, subColor: changeColor, icon: Icons.diamond_outlined),
          AgStat(label: 'Geçen ay aynı dönem', value: '${fmtNumber(st['lastSameDiamonds'])} 💎', sub: 'Geçen ay toplam ${fmtNumber(st['lastMonthDiamonds'])}', icon: Icons.history),
        ]),
        if (_statsOpen) ...[
          const SizedBox(height: 8),
          AgGrid(columns: 3, children: [
            AgStat(label: 'Bugün', value: fmtNumber(st['todayDiamonds']), sub: 'elmas', icon: Icons.today),
            AgStat(label: 'Dün', value: fmtNumber(st['yesterdayDiamonds']), sub: 'elmas', icon: Icons.event),
            AgStat(label: 'Yayıncı', value: '${st['broadcasters'] ?? 0}', sub: '+${st['newThisMonth'] ?? 0} bu ay', icon: Icons.podcasts),
            AgStat(label: 'Bugün aktif', value: '${st['activeToday'] ?? 0}', sub: 'yayın yaptı', color: Pal.green, icon: Icons.mic),
            AgStat(label: 'Şu an canlı', value: '${st['liveNow'] ?? 0}', sub: 'mikrofonda', color: Pal.red, icon: Icons.sensors),
            AgStat(label: 'Maaş alan', value: '${st['qualified'] ?? 0}', sub: 'seviyeye ulaştı', color: Pal.amber, icon: Icons.workspace_premium),
            AgStat(label: 'Düşüşte', value: '${st['dropped'] ?? 0}', sub: '≥%20 geriledi', color: const Color(0xFFF97316), icon: Icons.trending_down),
            AgStat(label: 'Gün riski', value: '${st['behindDays'] ?? 0}', sub: '${st['minDays'] ?? '-'} gün hedefi', color: const Color(0xFFF97316), icon: Icons.event_busy),
            if (st['salaryCents'] != null) AgStat(label: 'Yayıncı maaşları', value: fmtMoney(st['salaryCents'], cur), sub: 'tahmini toplam', icon: Icons.payments_outlined),
          ]),
        ],
      ]),
    );
  }

  Widget _rankCard(Map<String, dynamic> r) {
    final rank = r['rank'];
    return AgCard(
      child: Row(children: [
        Container(
          width: 52,
          height: 52,
          alignment: Alignment.center,
          decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: [Color(0xFFFFE27A), Color(0xFFD99A0B)])),
          child: Text(rank == null ? '-' : '$rank', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Color(0xFF3A2500))),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(rank == null ? 'Bu ay henüz sıralamada değilsiniz' : 'Aylık ajans sıralaması: $rank / ${r['total']}', style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 3),
            Text(
              r['gapToPrev'] != null
                  ? 'Bir üst sıraya ${fmtNumber(r['gapToPrev'])} 💎 kaldı'
                  : rank == 1
                      ? 'Zirvedesiniz! 🏆'
                      : 'Ekip elması arttıkça sıralamaya girersiniz.',
              style: const TextStyle(fontSize: 12, color: Pal.textDim),
            ),
          ]),
        ),
      ]),
    );
  }

  Widget _tasksCard(Map<String, dynamic> grade, List<Map<String, dynamic>> tasks) {
    final next = mapOf(grade['next']);
    final grades = listOf(grade['grades']);
    final curMin = agBig(grade['min']);
    final nextMin = agBig(next?['min']);
    final remaining = agBig(next?['remaining']);
    final progress = next == null ? 1.0 : agRatio(nextMin - remaining - curMin, nextMin - curMin);
    return AgCard(
      title: 'Görev merkezi',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          for (final g in grades)
            Expanded(
              child: Column(children: [
                Icon(Icons.verified, size: 20, color: g['name'] == grade['name'] ? Pal.amber : Pal.outline),
                Text(g['name'].toString(), style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: g['name'] == grade['name'] ? Pal.amber : Pal.textDim)),
              ]),
            ),
        ]),
        AgProgress(
          label: next == null ? 'En yüksek ajans seviyesindesiniz' : 'Ajans seviyesi: ${grade['name']} → ${next['name']}',
          valueText: next == null ? '' : '${fmtNumber(remaining.toString())} 💎 kaldı',
          ratio: progress,
          done: next == null,
        ),
        const SizedBox(height: 6),
        for (final t in tasks)
          AgProgress(
            label: t['title'].toString(),
            valueText: '${t['value']}/${t['target']}',
            ratio: ((t['value'] as num?) ?? 0) / (((t['target'] as num?) ?? 1) == 0 ? 1 : ((t['target'] as num?) ?? 1)),
            done: ((t['value'] as num?) ?? 0) >= ((t['target'] as num?) ?? 1),
          ),
        const SizedBox(height: 6),
        const Text('Ajans seviyesi aylık ekip elmasına göre belirlenir.', style: TextStyle(fontSize: 11, color: Pal.textDim)),
      ]),
    );
  }
}

// ------------------------------------------------------------------ Ajans bilgisi + duyuru
class AgencyInfoScreen extends StatefulWidget {
  final String agencyId;
  final bool editAnnouncement;
  const AgencyInfoScreen({super.key, required this.agencyId, this.editAnnouncement = false});

  @override
  State<AgencyInfoScreen> createState() => _AgencyInfoScreenState();
}

class _AgencyInfoScreenState extends State<AgencyInfoScreen> {
  int _v = 0;
  final _ann = TextEditingController();
  bool _annLoaded = false;
  bool _saving = false;

  @override
  void dispose() {
    _ann.dispose();
    super.dispose();
  }

  void _reload() {
    if (mounted) setState(() => _v++);
  }

  Future<void> _saveAnnouncement() async {
    if (_saving) return;
    setState(() => _saving = true);
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/announcement', {'text': _ann.text.trim()}));
    if (!mounted) return;
    setState(() => _saving = false);
    if (r != null) {
      toast(context, _ann.text.trim().isEmpty ? 'Duyuru kaldırıldı.' : 'Duyuru yayıncılarınıza gönderildi.');
      _reload();
    }
  }

  Future<void> _editDescription(String current) async {
    const label = 'Açıklama (en fazla 500 karakter; boş = sil)';
    final f = await formDialog(context, 'Ajans açıklaması', [label], initial: {label: current});
    if (f == null || !mounted) return;
    final t = (f[label] ?? '').trim();
    final r = await guard(context, () => Api.patch('/api/agencies/${widget.agencyId}', {'description': t}));
    if (r != null && mounted) {
      toast(context, 'Kaydedildi.');
      _reload();
    }
  }

  Future<void> _toggleAssistants(bool v) async {
    final r = await guard(context, () => Api.post('/api/agency-center/${widget.agencyId}/settings', {'assistantsCanAnnounce': v}));
    if (r != null && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.editAnnouncement ? 'Ajans duyurusu' : 'Ajans bilgisi')),
      body: AsyncBody<Map<String, dynamic>>(
        version: _v,
        load: () => Api.get('/api/agency-center/${widget.agencyId}/home'),
        builder: (context, h, reload) {
          final a = mapOf(h['agency']) ?? {};
          final owner = mapOf(a['owner']);
          final role = (h['role'] ?? '').toString();
          final isOwner = role == 'owner';
          final canAnnounce = isOwner || (role == 'assistant' && a['assistantsCanAnnounce'] == true);
          final grade = mapOf(h['grade']) ?? {};
          if (!_annLoaded) {
            _ann.text = (a['announcement'] ?? '').toString();
            _annLoaded = true;
          }
          final logo = Api.absoluteUrl(a['logoUrl'] as String?);
          Widget row(String k, Widget v) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(children: [SizedBox(width: 120, child: Text(k, style: const TextStyle(color: Pal.textDim))), Expanded(child: v)]),
              );
          final info = AgCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Center(
                child: CircleAvatar(
                  radius: 38,
                  backgroundColor: const Color(0xFF6D28D9),
                  backgroundImage: logo == null ? null : NetImage(logo, targetW: 228, targetH: 228),
                  child: logo == null ? const Icon(Icons.business_center_rounded, color: Colors.white, size: 36) : null,
                ),
              ),
              const SizedBox(height: 8),
              Center(child: Text((a['name'] ?? '').toString(), style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w900))),
              const Divider(height: 22),
              row('Ajans kodu', Row(children: [
                Text((a['agencyCode'] ?? '-').toString(), style: const TextStyle(fontWeight: FontWeight.w800, letterSpacing: 1.4)),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.copy, size: 18),
                  onPressed: () {
                    Clipboard.setData(ClipboardData(text: (a['agencyCode'] ?? '').toString()));
                    toast(context, 'Kopyalandı.');
                  },
                ),
              ])),
              row('Ajans sahibi', Row(children: [
                UserAvatar(user: owner, radius: 13),
                const SizedBox(width: 6),
                Flexible(child: Text((owner?['displayName'] ?? '').toString(), overflow: TextOverflow.ellipsis)),
              ])),
              row('Kuruluş', Text(agDate(a['createdAt']))),
              row('Yayıncı', Text('${a['broadcasterCount'] ?? 0}')),
              row('Asistan', Text('${h['assistantCount'] ?? 0}')),
              row('Ajans seviyesi', Text((grade['name'] ?? '-').toString(), style: const TextStyle(fontWeight: FontWeight.w800, color: Pal.amber))),
              row('Açıklama', Row(children: [
                Expanded(child: Text((a['description'] ?? '').toString().isEmpty ? '-' : a['description'].toString())),
                if (isOwner) IconButton(visualDensity: VisualDensity.compact, icon: const Icon(Icons.edit, size: 18), onPressed: () => _editDescription((a['description'] ?? '').toString())),
              ])),
            ]),
          );
          final ann = AgCard(
            title: 'Ajans duyurusu',
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const Text('Duyuru ajansınızın tüm yayıncılarına bildirim olarak gider ve Yayıncı Merkezi\'nde görünür.', style: TextStyle(fontSize: 12, color: Pal.textDim)),
              const SizedBox(height: 10),
              TextField(
                controller: _ann,
                enabled: canAnnounce,
                maxLength: 200,
                maxLines: 4,
                minLines: 2,
                decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'Örn. Bu akşam 21:00\'de ajans toplantısı var.'),
              ),
              if (canAnnounce)
                Row(children: [
                  if ((a['announcement'] ?? '').toString().isNotEmpty)
                    TextButton(
                      onPressed: _saving
                          ? null
                          : () {
                              _ann.clear();
                              _saveAnnouncement();
                            },
                      child: const Text('Kaldır'),
                    ),
                  const Spacer(),
                  FilledButton.icon(onPressed: _saving ? null : _saveAnnouncement, icon: const Icon(Icons.send), label: const Text('Yayınla')),
                ])
              else
                const Text('Duyuruyu yalnızca ajans sahibi düzenleyebilir.', style: TextStyle(fontSize: 12, color: Pal.textDim)),
              if (isOwner)
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Asistanlar duyuru yazabilsin'),
                  value: a['assistantsCanAnnounce'] == true,
                  onChanged: _toggleAssistants,
                ),
            ]),
          );
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.all(12), children: widget.editAnnouncement ? [ann, info] : [info, ann]),
          );
        },
      ),
    );
  }
}

// ------------------------------------------------------------------ Maaş tablosu
/// 44 seviyeli yayıncı maaş tablosu (Yöntem 1 / Yöntem 2 / ajans primi / ödüller).
class PayTableScreen extends StatelessWidget {
  final int? highlight;
  /// true: görüntülü yayın tablosu; false: sesli oda tablosu.
  final bool video;
  const PayTableScreen({super.key, this.highlight, this.video = false});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(video ? 'Maaş tablosu: görüntülü' : 'Maaş tablosu: sesli'), actions: [
        TextButton(
          onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => PayTableScreen(video: !video))),
          child: Text(video ? 'Sesli' : 'Görüntülü'),
        ),
      ]),
      body: AsyncBody<Map<String, dynamic>>(
        load: () => Api.get('/api/agency-center/pay-table'),
        builder: (context, d, reload) {
          final cur = (d['currency'] ?? 'USD').toString();
          final levels = listOf(video && d['videoLevels'] != null ? d['videoLevels'] : d['levels']);
          final s = mapOf(d['settings']) ?? {};
          String money(dynamic c) {
            final v = agBig(c) ~/ BigInt.from(100);
            return '\$${fmtNumber(v.toString())}';
          }
          const head = TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800, color: Pal.amber);
          const cell = TextStyle(fontSize: 12);
          final cols = <(String, double)>[
            ('Sv', 34.0), ('Gün', 44.0), ('Saat', 44.0), ('Oyun', 44.0), ('Elmas', 104.0), ('Maaş 1', 70.0), ('Maaş 2', 70.0), ('Ajans', 64.0), ('VIP', 70.0), ('Rozet', 70.0), ('Özel ID', 74.0),
          ];
          Widget c(String t, double w, {TextStyle style = cell, Color? color}) => SizedBox(
                width: w,
                child: Text(t, textAlign: TextAlign.center, style: color == null ? style : style.copyWith(color: color, fontWeight: FontWeight.w700)),
              );
          final table = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: const BoxDecoration(color: Pal.surfaceHi, borderRadius: BorderRadius.vertical(top: Radius.circular(10))),
              child: Row(children: [for (final col in cols) c(col.$1, col.$2, style: head)]),
            ),
            for (final l in levels)
              Container(
                padding: const EdgeInsets.symmetric(vertical: 7),
                decoration: BoxDecoration(
                  color: l['level'] == highlight ? Pal.cyan.withValues(alpha: 0.18) : ((l['level'] as num).toInt().isEven ? Pal.surface : Colors.transparent),
                  border: const Border(bottom: BorderSide(color: Color(0x224D3C1C))),
                ),
                child: Row(children: [
                  c('${l['level']}', 34, color: Pal.amber),
                  c(l['days'] == null ? '—' : '${l['days']}', 44),
                  c(l['hours'] == null ? '—' : '${l['hours']}', 44),
                  c('${l['gameHours'] ?? 0}', 44),
                  c(fmtNumber(l['diamonds']), 104),
                  c(money(l['salary1Cents']), 70, color: Pal.green),
                  c(money(l['salary2Cents']), 70, color: const Color(0xFF38BDF8)),
                  c(money(l['agencyCents']), 64, color: Pal.pink),
                  c(l['vipLevel'] == null ? '—' : 'VIP${l['vipLevel']}×${l['vipDays']}g', 70),
                  c(l['badge'] == null ? '—' : (kBadgeNames[l['badge']] ?? l['badge'].toString()), 70),
                  c((l['specialIdDays'] as num? ?? 0) == 0 ? '—' : '${l['specialIdDays']}g${(l['specialIdCount'] as num? ?? 1) > 1 ? ' ×${l['specialIdCount']}' : ''}', 74),
                ]),
              ),
          ]);
          return ListView(padding: const EdgeInsets.all(12), children: [
            AgCard(
              title: 'Nasıl hesaplanır?',
              child: Text(
                '• Yöntem 1: Ay içinde aldığın toplam elmasın ulaştığı seviyenin "Maaş 1" tutarı.\n'
                '• Yöntem 2: Dönem kapanırken bakiyende kalan elmasın ulaştığı seviyenin "Maaş 2" tutarı; bu yöntemde o seviyenin elmas kotası maaşa çevrilir.\n'
                '• İkisinden yüksek olan ödenir (Yayıncı Merkezi\'nden yalnızca Yöntem 1 seçilebilir).\n'
                '• Gün: en az ${s['validDayMinutes'] ?? 60} dakika yayın yapılan gün. "—" olan seviyelerde gün/saat şartı yoktur.\n'
                '${s['requireGameHours'] == true ? '• Oyun saati şartı uygulanır.\n' : '• Oyun saati şu an bilgi amaçlıdır (şart değil).\n'}'
                '• Ajans primi: yayıncının ajanstayken aldığı elmasın seviyesine göre ajansa ödenir.\n'
                '• Ödüller (VIP günü, rozet, özel ID) dönem kapanınca otomatik verilir. Tutarlar $cur cinsindendir.',
                style: const TextStyle(fontSize: 12.5, height: 1.45),
              ),
            ),
            SingleChildScrollView(scrollDirection: Axis.horizontal, child: table),
          ]);
        },
      ),
    );
  }
}
