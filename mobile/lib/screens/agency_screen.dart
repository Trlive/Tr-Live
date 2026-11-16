import 'usd_wallet_screen.dart';
import 'package:flutter/material.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import 'agency_center.dart';
import 'agency_team.dart' show kTransferKinds, kTransferStatus, transferColor;

const _statusText = {
  'pending': 'İnceleniyor',
  'approved': 'Onaylı',
  'rejected': 'Reddedildi',
  'suspended': 'Askıya alındı',
  'active': 'Aktif',
};

const _kycText = {'none': 'Doğrulanmadı', 'pending': 'İnceleniyor', 'approved': 'Onaylı', 'rejected': 'Reddedildi'};
const _blockText = {'days': 'gün', 'hours': 'saat', 'game': 'oyun saati'};

String periodTitle(String key) {
  if (key.startsWith('W')) return 'Hafta ${key.substring(1)}';
  return key;
}

String _usd(dynamic cents, String cur) => fmtMoney(cents, cur);

/// Yayıncı Merkezi: sesli / görüntülü maaş kırılımı satırı.
Widget _splitRow(IconData icon, String title, Map<String, dynamic> k, String cur) {
  final hours = (((k['seconds'] as num?) ?? 0) / 3600).toStringAsFixed(1);
  final level = k['level'];
  final cut = k['shortfall'] == true;
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Pal.outline)),
    child: Row(children: [
      Icon(icon, size: 20, color: Pal.gold),
      const SizedBox(width: 10),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
          Text(
            '${fmtNumber(k['diamonds'])} 💎 · $hours sa · ${k['validDays'] ?? 0} gün · ${level == null ? 'seviye yok' : 'Sv $level'}${cut ? ' (şart eksik: kesintili)' : ''}',
            style: const TextStyle(fontSize: 11.5, color: Pal.textDim),
          ),
        ]),
      ),
      Text(_usd(k['cents'], cur), style: const TextStyle(fontWeight: FontWeight.w900, color: Pal.gold)),
    ]),
  );
}

/// 'broadcaster' → Yayıncı Merkezi (ajans daveti, maaş); 'agency' → Ajans Merkezi (ajans sahibi / asistan).
class AgencyScreen extends StatefulWidget {
  final String mode;
  const AgencyScreen({super.key, this.mode = 'broadcaster'});

  @override
  State<AgencyScreen> createState() => _AgencyScreenState();
}

class _AgencyScreenState extends State<AgencyScreen> {
  int _version = 0;

  void _reload() {
    if (mounted) setState(() => _version++);
  }

  Future<Map<String, dynamic>> _load() async {
    final res = await Future.wait([Api.get('/api/broadcaster/me'), Api.get('/api/broadcaster/requests')]);
    return {'broadcaster': mapOf(res[0]['broadcaster']), 'requests': listOf(res[1]['requests'])};
  }

  Future<void> _act(String? confirmText, Future<Map<String, dynamic>> Function() action, {String? done}) async {
    if (confirmText != null && !await confirm(context, confirmText)) return;
    if (!mounted) return;
    final r = await guard(context, action);
    if (r == null || !mounted) return;
    if (done != null) toast(context, done);
    _reload();
  }

  Future<void> _respondInvite(Map<String, dynamic> r, bool accept) async {
    final res = await guard(context, () => Api.post('/api/agency-requests/${r['id']}/respond', {'accept': accept}));
    if (res == null || !mounted) return;
    if (!accept) {
      toast(context, 'Davet reddedildi.');
    } else if (res['transfer'] == 'pending') {
      toast(context, 'Transfer isteğin gönderildi. Mevcut ajansın onaylayınca (en geç ${agLeft(res['autoAt'])}) yeni ajansa geçersin.');
    } else {
      toast(context, 'Ajansa katıldın! 🎉');
    }
    _reload();
  }

