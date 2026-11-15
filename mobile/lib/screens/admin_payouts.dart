import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/session.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import 'agency_center.dart' show agBig, agDate, agPct, kBadgeNames, AgCard, AgPill, PayTableScreen;
import 'agency_screen.dart' show periodTitle;
import 'agency_team.dart' show kTransferKinds, kTransferStatus, transferColor;

/// Kuruş → "12.50" (giriş alanları için).
String _centsText(dynamic cents) {
  final v = agBig(cents);
  final whole = v ~/ BigInt.from(100);
  final frac = (v % BigInt.from(100)).toInt();
  return frac == 0 ? '$whole' : '$whole.${frac.toString().padLeft(2, '0')}';
}

/// "12.5" / "12,50" → kuruş (geçersizse null).
String? _parseCents(String raw) {
  final t = raw.trim().replaceAll(',', '.');
  if (t.isEmpty) return '0';
  final v = double.tryParse(t);
  if (v == null || v < 0 || v > 1e12) return null;
  return (v * 100).round().toString();
}

String _dollar(dynamic cents) => '\$${fmtNumber((agBig(cents) ~/ BigInt.from(100)).toString())}';

/// Yönetici: maaş sistemi ayarları, 44 seviyeli tablo, dönem kapatma ve elle ödeme, transfer / ajans başvurusu onayları, etkinlikler, KYC.
class PayoutsTab extends StatefulWidget {
  const PayoutsTab({super.key});

  @override
  State<PayoutsTab> createState() => _PayoutsTabState();
}

class _PayoutsTabState extends State<PayoutsTab> {
  int _v = 0;

  Future<Map<String, dynamic>> _load() async {
    final res = await Future.wait([
      Api.get('/api/admin/agency-config'),
      Api.get('/api/admin/payouts'),
      Api.get('/api/admin/events'),
      Api.get('/api/admin/kyc', query: {'status': 'pending'}),
      Api.get('/api/admin/agency-transfers', query: {'status': 'pending'}).catchError((_) => <String, dynamic>{}),
      Api.get('/api/admin/agency-applications', query: {'status': 'pending'}).catchError((_) => <String, dynamic>{}),
    ]);
    return {
      'config': mapOf(res[0]['config']),
      'periods': listOf(res[1]['periods']),
      'events': listOf(res[2]['events']),
      'kyc': listOf(res[3]['users']),
      'transfers': listOf(res[4]['transfers']),
      'applications': listOf(res[5]['applications']),
    };
  }

  Future<void> _run(Future<Map<String, dynamic>> Function() action, {String? done}) async {
    final r = await guard(context, action);
    if (r == null || !mounted) return;
    if (done != null) toast(context, done);
    setState(() => _v++);
  }

