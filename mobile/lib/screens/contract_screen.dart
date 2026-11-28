import 'package:flutter/material.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import '../services/device_info.dart';
import '../widgets/common.dart';

/// Sözleşme (yayıncı, ajans sahibi, Coin bayisi). Sahibin kararı: rakiplerdeki gibi tek dokunuşla kabul; SMS ve PDF yok.
///
/// Yayıncı sözleşmesi ajans davetini kabul ederken kabul edilir (davet kartındaki not ve bu ekranın salt okunur hâli). Ajans ve bayi
/// sözleşmesi panel ilk açılırken bu ekranla kabul edilir. Sunucu, gösterilen metnin özetini (sha256) kendi ürettiği metinle
/// karşılaştırır ve kim / hangi sürüm / ne zaman kaydını değiştirilemez şekilde tutar.
Future<bool> openContract(BuildContext context, String kind, {bool readOnly = false}) async {
  final r = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: !readOnly, builder: (_) => ContractScreen(kind: kind, readOnly: readOnly)));
  return r == true;
}

class ContractScreen extends StatefulWidget {
  final String kind;
  final bool readOnly;
  const ContractScreen({super.key, required this.kind, this.readOnly = false});

  @override
  State<ContractScreen> createState() => _ContractScreenState();
}

class _ContractScreenState extends State<ContractScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await Api.get('/api/contracts/${widget.kind}');
      if (mounted) setState(() => _data = d);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _accept() async {
    final d = _data;
    if (d == null || _busy) return;
    setState(() => _busy = true);
    try {
      final r = await Api.post('/api/contracts/${widget.kind}/accept', {'sha256': d['sha256'], 'device': await DeviceInfo.collect()});
      if (!mounted) return;
      toast(context, tx('Sözleşme kabul edildi · {no}', {'no': '${r['contractNo'] ?? ''}'}));
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      // Metin bu arada güncellendiyse yenisi yüklenir.
      if (e is ApiException && e.statusCode == 409) {
        setState(() => _data = null);
        _load();
      }
      toast(context, '$e', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Basit biçim: "## Başlık" kalın, **…** ve `…` işaretleri kaldırılır. Metin olduğu gibi okunur, hiçbir satır atlanmaz.
  List<Widget> _paragraphs(String text) {
    final out = <Widget>[];
    for (final raw in text.split('\n')) {
      final heading = RegExp(r'^#{1,6}\s+').hasMatch(raw);
      final line = raw
          .replaceFirst(RegExp(r'^#{1,6}\s+'), '')
          .replaceFirst(RegExp(r'^>\s?'), '')
          .replaceAllMapped(RegExp(r'\*\*(.+?)\*\*'), (m) => m[1]!)
          .replaceAllMapped(RegExp(r'`([^`]*)`'), (m) => m[1]!);
      if (line.trim() == '---') {
        out.add(const Divider(height: 24));
        continue;
      }
      out.add(Padding(
        padding: EdgeInsets.only(top: heading ? 14 : 0, bottom: line.isEmpty ? 6 : 2),
        child: Text(line, style: TextStyle(fontSize: heading ? 15 : 13.5, height: 1.45, fontWeight: heading ? FontWeight.w700 : FontWeight.w400)),
      ));
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: Text(d == null ? tx('Sözleşme') : '${d['title']} · ${tx('Sürüm')} ${d['version']}', maxLines: 2, style: const TextStyle(fontSize: 15))),
      body: _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_error!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  FilledButton(onPressed: _load, child: Text(tx('Tekrar dene'))),
                ]),
              ),
            )
          : d == null
              ? const Center(child: CircularProgressIndicator())
              : Column(children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                      child: SelectionArea(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: _paragraphs('${d['text']}'))),
                    ),
                  ),
                  if (!widget.readOnly)
                    SafeArea(
                      top: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _busy ? null : _accept,
                            child: _busy
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                : Text(tx('Okudum, kabul ediyorum')),
                          ),
                        ),
                      ),
                    ),
                ]),
    );
  }
}