  Future<void> _leave() async {
    if (!await confirm(
      context,
      'Ajanstan ayrılmak istiyor musun?\n\nAjansın onayı istenir; süresi içinde yanıt vermezse istek otomatik onaylanır. '
      'Dönem kapanırken bir ajansa bağlı değilsen o dönemin maaşı oluşmaz.',
      action: 'Ayrılma isteği gönder',
      destructive: true,
    )) {
      return;
    }
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/broadcaster/leave-agency'));
    if (r == null || !mounted) return;
    toast(context, r['pending'] == true ? 'Ayrılma isteğin ajansına iletildi.' : 'Ajanstan ayrıldın.');
    _reload();
  }

  Future<void> _setPref(bool keepDiamonds) async {
    final r = await guard(context, () => Api.post('/api/broadcaster/pay-pref', {'pref': keepDiamonds ? 1 : 0}));
    if (r != null && mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.mode == 'agency') return const AgencyCenterScreen();
    return Scaffold(
      appBar: AppBar(title: const Text('Yayıncı Merkezi'), actions: [
        IconButton(tooltip: 'Fasulye cüzdanı', icon: const Icon(Icons.account_balance_wallet_outlined), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const UsdWalletScreen()))),
        IconButton(tooltip: 'Maaş tablosu', icon: const Icon(Icons.table_chart_outlined), onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PayTableScreen()))),
      ]),
      body: AsyncBody<Map<String, dynamic>>(
        version: _version,
        load: _load,
        builder: (context, data, reload) {
          final b = mapOf(data['broadcaster']);
          final requests = listOf(data['requests']).where((r) => r['direction'] == 'invite').toList();
          final agency = mapOf(b?['agency']);
          final status = b?['status']?.toString();
          final isHost = status == 'approved';
          final ann = mapOf(b?['announcement']);
          final pendingT = mapOf(b?['pendingTransfer']);
          final rejectedT = mapOf(b?['rejectedTransfer']);
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.fromLTRB(12, 12, 12, 24), children: [
              for (final r in requests) _inviteCard(r),
              if (pendingT != null) _transferCard(pendingT, pending: true),
              if (rejectedT != null && rejectedT['canEscalate'] == true) _transferCard(rejectedT, pending: false),
              if (ann != null && (ann['text'] ?? '').toString().isNotEmpty)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: const Color(0x2238BDF8), borderRadius: BorderRadius.circular(14), border: Border.all(color: const Color(0x5538BDF8))),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.campaign_rounded, color: Color(0xFF38BDF8)),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('${agency?['name'] ?? 'Ajans'} duyurusu', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5, color: Color(0xFF7DD3FC))),
                        const SizedBox(height: 3),
                        Text(ann['text'].toString()),
                        Text(agDate(ann['at'], clock: true), style: const TextStyle(fontSize: 10.5, color: Pal.textDim)),
                      ]),
                    ),
                  ]),
                ),
              if (isHost)
                _broadcasterCard(b!, agency, pendingT != null)
              else
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Yayıncı değilsiniz. Yayıncı olmak için bir ajansın sizi davet etmesi gerekir; davet Mesajlar sayfanıza gelir.', style: TextStyle(color: Pal.textDim)),
                ),
            ]),
          );
        },
      ),
    );
  }

  Widget _inviteCard(Map<String, dynamic> r) {
    final transfer = r['transfer'] == true;
    return AgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.mail_outline, color: Pal.amber),
          const SizedBox(width: 8),
          Expanded(child: Text('${mapOf(r['agency'])?['name']} seni yayıncı olarak davet etti', style: const TextStyle(fontWeight: FontWeight.w700))),
        ]),
        if (transfer)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('Şu an başka bir ajanstasın: kabul edersen mevcut ajansına transfer isteği gider; onaylanınca (ya da süre dolunca) yeni ajansa geçersin.',
                style: TextStyle(fontSize: 12, color: Pal.textDim)),
          ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(child: OutlinedButton(onPressed: () => _respondInvite(r, false), child: const Text('Reddet'))),
          const SizedBox(width: 8),
          Expanded(child: FilledButton(onPressed: () => _respondInvite(r, true), child: Text(transfer ? 'Transfer iste' : 'Kabul et'))),
        ]),
      ]),
    );
  }

  Widget _transferCard(Map<String, dynamic> t, {required bool pending}) {
    final st = t['status']?.toString();
    final to = mapOf(t['to']);
    final from = mapOf(t['from']);
    return AgCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.swap_horiz_rounded, color: Color(0xFFF472B6)),
          const SizedBox(width: 8),
          Expanded(child: Text(kTransferKinds[t['kind']] ?? 'Transfer', style: const TextStyle(fontWeight: FontWeight.w800))),
          AgPill(kTransferStatus[st] ?? (st ?? ''), color: transferColor(st)),
        ]),
        const SizedBox(height: 6),
        Text('${from?['name'] ?? '—'}  →  ${to?['name'] ?? 'ajanssız'}'),
        if (st == 'pending_source' && t['autoAt'] != null)
          Text('Ajansın ${agLeft(t['autoAt'])} içinde yanıt vermezse otomatik onaylanır.', style: const TextStyle(fontSize: 12, color: Pal.amber)),
        if (st == 'pending_platform') const Text('İsteğin platform (yönetim) incelemesinde.', style: TextStyle(fontSize: 12, color: Pal.amber)),
        if (!pending && (t['note'] ?? '').toString().isNotEmpty) Text('Neden: ${t['note']}', style: const TextStyle(fontSize: 12, color: Pal.textDim)),
        const SizedBox(height: 8),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          if (pending)
            TextButton(
              onPressed: () => _act('Transfer isteğinden vazgeçilsin mi?', () => Api.post('/api/agency-transfers/${t['id']}/cancel'), done: 'İstek geri alındı.'),
              child: const Text('Vazgeç'),
            ),
          if (!pending)
            FilledButton.tonal(
              onPressed: () => _act('Reddedilen transfer platform (yönetim) incelemesine gönderilsin mi?', () => Api.post('/api/agency-transfers/${t['id']}/escalate'),
                  done: 'İsteğin yönetime iletildi.'),
              child: const Text('Platforma başvur'),
            ),
        ]),
      ]),
    );
  }

  Widget _kycRow(Map<String, dynamic> b) {
    final kyc = (b['kycStatus'] ?? 'none').toString();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(children: [
        Icon(Icons.verified_user_outlined, size: 18, color: kyc == 'approved' ? Pal.green : Pal.amber),
        const SizedBox(width: 6),
        Expanded(child: Text('Kimlik doğrulama (maaş ödemesi için gerekir): ${_kycText[kyc] ?? kyc}', style: const TextStyle(fontSize: 12))),
        if (kyc == 'none' || kyc == 'rejected')
          TextButton(onPressed: () => _act(null, () => Api.post('/api/me/kyc/request'), done: 'Başvurunuz alındı.'), child: const Text('Başvur')),
      ]),
    );
  }

  Widget _broadcasterCard(Map<String, dynamic> b, Map<String, dynamic>? agency, bool transferPending) {
    final p = mapOf(b['progress']);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      AgCard(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.podcasts, color: Pal.pink),
            const SizedBox(width: 8),
            Expanded(child: Text('Yayıncı · ${_statusText[b['status']] ?? b['status']}', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
            Text('Toplam ${fmtNumber(b['totalDiamonds'])} 💎', style: const TextStyle(fontSize: 12, color: Pal.textDim)),
          ]),
          if (agency == null)
            const Padding(
              padding: EdgeInsets.only(top: 8),
              child: Text('Şu an bir ajansa bağlı değilsin. Dönem kapanırken bir ajansta değilsen maaş oluşmaz.', style: TextStyle(fontSize: 12, color: Colors.orangeAccent)),
            ),
          if (agency != null) ...[
            const Divider(height: 20),
            Row(children: [
              const Icon(Icons.business, size: 20, color: Pal.textDim),
              const SizedBox(width: 8),
              Expanded(child: Text('Ajans: ${agency['name']}', style: const TextStyle(fontWeight: FontWeight.w600))),
              if (!transferPending) TextButton(onPressed: _leave, child: const Text('Ayrıl')),
            ]),
          ],
          _kycRow(b),
        ]),
      ),
      if (p != null) _progressPanel(p, (b['payPref'] as num?)?.toInt() ?? 0),
      Row(children: [
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HostStatementsScreen())),
            icon: const Icon(Icons.receipt_long),
            label: const Text('Maaş özetlerim'),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: OutlinedButton.icon(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const MyTransfersScreen())),
            icon: const Icon(Icons.swap_horiz),
            label: const Text('Transferlerim'),
          ),
        ),
      ]),
      const SizedBox(height: 8),
      const Text('Kendine gönderdiğin hediyeler maaşa ve ajans primine sayılmaz.', style: TextStyle(color: Pal.textDim, fontSize: 11.5)),
    ]);
  }

  Widget _methodBox({required String title, required String amountLabel, required String amount, required String result, required bool chosen, required bool disabled, String? note}) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: chosen ? Pal.green.withValues(alpha: 0.12) : Pal.surfaceHi,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: chosen ? Pal.green : Colors.transparent, width: 1.4),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5))),
          if (chosen) const AgPill('Ödenecek', color: Pal.green),
        ]),
        const SizedBox(height: 4),
        Text(amountLabel, style: const TextStyle(fontSize: 10.5, color: Pal.textDim)),
        FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(amount, style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15, color: Pal.cyan))),
        const SizedBox(height: 4),
        Text(result, style: TextStyle(fontWeight: FontWeight.w700, color: disabled ? Pal.textDim : (chosen ? Pal.green : Pal.text), fontSize: 12.5)),
        if (note != null) Text(note, style: const TextStyle(fontSize: 10.5, color: Pal.textDim)),
      ]),
    );
  }

  Widget _progressPanel(Map<String, dynamic> p, int pref) {
    final cur = (p['currency'] ?? 'USD').toString();
    final req = mapOf(p['requirements']) ?? {};
    final method = (p['method'] as num?)?.toInt();
    final next = mapOf(p['next']);
    final current = mapOf(p['current']);
    final blocked = mapOf(p['blocked']);
    final blockedBy = p['blockedBy'] is List ? (p['blockedBy'] as List).map((e) => e.toString()).toList() : <String>[];
    final allow2 = req['allowBalanceMethod'] != false;
    final seconds = (p['seconds'] as num?) ?? 0;
    final validDays = (p['validDays'] as num?)?.toInt() ?? 0;
    final diamonds = agBig(p['diamonds']);
    // Hedef: bir sonraki seviye (yoksa mevcut). Gün / saat şartı o seviyeye göre gösterilir.
    final target = next ?? current;
    final tDays = (target?['days'] as num?)?.toInt();
    final tHours = (target?['hours'] as num?)?.toInt();
    final tGame = (target?['gameHours'] as num?)?.toInt() ?? 0;
    String levelText(dynamic lvl, dynamic cents) => lvl == null ? 'Seviye yok' : 'Seviye $lvl → ${_usd(cents, cur)}';
    final rewards = <Widget>[];
    if (current != null) {
      if (current['vipLevel'] != null) rewards.add(AgPill('VIP ${current['vipLevel']} · ${current['vipDays']} gün', color: Pal.amber, icon: Icons.workspace_premium));
      if (current['badge'] != null) rewards.add(AgPill('${kBadgeNames[current['badge']] ?? current['badge']} Yayıncı rozeti', color: Pal.pink, icon: Icons.military_tech));
      if (((current['specialIdDays'] as num?) ?? 0) > 0) rewards.add(AgPill('Özel ID · ${current['specialIdDays']} gün', color: const Color(0xFF38BDF8), icon: Icons.badge_outlined));
    }
    return AgCard(
      title: 'Bu dönem · ${periodTitle((p['periodKey'] ?? '').toString())}',
      trailing: Text('${p['daysLeft'] ?? 0} gün kaldı', style: const TextStyle(fontSize: 12, color: Pal.textDim)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AgGrid(columns: 3, children: [
          AgStat(label: 'Geçerli gün', value: '$validDays', sub: '≥${req['validDayMinutes'] ?? 60} dk/gün', icon: Icons.event_available),
          AgStat(label: 'Yayın süresi', value: fmtDuration(seconds), sub: 'Bugün ${fmtDuration((p['todaySeconds'] as num?) ?? 0)}', icon: Icons.timer_outlined),
          AgStat(label: 'Oyun süresi', value: fmtDuration((p['gameSeconds'] as num?) ?? 0), sub: req['requireGameHours'] == true ? 'şart' : 'bilgi', icon: Icons.sports_esports),
        ]),
        const SizedBox(height: 10),
        AgGrid(children: [
          _methodBox(
            title: 'Yöntem 1',
            amountLabel: 'Bu ay alınan elmas',
            amount: '${fmtNumber(p['diamonds'])} 💎',
            result: levelText(p['level1'], p['salary1Cents']),
            chosen: method == 1,
            disabled: false,
          ),
          _methodBox(
            title: 'Yöntem 2',
            amountLabel: 'Bakiyedeki elmas',
            amount: '${fmtNumber(p['balance'])} 💎',
            result: !allow2 ? 'Kapalı' : (pref == 1 ? 'Kapalı (tercihin)' : levelText(p['level2'], p['salary2Cents'])),
            chosen: method == 2,
            disabled: !allow2 || pref == 1,
            note: allow2 && pref != 1 ? 'Seçilirse kota elmas maaşa çevrilir' : null,
          ),
        ]),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), gradient: const LinearGradient(colors: kGoldDeep)),
          child: Row(children: [
            const Icon(Icons.payments, color: Colors.white),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Tahmini maaş', style: TextStyle(color: Colors.white70, fontSize: 12)),
                Text(_usd(p['estimatedCents'], cur), style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900)),
              ]),
            ),
            if (method != null) Text('Yöntem $method', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          ]),
        ),
        // Sesli ve görüntülü ayrı hesaplanıyorsa kırılım: her tarafın elması, süresi, seviyesi ve maaşı.
        if (p['split'] == true && mapOf(p['video']) != null) ...[
          const SizedBox(height: 8),
          _splitRow(Icons.mic, 'Sesli oda', mapOf(p['audio']) ?? const {}, cur),
          const SizedBox(height: 6),
          _splitRow(Icons.videocam, 'Görüntülü yayın', mapOf(p['video']) ?? const {}, cur),
        ],
        if (method == 2)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text('Dönem kapanınca bakiyenden ${fmtNumber(p['consumeDiamonds'])} elmas maaşa çevrilir (o anki bakiye yetmezse Yöntem 1 uygulanır).',
                style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
          ),
        if (p['atRisk'] == true)
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
            child: Text('Zorunlu resmi etkinlik sayısı tamamlanmadı (${p['eventCount']}/${p['minEventCount']}); maaşından kesinti uygulanacak (${_usd(p['baseCents'], cur)} → ${_usd(p['estimatedCents'], cur)}).',
                style: const TextStyle(fontSize: 12, color: Colors.orangeAccent)),
          ),
        if (blocked != null && blockedBy.isNotEmpty)
          Container(
            margin: const EdgeInsets.only(top: 8),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.orange.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(8)),
            child: Text('${blocked['level']}. seviyenin elmas kotası tamam ama ${blockedBy.map((e) => _blockText[e] ?? e).join(', ')} şartı eksik '
                '(${blocked['days'] != null ? '${blocked['days']} gün' : ''}${blocked['hours'] != null ? ', ${blocked['hours']} saat' : ''}).',
                style: const TextStyle(fontSize: 12, color: Color(0xFFFDBA74))),
          ),
        if (next != null) ...[
          const SizedBox(height: 4),
          AgProgress(
            label: 'Sonraki seviye ${next['level']} · Maaş ${_usd(next['salary1Cents'], cur)} / ${_usd(next['salary2Cents'], cur)}',
            valueText: '${fmtNumber(next['remaining'])} 💎 kaldı',
            ratio: agRatio(diamonds, agBig(next['diamonds'])),
          ),
        ],
        if (tDays != null) AgProgress(label: 'Geçerli gün (hedef $tDays)', valueText: '$validDays / $tDays', ratio: tDays == 0 ? 1.0 : validDays / tDays, done: validDays >= tDays),
        if (tHours != null) AgProgress(label: 'Yayın saati (hedef $tHours sa)', valueText: fmtDuration(seconds), ratio: tHours == 0 ? 1.0 : seconds / (tHours * 3600), done: seconds >= tHours * 3600),
        if (req['requireGameHours'] == true && tGame > 0)
          AgProgress(label: 'Oyun saati (hedef $tGame sa)', valueText: fmtDuration((p['gameSeconds'] as num?) ?? 0), ratio: ((p['gameSeconds'] as num?) ?? 0) / (tGame * 3600), done: ((p['gameSeconds'] as num?) ?? 0) >= tGame * 3600),
        if (target != null && tDays == null && tHours == null)
          const Padding(padding: EdgeInsets.only(top: 6), child: Text('Bu seviyede gün / saat şartı yok.', style: TextStyle(fontSize: 11.5, color: Pal.textDim))),
        if (rewards.isNotEmpty) ...[
          const SizedBox(height: 10),
          const Text('Seviye ödüllerin (dönem kapanınca verilir)', style: TextStyle(fontSize: 12, color: Pal.textDim)),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: rewards),
        ],
        if (allow2)
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Bakiyemdeki elmaslar maaşa çevrilmesin', style: TextStyle(fontSize: 13.5)),
            subtitle: const Text('Açıkken yalnızca Yöntem 1 (toplam elmas) uygulanır.', style: TextStyle(fontSize: 11.5)),
            value: pref == 1,
            onChanged: _setPref,
          ),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PayTableScreen(highlight: (p['tier'] as num?)?.toInt()))),
            icon: const Icon(Icons.table_chart_outlined, size: 18),
            label: const Text('Maaş tablosunu gör'),
          ),
        ),
      ]),
    );
  }
}