  // ---- ayarlar ----
  Future<void> _editSettings(Map<String, dynamic> st) async {
    var cycle = (st['cycle'] ?? 'monthly').toString();
    var events = st['requireOfficialEvents'] == true;
    var game = st['requireGameHours'] == true;
    var balance = st['allowBalanceMethod'] != false;
    final c = <String, TextEditingController>{
      'validDay': TextEditingController(text: '${st['validDayMinutes'] ?? 60}'),
      'penalty': TextEditingController(text: '${((st['penaltyBps'] as num?) ?? 5000) / 100}'),
      'minEv': TextEditingController(text: '${st['minEventCount'] ?? 0}'),
      'cur': TextEditingController(text: (st['currency'] ?? 'USD').toString()),
      'maxA': TextEditingController(text: '${st['maxAssistants'] ?? 7}'),
      'maxShare': TextEditingController(text: '${((st['maxAssistantBps'] as num?) ?? 5000) / 100}'),
      'ref': TextEditingController(text: '${((st['referralBps'] as num?) ?? 500) / 100}'),
      'wait': TextEditingController(text: '${st['transferWaitHours'] ?? 72}'),
    };
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          title: const Text('Maaş sistemi ayarları'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                // ignore: deprecated_member_use
                value: cycle,
                decoration: const InputDecoration(labelText: 'Hesap dönemi (tablo aylıktır)'),
                items: const [DropdownMenuItem(value: 'monthly', child: Text('Aylık')), DropdownMenuItem(value: 'weekly', child: Text('Haftalık (Pzt-Paz)'))],
                onChanged: (v) => setS(() => cycle = v ?? cycle),
              ),
              TextField(controller: c['validDay'], keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Geçerli gün için en az yayın (dakika)')),
              SwitchListTile(dense: true, contentPadding: EdgeInsets.zero, title: const Text('Oyun saati şartı uygulansın'), value: game, onChanged: (v) => setS(() => game = v)),
              SwitchListTile(dense: true, contentPadding: EdgeInsets.zero, title: const Text('Yöntem 2 (bakiye) açık'), value: balance, onChanged: (v) => setS(() => balance = v)),
              TextField(controller: c['maxA'], keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Ajans başına en fazla asistan')),
              TextField(controller: c['maxShare'], keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Asistan payı üst sınırı (%)')),
              TextField(controller: c['ref'], keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Davet primi (davet edilen ajansın primi, %)')),
              TextField(controller: c['wait'], keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Transfer / ayrılma onay süresi (saat; 0 = anında)')),
              SwitchListTile(dense: true, contentPadding: EdgeInsets.zero, title: const Text('Resmi etkinlik katılımı zorunlu'), value: events, onChanged: (v) => setS(() => events = v)),
              TextField(controller: c['minEv'], keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Dönemde en az etkinlik sayısı')),
              TextField(controller: c['penalty'], keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Etkinlik şartı tutmazsa kesinti (%)')),
              TextField(controller: c['cur'], maxLength: 3, decoration: const InputDecoration(labelText: 'Para birimi (örn. USD)')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Kaydet')),
          ],
        ),
      ),
    );
    int? i(String k) => int.tryParse(c[k]!.text.trim());
    int? bps(String k) {
      final v = double.tryParse(c[k]!.text.trim().replaceAll(',', '.'));
      return v == null ? null : (v * 100).round();
    }
    final values = {
      'validDayMinutes': i('validDay'),
      'penaltyBps': bps('penalty'),
      'minEventCount': i('minEv'),
      'maxAssistants': i('maxA'),
      'maxAssistantBps': bps('maxShare'),
      'referralBps': bps('ref'),
      'transferWaitHours': i('wait'),
    };
    final currency = c['cur']!.text.trim().toUpperCase();
    for (final t in c.values) {
      t.dispose();
    }
    if (ok != true || !mounted) return;
    if (values.values.any((v) => v == null)) return toast(context, 'Değerleri kontrol edin.', error: true);
    await _run(
      () => Api.put('/api/admin/agency-config', {
        'settings': {
          'cycle': cycle, 'requireOfficialEvents': events, 'requireGameHours': game, 'allowBalanceMethod': balance, 'currency': currency,
          ...values,
        },
      }),
      done: 'Ayarlar kaydedildi.',
    );
  }

  Future<void> _editGrades(List<Map<String, dynamic>> grades) async {
    final ctl = TextEditingController(text: grades.map((g) => '${g['name']}, ${g['min']}').join('\n'));
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Ajans seviyeleri'),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Her satır: seviye adı, aylık ekip elması eşiği. İlk satır 0 ile başlar.\nÖrnek: C, 50000000', style: TextStyle(fontSize: 12, color: Pal.textDim)),
            const SizedBox(height: 8),
            TextField(controller: ctl, maxLines: 8, decoration: const InputDecoration(border: OutlineInputBorder())),
          ]),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Kaydet')),
        ],
      ),
    );
    final text = ctl.text;
    ctl.dispose();
    if (ok != true || !mounted) return;
    final out = <Map<String, dynamic>>[];
    for (final line in text.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty)) {
      final parts = line.split(',').map((x) => x.trim()).toList();
      if (parts.length != 2 || BigInt.tryParse(parts[1]) == null) return toast(context, 'Satır hatalı: "$line"', error: true);
      out.add({'name': parts[0], 'min': parts[1]});
    }
    await _run(() => Api.put('/api/admin/agency-config', {'agencyGrades': out}), done: 'Ajans seviyeleri kaydedildi.');
  }

  // ---- dönem / etkinlik ----
  Future<void> _closePeriod() async {
    final f = await formDialog(context, 'Dönemi kapat', ['Dönem (boş = bir önceki dönem; örn. 2026-09)']);
    if (f == null || !mounted) return;
    final key = f.values.first;
    if (!await confirm(
      context,
      'Dönem kapatılınca yayıncı maaşları, ajans primleri, asistan payları ve davet primleri hesaplanır; Yöntem 2 seçilen yayıncıların elmas kotası bakiyeden düşülür '
      've seviye ödülleri (VIP, rozet, özel ID) verilir. Bu işlem geri alınamaz.',
      action: 'Kapat',
    )) {
      return;
    }
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/payouts/close', {if (key.isNotEmpty) 'period': key}));
    if (r == null || !mounted) return;
    toast(context, '${periodTitle(r['periodKey'].toString())} kapatıldı: ${r['hostStatements']} yayıncı, ${r['agencyStatements']} ajans, ${r['assistantStatements'] ?? 0} asistan, ${r['referralStatements'] ?? 0} davet primi.');
    setState(() => _v++);
  }

  Future<void> _newEvent() async {
    final f = await formDialog(context, 'Resmi etkinlik', ['Başlık', 'Başlangıç (YYYY-AA-GG SS:DD, Türkiye saati)']);
    if (f == null || !mounted) return;
    final raw = f['Başlangıç (YYYY-AA-GG SS:DD, Türkiye saati)']!.replaceFirst(' ', 'T');
    final dt = DateTime.tryParse('$raw:00+03:00') ?? DateTime.tryParse('$raw+03:00');
    if (dt == null) return toast(context, 'Tarih biçimi geçersiz.', error: true);
    await _run(() => Api.post('/api/admin/events', {'title': f['Başlık'], 'startsAt': dt.toUtc().toIso8601String()}), done: 'Etkinlik eklendi.');
  }

  Future<void> _markAttendance(Map<String, dynamic> e) async {
    final u = await pickUser(context, admin: true);
    if (u == null || !mounted) return;
    await _run(() => Api.post('/api/admin/events/${e['id']}/attendance', {'userIds': [u['id']]}), done: 'Katılım işaretlendi.');
  }

  // ---- transfer / başvuru ----
  Future<void> _decideTransfer(Map<String, dynamic> t, bool approve) async {
    String? note;
    if (!approve) {
      note = await askText(context, 'Reddetme nedeni (isteğe bağlı)');
      if (!mounted) return;
    }
    if (!await confirm(context, approve ? 'Transfer onaylansın mı? Yayıncı hemen taşınır.' : 'Transfer reddedilsin mi? Platform kararı kesindir.', action: approve ? 'Onayla' : 'Reddet', destructive: !approve)) return;
    if (!mounted) return;
    await _run(() => Api.post('/api/admin/agency-transfers/${t['id']}/decide', {'approve': approve, if (note != null) 'note': note}), done: approve ? 'Onaylandı.' : 'Reddedildi.');
  }

  Future<void> _decideApplication(Map<String, dynamic> a, bool approve) async {
    String? name;
    if (approve) {
      name = await askText(context, 'Ajans adı', initial: a['name'].toString());
      if (name == null || !mounted) return;
    } else if (!await confirm(context, 'Ajans başvurusu reddedilsin mi?', action: 'Reddet', destructive: true)) {
      return;
    }
    if (!mounted) return;
    await _run(() => Api.post('/api/admin/agency-applications/${a['id']}/decide', {'approve': approve, if (name != null) 'name': name}),
        done: approve ? 'Ajans açıldı.' : 'Reddedildi.');
  }

  @override
  Widget build(BuildContext context) {
    return AsyncBody<Map<String, dynamic>>(
      version: _v,
      load: _load,
      builder: (context, data, reload) {
        final cfg = mapOf(data['config']) ?? {};
        final st = mapOf(cfg['settings']) ?? {};
        final levels = listOf(cfg['payLevels']);
        final grades = listOf(cfg['agencyGrades']);
        final periods = listOf(data['periods']);
        final events = listOf(data['events']);
        final kyc = listOf(data['kyc']);
        final transfers = listOf(data['transfers']);
        final apps = listOf(data['applications']);
        final admin = Session.isAdmin;
        final cur = (st['currency'] ?? 'USD').toString();
        return RefreshIndicator(
          onRefresh: reload,
          child: ListView(padding: const EdgeInsets.all(12), children: [
            AgCard(
              title: 'Maaş sistemi',
              trailing: admin ? TextButton.icon(onPressed: () => _editSettings(st), icon: const Icon(Icons.tune, size: 18), label: const Text('Düzenle')) : null,
              child: Text(
                'Dönem: ${st['cycle'] == 'weekly' ? 'haftalık' : 'aylık'} · geçerli gün ≥${st['validDayMinutes']} dk · oyun saati: ${st['requireGameHours'] == true ? 'şart' : 'bilgi'}\n'
                'Yöntem 2 (bakiye): ${st['allowBalanceMethod'] == false ? 'kapalı' : 'açık'} · para birimi $cur\n'
                'Asistan: en fazla ${st['maxAssistants']} · pay üst sınırı ${agPct((st['maxAssistantBps'] as num?)?.toInt() ?? 0)}\n'
                'Davet primi: ${agPct((st['referralBps'] as num?)?.toInt() ?? 0)} · transfer onay süresi: ${st['transferWaitHours']} saat\n'
                'Resmi etkinlik: ${st['requireOfficialEvents'] == true ? 'zorunlu (${st['minEventCount']}), tutmazsa %${((st['penaltyBps'] as num?) ?? 0) / 100} kesinti' : 'zorunlu değil'}',
                style: const TextStyle(fontSize: 12.5, height: 1.45),
              ),
            ),
            AgCard(
              title: 'Maaş tablosu (${levels.length} seviye)',
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (levels.isNotEmpty)
                  Text(
                    'Sv 1: ${fmtNumber(levels.first['diamonds'])} 💎 → ${_dollar(levels.first['salary1Cents'])} / ${_dollar(levels.first['salary2Cents'])} · ajans ${_dollar(levels.first['agencyCents'])}\n'
                    'Sv ${levels.last['level']}: ${fmtNumber(levels.last['diamonds'])} 💎 → ${_dollar(levels.last['salary1Cents'])} / ${_dollar(levels.last['salary2Cents'])} · ajans ${_dollar(levels.last['agencyCents'])}',
                    style: const TextStyle(fontSize: 12.5),
                  ),
                const SizedBox(height: 6),
                Wrap(spacing: 8, runSpacing: 6, children: [
                  OutlinedButton.icon(onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PayTableScreen())), icon: const Icon(Icons.table_chart_outlined), label: const Text('Tabloyu gör')),
                  if (admin)
                    FilledButton.tonalIcon(
                      onPressed: () async {
                        await Navigator.push(context, MaterialPageRoute(builder: (_) => PayLevelsEditorScreen(levels: levels)));
                        if (mounted) setState(() => _v++);
                      },
                      icon: const Icon(Icons.edit),
                      label: const Text('Tabloyu düzenle'),
                    ),
                  if (admin) OutlinedButton.icon(onPressed: () => _editGrades(grades), icon: const Icon(Icons.stairs_outlined), label: const Text('Ajans seviyeleri')),
                ]),
                const SizedBox(height: 4),
                Text('Ajans seviyeleri: ${grades.map((g) => '${g['name']} ≥${fmtNumber(g['min'])}').join(' · ')}', style: const TextStyle(fontSize: 11, color: Pal.textDim)),
                const Text('Ödemeler platform dışında (banka/havale) yapılır; burada "ödendi" işaretlenir.', style: TextStyle(fontSize: 11, color: Pal.textDim)),
              ]),
            ),
            if (transfers.isNotEmpty)
              AgCard(
                title: 'Transfer istekleri (${transfers.length})',
                child: Column(children: [
                  for (final t in transfers)
                    Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: Pal.surfaceHi, borderRadius: BorderRadius.circular(12)),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          UserAvatar(user: mapOf(t['user']), radius: 16),
                          const SizedBox(width: 8),
                          Expanded(child: Text('${mapOf(t['user'])?['displayName'] ?? ''} · ${kTransferKinds[t['kind']] ?? t['kind']}', style: const TextStyle(fontWeight: FontWeight.w700))),
                          AgPill(kTransferStatus[t['status']] ?? t['status'].toString(), color: transferColor(t['status']?.toString())),
                        ]),
                        const SizedBox(height: 4),
                        Text('${mapOf(t['from'])?['name'] ?? '—'} → ${mapOf(t['to'])?['name'] ?? 'ajanssız'} · ${agDate(t['createdAt'], clock: true)}', style: const TextStyle(fontSize: 12)),
                        if ((t['note'] ?? '').toString().isNotEmpty) Text('Not: ${t['note']}', style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
                        if (admin)
                          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                            TextButton(onPressed: () => _decideTransfer(t, false), child: const Text('Reddet')),
                            FilledButton(onPressed: () => _decideTransfer(t, true), child: const Text('Onayla')),
                          ]),
                      ]),
                    ),
                ]),
              ),
            if (apps.isNotEmpty)
              AgCard(
                title: 'Ajans önerileri (${apps.length})',
                child: Column(children: [
                  for (final a in apps)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${a['name']} · @${mapOf(a['user'])?['username'] ?? ''}'),
                      subtitle: Text('Öneren: ${mapOf(a['referrer'])?['name'] ?? '-'}${(a['note'] ?? '').toString().isNotEmpty ? '\n${a['note']}' : ''}'),
                      trailing: !admin
                          ? null
                          : Row(mainAxisSize: MainAxisSize.min, children: [
                              IconButton(icon: const Icon(Icons.close, color: Colors.redAccent), onPressed: () => _decideApplication(a, false)),
                              IconButton(icon: const Icon(Icons.check, color: Colors.greenAccent), onPressed: () => _decideApplication(a, true)),
                            ]),
                    ),
                ]),
              ),
            Row(children: [
              const Expanded(child: Text('Kapanan dönemler', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
              if (admin) FilledButton.tonalIcon(onPressed: _closePeriod, icon: const Icon(Icons.lock_clock), label: const Text('Dönemi kapat')),
            ]),
            const SizedBox(height: 6),
            if (periods.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('Henüz kapanmış dönem yok.')),
            for (final p in periods)
              Card(
                child: ListTile(
                  title: Text(periodTitle(p['periodKey'].toString()), style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: Text(
                    'Maaş: ${fmtMoney(p['totalSalaryCents'], cur)} (${p['hosts']} yayıncı, ${p['pendingHosts']} bekliyor) · ödenen ${fmtMoney(p['paidSalaryCents'], cur)}\n'
                    'Ajans: ${fmtMoney(p['totalOwnerCents'], cur)} (${p['pendingAgencies']} bekliyor) · Asistan: ${fmtMoney(p['totalAssistantCents'], cur)} · Davet: ${fmtMoney(p['totalReferralCents'], cur)}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  isThreeLine: true,
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    await Navigator.push(context, MaterialPageRoute(builder: (_) => PeriodDetailScreen(periodId: p['id'].toString(), currency: cur)));
                    if (mounted) setState(() => _v++);
                  },
                ),
              ),
            const SizedBox(height: 8),
            Row(children: [
              const Expanded(child: Text('Resmi etkinlikler', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
              TextButton.icon(onPressed: _newEvent, icon: const Icon(Icons.add), label: const Text('Ekle')),
            ]),
            for (final e in events)
              Card(
                child: ListTile(
                  title: Text(e['title'].toString()),
                  subtitle: Text('${agDate(e['startsAt'], clock: true)} · ${e['attendees']} katılımcı'),
                  trailing: IconButton(tooltip: 'Katılım işaretle', icon: const Icon(Icons.how_to_reg), onPressed: () => _markAttendance(e)),
                ),
              ),
            const SizedBox(height: 8),
            const Text('Kimlik doğrulama (KYC) bekleyenler', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            if (kyc.isEmpty) const Padding(padding: EdgeInsets.all(12), child: Text('Bekleyen başvuru yok.')),
            for (final u in kyc)
              Card(
                child: ListTile(
                  title: Text('${u['displayName']} (@${u['username']})'),
                  trailing: !admin
                      ? null
                      : Row(mainAxisSize: MainAxisSize.min, children: [
                          IconButton(icon: const Icon(Icons.check, color: Colors.greenAccent), onPressed: () => _run(() => Api.post('/api/admin/users/${u['id']}/kyc', {'status': 'approved'}), done: 'Onaylandı.')),
                          IconButton(icon: const Icon(Icons.close, color: Colors.redAccent), onPressed: () => _run(() => Api.post('/api/admin/users/${u['id']}/kyc', {'status': 'rejected'}), done: 'Reddedildi.')),
                        ]),
                ),
              ),
          ]),
        );
      },
    );
  }
}