/// Sözleşmelerim: durum (kabul edildi / güncel sürüm bekliyor) ve kabul edilen sözleşmeler (metin uygulamada okunur).
class MyContractsScreen extends StatefulWidget {
  const MyContractsScreen({super.key});

  @override
  State<MyContractsScreen> createState() => _MyContractsScreenState();
}

class _MyContractsScreenState extends State<MyContractsScreen> {
  List<Map<String, dynamic>> _status = [];
  List<Map<String, dynamic>> _acc = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await guard(context, () async => (await Api.get('/api/contracts'), await Api.get('/api/contracts/acceptances')));
    if (!mounted) return;
    setState(() {
      _loading = false;
      if (r != null) {
        _status = listOf(r.$1['contracts']);
        _acc = listOf(r.$2['acceptances']);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tx('Sözleşmelerim'))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(children: [
                for (final s in _status)
                  ListTile(
                    title: Text('${s['title']}'),
                    subtitle: Text(s['published'] != true
                        ? tx('Henüz yayımlanmadı')
                        : s['upToDate'] == true
                            ? tx('Güncel sürüm kabul edildi ({v})', {'v': '${s['version']}'})
                            : s['accepted'] == null
                                ? tx('Kabulünüzü bekliyor')
                                : tx('Yeni sürüm ({v}) kabulünüzü bekliyor', {'v': '${s['version']}'})),
                    trailing: s['published'] == true && s['upToDate'] != true ? FilledButton(onPressed: () async {
                      if (await openContract(context, '${s['kind']}')) _load();
                    }, child: Text(tx('Oku ve kabul et'))) : null,
                  ),
                if (_acc.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 4), child: Text(tx('Kabul ettiğiniz sözleşmeler'), style: const TextStyle(fontWeight: FontWeight.w700))),
                for (final a in _acc)
                  ListTile(
                    leading: const Icon(Icons.verified_outlined),
                    title: Text('${a['contractNo']} · ${tx('Sürüm')} ${a['version']}'),
                    subtitle: Text('${a['acceptedAt']}'.replaceFirst('T', ' ').split('.').first),
                    onTap: () => openContract(context, '${a['kind']}', readOnly: true),
                  ),
                if (_status.isEmpty && _acc.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Text(tx('Size ait bir sözleşme yok.'))),
              ]),
            ),
    );
  }
}

/// Açılışta bir kez: onaylanması gereken sözleşme varsa sorar. Sunucu ayrıca 428 ile panelleri ve ödemeleri bekletir.
class ContractGate {
  static bool _checked = false;
  static bool _open = false;

  /// Sunucu bir istekte "sözleşme gerekli" dediğinde (428, contract_required) main.dart buradan ekranı açar.
  static Future<void> required(BuildContext context, String kind) async {
    if (_open) return;
    _open = true;
    try {
      await openContract(context, kind);
    } finally {
      _open = false;
    }
  }

  static Future<void> check(BuildContext context) async {
    if (_checked) return;
    _checked = true;
    List<Map<String, dynamic>> list;
    try {
      list = listOf((await Api.get('/api/contracts'))['contracts']);
    } catch (_) {
      _checked = false; // bağlantı yoksa sonraki açılışta yeniden sorulur
      return;
    }
    for (final s in list) {
      if (s['published'] != true || s['upToDate'] == true || !context.mounted) continue;
      final first = s['accepted'] == null;
      final go = await confirm(
        context,
        first
            ? tx('{t} kabulünüzü bekliyor. Kabul edilene kadar ödemeleriniz bekletilir ve ilgili paneller açılmaz.', {'t': '${s['title']}'})
            : tx('{t} güncellendi (sürüm {v}). Yeni sürümü okuyup kabul edin.', {'t': '${s['title']}', 'v': '${s['version']}'}),
        action: tx('Oku ve kabul et'),
      );
      if (go && context.mounted) await openContract(context, '${s['kind']}');
    }
  }
}