// ------------------------------------------------------------------ Transferlerim
class MyTransfersScreen extends StatelessWidget {
  const MyTransfersScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transferlerim')),
      body: AsyncBody<List<Map<String, dynamic>>>(
        load: () async => listOf((await Api.get('/api/broadcaster/transfers'))['transfers']),
        builder: (context, list, reload) => RefreshIndicator(
          onRefresh: reload,
          child: list.isEmpty
              ? ListView(children: const [Padding(padding: EdgeInsets.all(32), child: Center(child: Text('Kayıt yok.')))])
              : ListView(padding: const EdgeInsets.all(12), children: [
                  for (final t in list)
                    AgCard(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Expanded(child: Text(kTransferKinds[t['kind']] ?? t['kind'].toString(), style: const TextStyle(fontWeight: FontWeight.w800))),
                          AgPill(kTransferStatus[t['status']] ?? t['status'].toString(), color: transferColor(t['status']?.toString())),
                        ]),
                        const SizedBox(height: 4),
                        Text('${mapOf(t['from'])?['name'] ?? '—'}  →  ${mapOf(t['to'])?['name'] ?? 'ajanssız'}'),
                        Text(agDate(t['createdAt'], clock: true), style: const TextStyle(fontSize: 11, color: Pal.textDim)),
                        if ((t['note'] ?? '').toString().isNotEmpty) Text('Not: ${t['note']}', style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
                      ]),
                    ),
                ]),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ Hesap özetleri