// ------------------------------------------------------------------ Maaş tablosu düzenleyici
class PayLevelsEditorScreen extends StatefulWidget {
  final List<Map<String, dynamic>> levels;
  const PayLevelsEditorScreen({super.key, required this.levels});

  @override
  State<PayLevelsEditorScreen> createState() => _PayLevelsEditorScreenState();
}

class _PayLevelsEditorScreenState extends State<PayLevelsEditorScreen> {
  late List<Map<String, dynamic>> _levels = widget.levels.map((l) => Map<String, dynamic>.from(l)).toList();
  bool _dirty = false;
  bool _saving = false;

  Future<void> _edit(int index) async {
    final l = _levels[index];
    final fields = <String, TextEditingController>{
      'days': TextEditingController(text: l['days']?.toString() ?? ''),
      'hours': TextEditingController(text: l['hours']?.toString() ?? ''),
      'game': TextEditingController(text: '${l['gameHours'] ?? 0}'),
      'dia': TextEditingController(text: (l['diamonds'] ?? '0').toString()),
      's1': TextEditingController(text: _centsText(l['salary1Cents'])),
      's2': TextEditingController(text: _centsText(l['salary2Cents'])),
      'ag': TextEditingController(text: _centsText(l['agencyCents'])),
      'vip': TextEditingController(text: l['vipLevel']?.toString() ?? ''),
      'vipDays': TextEditingController(text: '${l['vipDays'] ?? 0}'),
      'sid': TextEditingController(text: '${l['specialIdDays'] ?? 0}'),
      'sidCount': TextEditingController(text: '${l['specialIdCount'] ?? 1}'),
    };
    String? badge = l['badge']?.toString();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, setS) {
          Widget f(String k, String label) => TextField(controller: fields[k], keyboardType: TextInputType.number, decoration: InputDecoration(labelText: label, isDense: true));
          return AlertDialog(
            title: Text('Seviye ${l['level']}'),
            content: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                f('dia', 'Elmas kotası'),
                Row(children: [Expanded(child: f('days', 'Gün (boş = şart yok)')), const SizedBox(width: 8), Expanded(child: f('hours', 'Saat (boş = şart yok)'))]),
                f('game', 'Oyun saati'),
                Row(children: [Expanded(child: f('s1', 'Maaş 1 (\$)')), const SizedBox(width: 8), Expanded(child: f('s2', 'Maaş 2 (\$)'))]),
                f('ag', 'Ajans primi (\$)'),
                Row(children: [Expanded(child: f('vip', 'VIP seviye (boş = yok)')), const SizedBox(width: 8), Expanded(child: f('vipDays', 'VIP gün'))]),
                DropdownButtonFormField<String?>(
                  // ignore: deprecated_member_use
                  value: badge,
                  decoration: const InputDecoration(labelText: 'Rozet', isDense: true),
                  items: const [
                    DropdownMenuItem<String?>(value: null, child: Text('Yok')),
                    DropdownMenuItem<String?>(value: 'bronz', child: Text('Bronz')),
                    DropdownMenuItem<String?>(value: 'gumus', child: Text('Gümüş')),
                    DropdownMenuItem<String?>(value: 'altin', child: Text('Altın')),
                    DropdownMenuItem<String?>(value: 'super', child: Text('Süper')),
                    DropdownMenuItem<String?>(value: 'ozel', child: Text('Özel')),
                  ],
                  onChanged: (v) => setS(() => badge = v),
                ),
                Row(children: [Expanded(child: f('sid', 'Özel ID gün')), const SizedBox(width: 8), Expanded(child: f('sidCount', 'Özel ID adet'))]),
              ]),
            ),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
              FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Tamam')),
            ],
          );
        },
      ),
    );
    final v = {for (final e in fields.entries) e.key: e.value.text.trim()};
    for (final t in fields.values) {
      t.dispose();
    }
    if (ok != true || !mounted) return;
    int? optInt(String s) => s.isEmpty ? null : int.tryParse(s);
    final s1 = _parseCents(v['s1']!);
    final s2 = _parseCents(v['s2']!);
    final ag = _parseCents(v['ag']!);
    if (BigInt.tryParse(v['dia']!) == null || s1 == null || s2 == null || ag == null ||
        (v['days']!.isNotEmpty && optInt(v['days']!) == null) || (v['hours']!.isNotEmpty && optInt(v['hours']!) == null) ||
        int.tryParse(v['game']!) == null || (v['vip']!.isNotEmpty && optInt(v['vip']!) == null)) {
      return toast(context, 'Değerleri kontrol edin.', error: true);
    }
    setState(() {
      _levels[index] = {
        'level': l['level'],
        'days': optInt(v['days']!),
        'hours': optInt(v['hours']!),
        'gameHours': int.tryParse(v['game']!) ?? 0,
        'diamonds': v['dia'],
        'salary1Cents': s1,
        'salary2Cents': s2,
        'agencyCents': ag,
        'vipLevel': optInt(v['vip']!),
        'vipDays': int.tryParse(v['vipDays']!) ?? 0,
        'badge': badge,
        'specialIdDays': int.tryParse(v['sid']!) ?? 0,
        'specialIdCount': int.tryParse(v['sidCount']!) ?? 1,
      };
      _dirty = true;
    });
  }

  void _addLevel() {
    final last = _levels.isNotEmpty ? _levels.last : null;
    final dia = last == null ? BigInt.from(200000) : agBig(last['diamonds']) + BigInt.from(1000000);
    setState(() {
      _levels.add({
        ...?last,
        'level': _levels.length + 1,
        'diamonds': dia.toString(),
      });
      _dirty = true;
    });
  }

  Future<void> _removeLast() async {
    if (_levels.length <= 1) return;
    if (!await confirm(context, 'Son seviye (${_levels.last['level']}) silinsin mi?', action: 'Sil', destructive: true)) return;
    if (!mounted) return;
    setState(() {
      _levels.removeLast();
      _dirty = true;
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() => _saving = true);
    final r = await guard(context, () => Api.put('/api/admin/pay-levels', {'levels': _levels}));
    if (!mounted) return;
    setState(() => _saving = false);
    if (r == null) return;
    final cfg = mapOf(r['config']);
    setState(() {
      _levels = listOf(cfg?['payLevels']).map((l) => Map<String, dynamic>.from(l)).toList();
      _dirty = false;
    });
    toast(context, 'Maaş tablosu kaydedildi.');
  }

  Future<void> _reset() async {
    if (!await confirm(context, 'Tablo varsayılan 44 seviyeye (mavi tablo, elmas ×10) döndürülsün mü? Yaptığınız değişiklikler silinir.', action: 'Varsayılana döndür', destructive: true)) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/pay-levels/reset'));
    if (r == null || !mounted) return;
    setState(() {
      _levels = listOf(mapOf(r['config'])?['payLevels']).map((l) => Map<String, dynamic>.from(l)).toList();
      _dirty = false;
    });
    toast(context, 'Varsayılan tablo yüklendi.');
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) async {
        if (didPop) return;
        final leave = await confirm(context, 'Kaydedilmemiş değişiklikler var. Çıkılsın mı?', action: 'Çık', destructive: true);
        if (leave && context.mounted) {
          setState(() => _dirty = false);
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        appBar: AppBar(title: const Text('Maaş tablosu'), actions: [
          IconButton(tooltip: 'Varsayılana döndür', icon: const Icon(Icons.restore), onPressed: _reset),
          IconButton(tooltip: 'Son seviyeyi sil', icon: const Icon(Icons.remove), onPressed: _removeLast),
          IconButton(tooltip: 'Seviye ekle', icon: const Icon(Icons.add), onPressed: _addLevel),
        ]),
        floatingActionButton: _dirty
            ? FloatingActionButton.extended(onPressed: _saving ? null : _save, icon: const Icon(Icons.save), label: Text(_saving ? 'Kaydediliyor…' : 'Kaydet'))
            : null,
        body: ListView.builder(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 90),
          itemCount: _levels.length,
          itemBuilder: (context, i) {
            final l = _levels[i];
            final reqs = l['days'] == null && l['hours'] == null ? 'şart yok' : '${l['days'] ?? '-'} gün / ${l['hours'] ?? '-'} sa';
            final extras = [
              if (l['vipLevel'] != null) 'VIP${l['vipLevel']}×${l['vipDays']}g',
              if (l['badge'] != null) kBadgeNames[l['badge']] ?? l['badge'].toString(),
              if (((l['specialIdDays'] as num?) ?? 0) > 0) 'Özel ID ${l['specialIdDays']}g${((l['specialIdCount'] as num?) ?? 1) > 1 ? '×${l['specialIdCount']}' : ''}',
            ];
            return Card(
              child: ListTile(
                leading: CircleAvatar(radius: 16, child: Text('${l['level']}', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800))),
                title: Text('${fmtNumber(l['diamonds'])} 💎 · ${_dollar(l['salary1Cents'])} / ${_dollar(l['salary2Cents'])} · ajans ${_dollar(l['agencyCents'])}', style: const TextStyle(fontSize: 13)),
                subtitle: Text('$reqs · oyun ${l['gameHours'] ?? 0} sa${extras.isEmpty ? '' : ' · ${extras.join(' · ')}'}', style: const TextStyle(fontSize: 11.5)),
                trailing: const Icon(Icons.edit, size: 18),
                onTap: () => _edit(i),
              ),
            );
          },
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ Dönem ayrıntısı (elle ödeme)
class PeriodDetailScreen extends StatefulWidget {
  final String periodId;
  final String currency;
  const PeriodDetailScreen({super.key, required this.periodId, required this.currency});

  @override
  State<PeriodDetailScreen> createState() => _PeriodDetailScreenState();
}

class _PeriodDetailScreenState extends State<PeriodDetailScreen> {
  int _v = 0;
  String _q = '';
  String _filter = 'pending';

  String? _periodCurrency;
  String get _cur => _periodCurrency ?? widget.currency;

  Future<String?> _noteDialog(String title, String message, String action) async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(title),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(message, style: const TextStyle(fontSize: 13)),
          const SizedBox(height: 10),
          TextField(controller: ctl, maxLength: 200, decoration: const InputDecoration(labelText: 'Not (dekont no, açıklama — isteğe bağlı)', border: OutlineInputBorder())),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(action)),
        ],
      ),
    );
    final t = ctl.text.trim();
    ctl.dispose();
    return ok == true ? t : null;
  }

  Future<void> _pay(String kind, Map<String, dynamic> s, String who, dynamic cents) async {
    final note = await _noteDialog('Ödendi işaretle', '$who için ${fmtMoney(cents, _cur)} ödemesi platform dışında yapıldı mı?', 'Ödendi');
    if (note == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/statements/$kind/${s['id']}/pay', {if (note.isNotEmpty) 'note': note}));
    if (r != null && mounted) {
      toast(context, 'Ödendi olarak işaretlendi.');
      setState(() => _v++);
    }
  }

  Future<void> _void(String kind, Map<String, dynamic> s, String who) async {
    final note = await _noteDialog(
      'Özeti iptal et',
      '$who özeti iptal edilsin mi?${kind == 'host' && agBig(s['consumedDiamonds']) > BigInt.zero ? ' Maaşa çevrilen ${fmtNumber(s['consumedDiamonds'])} elmas iade edilir.' : ''} Verilen ödüller geri alınmaz.',
      'İptal et',
    );
    if (note == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/statements/$kind/${s['id']}/void', {if (note.isNotEmpty) 'note': note}));
    if (r != null && mounted) {
      toast(context, 'İptal edildi.');
      setState(() => _v++);
    }
  }

  Future<void> _payAll(String kind, int count, String label) async {
    final note = await _noteDialog('Toplu ödendi', 'Bekleyen $count $label "ödendi" işaretlensin mi?${kind == 'host' ? ' Kimlik doğrulaması (KYC) onaylı olmayan ve maaşı olan yayıncılar atlanır.' : ''}', 'Hepsini işaretle');
    if (note == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/payouts/${widget.periodId}/pay-all', {'kind': kind, if (note.isNotEmpty) 'note': note}));
    if (r != null && mounted) {
      toast(context, '${r['paid']} özet işaretlendi (${fmtMoney(r['totalCents'], _cur)})${(r['skipped'] as num? ?? 0) > 0 ? ', ${r['skipped']} atlandı' : ''}.');
      setState(() => _v++);
    }
  }

  bool _keep(Map<String, dynamic> s, String text) {
    if (_filter != 'all' && s['status'] != _filter) return false;
    if (_q.isEmpty) return true;
    return text.toLowerCase().contains(_q.toLowerCase());
  }

  Widget _status(String kind, Map<String, dynamic> s, String who, dynamic cents) {
    final st = s['status'];
    if (st == 'paid') return const Icon(Icons.check_circle, color: Pal.green);
    if (st == 'void') return const Icon(Icons.cancel, color: Pal.red);
    if (!Session.isAdmin) return const Text('Bekliyor');
    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert),
      onSelected: (v) {
        if (v == 'pay') _pay(kind, s, who, cents);
        if (v == 'void') _void(kind, s, who);
      },
      itemBuilder: (_) => const [
        PopupMenuItem(value: 'pay', child: Text('Ödendi işaretle')),
        PopupMenuItem(value: 'void', child: Text('İptal et')),
      ],
    );
  }

  Widget _tab({required String kind, required String label, required List<Map<String, dynamic>> all, required String Function(Map<String, dynamic>) text,
      required Widget Function(Map<String, dynamic>) tile, required String amountKey}) {
    final list = all.where((s) => _keep(s, text(s))).toList();
    final pending = all.where((s) => s['status'] == 'pending').toList();
    var total = BigInt.zero;
    var paid = BigInt.zero;
    for (final s in all) {
      if (s['status'] == 'void') continue;
      total += agBig(s[amountKey]);
      if (s['status'] == 'paid') paid += agBig(s[amountKey]);
    }
    return ListView(padding: const EdgeInsets.fromLTRB(12, 10, 12, 24), children: [
      Row(children: [
        Expanded(child: Text('Toplam ${fmtMoney(total.toString(), _cur)} · ödenen ${fmtMoney(paid.toString(), _cur)} · ${pending.length} bekliyor', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700))),
        if (Session.isAdmin && pending.isNotEmpty) TextButton.icon(onPressed: () => _payAll(kind, pending.length, label), icon: const Icon(Icons.done_all, size: 18), label: const Text('Toplu öde')),
      ]),
      if (all.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Kayıt yok.', textAlign: TextAlign.center, style: TextStyle(color: Pal.textDim))),
      for (final s in list) tile(s),
      if (all.isNotEmpty && list.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('Bu filtrede kayıt yok.', textAlign: TextAlign.center, style: TextStyle(color: Pal.textDim))),
    ]);
  }

  String _rewards(Map<String, dynamic>? r) {
    if (r == null || r.isEmpty) return '';
    final p = <String>[];
    final vip = mapOf(r['vip']);
    if (vip != null) p.add('VIP${vip['level']}×${vip['days']}g${vip['skipped'] == true ? ' (atlandı)' : ''}');
    final b = mapOf(r['badge']);
    if (b != null) p.add('${kBadgeNames[b['badge']] ?? b['badge']} rozet');
    final sid = mapOf(r['specialId']);
    if (sid != null) p.add('Özel ID ${sid['id']}');
    return p.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Dönem ayrıntısı'),
          bottom: const TabBar(isScrollable: true, tabs: [Tab(text: 'Yayıncılar'), Tab(text: 'Ajanslar'), Tab(text: 'Asistanlar'), Tab(text: 'Davet primi')]),
        ),
        body: AsyncBody<Map<String, dynamic>>(
          version: _v,
          load: () => Api.get('/api/admin/payouts/${widget.periodId}'),
          builder: (context, data, reload) {
            final period = mapOf(data['period']) ?? {};
            // Dönem kapanırken geçerli olan para birimi (sonradan değişse de doğru gösterilir).
            _periodCurrency = period['currency']?.toString();
            final hosts = listOf(data['hostStatements']);
            final ags = listOf(data['agencyStatements']);
            final asst = listOf(data['assistantStatements']);
            final refs = listOf(data['referralStatements']);
            return Column(children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                child: Column(children: [
                  Row(children: [
                    Text(periodTitle((period['periodKey'] ?? '').toString()), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
                    const SizedBox(width: 8),
                    Text('kapanış ${agDate(period['closedAt'], clock: true)}', style: const TextStyle(fontSize: 11.5, color: Pal.textDim)),
                  ]),
                  const SizedBox(height: 8),
                  TextField(
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Ad, kullanıcı adı, ajans ara', isDense: true, border: OutlineInputBorder()),
                    onChanged: (v) => setState(() => _q = v.trim()),
                  ),
                  const SizedBox(height: 6),
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(children: [
                      for (final f in const [('pending', 'Bekleyen'), ('paid', 'Ödenen'), ('void', 'İptal'), ('all', 'Tümü')])
                        Padding(padding: const EdgeInsets.only(right: 6), child: ChoiceChip(label: Text(f.$2), selected: _filter == f.$1, onSelected: (_) => setState(() => _filter = f.$1))),
                    ]),
                  ),
                ]),
              ),
              Expanded(
                child: TabBarView(children: [
                  _tab(
                    kind: 'host',
                    label: 'yayıncı maaşı',
                    all: hosts,
                    amountKey: 'salaryCents',
                    text: (h) => '${h['username']} ${h['displayName']} ${h['agencyName']} ${h['publicId']}',
                    tile: (h) => Card(
                      child: ListTile(
                        title: Text('${h['displayName'] ?? ''} (@${h['username']}) · ${fmtMoney(h['salaryCents'], _cur)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text(
                          '${h['agencyName'] ?? '-'} · ${fmtNumber(h['diamonds'])} 💎 · ${h['validDays']} gün · ${fmtDuration((h['seconds'] as num?) ?? 0)}\n'
                          '${h['method'] == null ? 'Kademe ${h['tier'] ?? '-'}' : 'Sv ${h['tier'] ?? '-'} · Yöntem ${h['method']} (Y1 ${fmtMoney(h['salary1Cents'], _cur)} / Y2 ${fmtMoney(h['salary2Cents'], _cur)})'}'
                          '${agBig(h['consumedDiamonds']) > BigInt.zero ? ' · ${fmtNumber(h['consumedDiamonds'])} elmas çevrildi' : ''}'
                          '${_rewards(mapOf(h['rewards'])).isNotEmpty ? '\n🎁 ${_rewards(mapOf(h['rewards']))}' : ''}'
                          '\nKYC: ${const {'approved': 'onaylı', 'pending': 'inceleniyor', 'rejected': 'reddedildi', 'none': 'yok'}[h['kycStatus']] ?? h['kycStatus']}'
                          '${(h['payNote'] ?? '').toString().isNotEmpty ? ' · Not: ${h['payNote']}' : ''}',
                          style: const TextStyle(fontSize: 12),
                        ),
                        isThreeLine: true,
                        trailing: _status('host', h, '@${h['username']}', h['salaryCents']),
                      ),
                    ),
                  ),
                  _tab(
                    kind: 'agency',
                    label: 'ajans primi',
                    all: ags,
                    amountKey: 'ownerCents',
                    text: (a) => '${a['agencyName']} ${a['ownerUsername']}',
                    tile: (a) => Card(
                      child: ListTile(
                        title: Text('${a['agencyName']} · ${fmtMoney(a['ownerCents'], _cur)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text(
                          'Sahip @${a['ownerUsername']} (KYC: ${const {'approved': 'onaylı', 'pending': 'inceleniyor', 'rejected': 'reddedildi', 'none': 'yok'}[a['ownerKyc']] ?? a['ownerKyc']}) · ${a['hostCount']} yayıncı · ekip ${fmtNumber(a['teamDiamonds'])} 💎\n'
                          'Toplam prim ${fmtMoney(a['commissionCents'], _cur)} · asistanlar ${fmtMoney(a['assistantCents'], _cur)}'
                          '${(a['payNote'] ?? '').toString().isNotEmpty ? '\nNot: ${a['payNote']}' : ''}',
                          style: const TextStyle(fontSize: 12),
                        ),
                        isThreeLine: true,
                        trailing: _status('agency', a, a['agencyName'].toString(), a['ownerCents']),
                      ),
                    ),
                  ),
                  _tab(
                    kind: 'assistant',
                    label: 'asistan payı',
                    all: asst,
                    amountKey: 'amountCents',
                    text: (s) => '${s['username']} ${s['displayName']} ${s['agencyName']}',
                    tile: (s) => Card(
                      child: ListTile(
                        title: Text('${s['displayName'] ?? ''} (@${s['username']}) · ${fmtMoney(s['amountCents'], _cur)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${s['agencyName']} · ${s['hostCount']} yayıncı · prim ${fmtMoney(s['baseCents'], _cur)} × ${agPct((s['shareBps'] as num?)?.toInt() ?? 0)}'
                            '${(s['payNote'] ?? '').toString().isNotEmpty ? '\nNot: ${s['payNote']}' : ''}', style: const TextStyle(fontSize: 12)),
                        trailing: _status('assistant', s, '@${s['username']}', s['amountCents']),
                      ),
                    ),
                  ),
                  _tab(
                    kind: 'referral',
                    label: 'davet primi',
                    all: refs,
                    amountKey: 'amountCents',
                    text: (s) => '${s['agencyName']} ${s['invitedAgencyName']}',
                    tile: (s) => Card(
                      child: ListTile(
                        title: Text('${s['agencyName']} · ${fmtMoney(s['amountCents'], _cur)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('Davet edilen: ${s['invitedAgencyName']} · prim ${fmtMoney(s['baseCents'], _cur)} × ${agPct((s['bps'] as num?)?.toInt() ?? 0)}'
                            '${(s['payNote'] ?? '').toString().isNotEmpty ? '\nNot: ${s['payNote']}' : ''}', style: const TextStyle(fontSize: 12)),
                        trailing: _status('referral', s, s['agencyName'].toString(), s['amountCents']),
                      ),
                    ),
                  ),
                ]),
              ),
            ]);
          },
        ),
      ),
    );
  }
}