String _rewardText(Map<String, dynamic>? r) {
  if (r == null || r.isEmpty) return '';
  final parts = <String>[];
  final vip = mapOf(r['vip']);
  if (vip != null) parts.add(vip['skipped'] == true ? 'VIP ${vip['level']} (daha yüksek üyelik vardı)' : 'VIP ${vip['level']} · ${vip['days']} gün');
  final badge = mapOf(r['badge']);
  if (badge != null) parts.add('${kBadgeNames[badge['badge']] ?? badge['badge']} rozet');
  final sid = mapOf(r['specialId']);
  if (sid != null) parts.add('Özel ID ${sid['id']} · ${sid['days']} gün');
  return parts.join(' · ');
}

String _stText(dynamic s) => s == 'paid' ? 'Ödendi' : s == 'void' ? 'İptal edildi' : 'Ödeme bekliyor';
IconData _stIcon(dynamic s) => s == 'paid' ? Icons.check_circle : s == 'void' ? Icons.cancel : Icons.hourglass_bottom;
Color _stColor(dynamic s) => s == 'paid' ? Pal.green : s == 'void' ? Pal.red : Pal.amber;

class HostStatementsScreen extends StatelessWidget {
  const HostStatementsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Maaş özetlerim')),
      body: AsyncBody<List<Map<String, dynamic>>>(
        load: () async => listOf((await Api.get('/api/broadcaster/statements'))['statements']),
        builder: (context, list, reload) => RefreshIndicator(
          onRefresh: reload,
          child: list.isEmpty
              ? ListView(children: const [Padding(padding: EdgeInsets.all(32), child: Center(child: Text('Henüz kapanmış bir dönem yok.')))])
              : ListView(padding: const EdgeInsets.all(12), children: [
                  for (final s in list)
                    AgCard(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Icon(_stIcon(s['status']), color: _stColor(s['status'])),
                          const SizedBox(width: 8),
                          Expanded(child: Text('${periodTitle(s['periodKey'].toString())} · ${fmtMoney(s['salaryCents'])}', style: const TextStyle(fontWeight: FontWeight.w800))),
                          Text(_stText(s['status']), style: TextStyle(fontSize: 12, color: _stColor(s['status']))),
                        ]),
                        const SizedBox(height: 6),
                        Text('${fmtNumber(s['diamonds'])} 💎 · ${fmtDuration((s['seconds'] as num?) ?? 0)} · ${s['validDays'] ?? 0} geçerli gün${s['agencyName'] != null ? ' · ${s['agencyName']}' : ''}',
                            style: const TextStyle(fontSize: 12)),
                        if (s['method'] != null)
                          Text('Seviye ${s['tier'] ?? '-'} · Yöntem ${s['method']} (Y1: ${fmtMoney(s['salary1Cents'])}, Y2: ${fmtMoney(s['salary2Cents'])})',
                              style: const TextStyle(fontSize: 12, color: Pal.textDim))
                        else
                          Text('Kademe ${s['tier'] ?? '-'}', style: const TextStyle(fontSize: 12, color: Pal.textDim)),
                        if (agBig(s['consumedDiamonds']) > BigInt.zero)
                          Text('${fmtNumber(s['consumedDiamonds'])} elmas maaşa çevrildi${s['status'] == 'void' ? ' (iade edildi)' : ''}', style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
                        if (s['penaltyApplied'] == true) Text('Kesinti uygulandı (ham maaş ${fmtMoney(s['baseSalaryCents'])})', style: const TextStyle(fontSize: 11.5, color: Colors.orangeAccent)),
                        if (_rewardText(mapOf(s['rewards'])).isNotEmpty) Text('🎁 ${_rewardText(mapOf(s['rewards']))}', style: const TextStyle(fontSize: 11.5, color: Pal.amber)),
                        if ((s['payNote'] ?? '').toString().isNotEmpty) Text('Not: ${s['payNote']}', style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
                      ]),
                    ),
                ]),
        ),
      ),
    );
  }
}

class AgencyStatementsScreen extends StatelessWidget {
  final String agencyId;
  final bool assistant;
  const AgencyStatementsScreen({super.key, required this.agencyId, this.assistant = false});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Hesap özetleri')),
      body: AsyncBody<Map<String, dynamic>>(
        load: () => Api.get('/api/agencies/$agencyId/statements'),
        builder: (context, data, reload) {
          final ags = listOf(data['agencyStatements']);
          final hosts = listOf(data['hostStatements']);
          final asst = listOf(data['assistantStatements']);
          final isAssistant = assistant;
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.all(12), children: [
              if (!isAssistant) ...[
                const Text('Ajans primi', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                if (ags.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('Henüz kapanmış dönem yok.', style: TextStyle(color: Pal.textDim))),
                for (final s in ags)
                  Card(
                    child: ListTile(
                      leading: Icon(_stIcon(s['status']), color: _stColor(s['status'])),
                      title: Text(agBig(s['commissionCents']) > BigInt.zero || agBig(s['commissionDiamonds']) == BigInt.zero
                          ? '${periodTitle(s['periodKey'].toString())} · ${fmtMoney(s['ownerCents'])}'
                          : '${periodTitle(s['periodKey'].toString())} · ${fmtNumber(s['commissionDiamonds'])} 💎'),
                      subtitle: Text('Ekip: ${fmtNumber(s['teamDiamonds'])} 💎 · ${s['hostCount']} yayıncı · toplam prim ${fmtMoney(s['commissionCents'])}'
                          '${agBig(s['assistantCents']) > BigInt.zero ? ' · asistanlar ${fmtMoney(s['assistantCents'])}' : ''}\n${_stText(s['status'])}'),
                      isThreeLine: true,
                    ),
                  ),
              ],
              if (isAssistant && asst.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Henüz kapanmış dönem yok.', textAlign: TextAlign.center, style: TextStyle(color: Pal.textDim))),
              if (asst.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('Asistan payları', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                for (final s in asst)
                  Card(
                    child: ListTile(
                      leading: Icon(_stIcon(s['status']), color: _stColor(s['status'])),
                      title: Text('${s['displayName'] ?? s['agencyName'] ?? ''} · ${periodTitle(s['periodKey'].toString())} · ${fmtMoney(s['amountCents'])}'),
                      subtitle: Text('Yayıncı primi ${fmtMoney(s['baseCents'])} × ${agPct((s['shareBps'] as num?)?.toInt() ?? 0)} · ${_stText(s['status'])}'),
                    ),
                  ),
              ],
              if (hosts.isNotEmpty) ...[
                const SizedBox(height: 8),
                const Text('Yayıncı maaşları', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                for (final s in hosts)
                  Card(
                    child: ListTile(
                      title: Text('${s['displayName'] ?? '@${s['username']}'} · ${periodTitle(s['periodKey'].toString())}'),
                      subtitle: Text('${fmtMoney(s['salaryCents'])} · ${fmtNumber(s['diamonds'])} 💎 · ${s['validDays'] ?? 0} gün · seviye ${s['tier'] ?? '-'}'
                          '${s['method'] != null ? ' (Y${s['method']})' : ''} · ${_stText(s['status'])}'),
                    ),
                  ),
              ],
            ]),
          );
        },
      ),
    );
  }
}

/// Bildirimden açılış: ajans sahibi / asistan ise Ajans Merkezi, değilse Yayıncı Merkezi.
class AgencyCenterOrHostScreen extends StatelessWidget {
  const AgencyCenterOrHostScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return AsyncBody<Map<String, dynamic>>(
      load: () => Api.get('/api/agency-center/me'),
      shell: (context, child) => Scaffold(appBar: AppBar(), body: child),
      builder: (context, me, reload) {
        final owned = mapOf(me['owned']);
        if ((owned != null && owned['status'] == 'active') || mapOf(me['assistant']) != null) return const AgencyCenterScreen();
        return const AgencyScreen(mode: 'broadcaster');
      },
    );
  }
}
