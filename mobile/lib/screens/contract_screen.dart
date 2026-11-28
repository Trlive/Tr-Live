import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import '../services/device_info.dart';
import '../services/phone_verify.dart';
import '../widgets/common.dart';

/// Sözleşme onayı (yayıncı, ajans sahibi, Coin bayisi). Karar: uygulama içi onay.
///
/// Akış: metin sunucudan kişiye doldurulmuş hâliyle gelir → kullanıcı SONUNA KADAR kaydırır → onay kutusu açılır → SMS koduyla
/// (Firebase) ya da SMS kapalıysa hesap şifresiyle onaylar. Sunucu, uygulamanın gösterdiği metnin özetini (sha256) kendi ürettiği
/// metinle karşılaştırır; arada metin değiştiyse onay reddedilir. Kayıt değiştirilemez, PDF kopyası "Sözleşmelerim"den indirilir.
Future<bool> openContract(BuildContext context, String kind) async {
  final r = await Navigator.of(context).push<bool>(MaterialPageRoute(fullscreenDialog: true, builder: (_) => ContractScreen(kind: kind)));
  return r == true;
}

class ContractScreen extends StatefulWidget {
  final String kind;
  const ContractScreen({super.key, required this.kind});

  @override
  State<ContractScreen> createState() => _ContractScreenState();
}

class _ContractScreenState extends State<ContractScreen> {
  final _sc = ScrollController();
  Map<String, dynamic>? _data;
  String? _error;
  bool _atEnd = false;
  bool _agree = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _sc.addListener(_onScroll);
    _load();
  }

  @override
  void dispose() {
    _sc.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final d = await Api.get('/api/contracts/${widget.kind}');
      if (!mounted) return;
      setState(() => _data = d);
      // Metin ekrana sığıyorsa kaydırmaya gerek yok: "sonuna ulaşıldı" sayılır.
      WidgetsBinding.instance.addPostFrameCallback((_) => _onScroll());
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  void _onScroll() {
    if (_atEnd || !_sc.hasClients) return;
    final p = _sc.position;
    if (p.maxScrollExtent <= 0 || p.pixels >= p.maxScrollExtent - 32) setState(() => _atEnd = true);
  }

  /// SMS ile doğrulama: kod gönderilir, kullanıcı girer (Android kodu kendisi okuyabilirse sorulmaz). Firebase kimlik token'ı döner.
  Future<String?> _smsToken(String phone) async {
    final done = Completer<String?>();
    await Verify.sendSms(
      phone,
      language: L10n.lang.value,
      onSent: (verificationId, _) async {
        if (!mounted) return done.complete(null);
        final code = await askText(context, tx('SMS kodu'), hint: tx('{p} numarasına gelen 6 haneli kod', {'p': '${_data?['phoneMasked'] ?? ''}'}), keyboard: TextInputType.number);
        if (code == null || code.trim().isEmpty) {
          if (!done.isCompleted) done.complete(null);
          return;
        }
        try {
          final t = await Verify.confirmCode(verificationId, code.trim());
          if (!done.isCompleted) done.complete(t);
        } catch (e) {
          if (!done.isCompleted) done.completeError(ApiException(tx('Kod doğrulanamadı. Yeniden deneyin.')));
        }
      },
      onAuto: (t) {
        if (!done.isCompleted) done.complete(t);
      },
      onError: (m) {
        if (!done.isCompleted) done.completeError(ApiException(tx(m)));
      },
    );
    return done.future;
  }

  Future<void> _accept() async {
    final d = _data;
    if (d == null || !_atEnd || !_agree || _busy) return;
    setState(() => _busy = true);
    try {
      final body = <String, dynamic>{'sha256': d['sha256'], 'scrolled': true, 'device': await DeviceInfo.collect()};
      if (d['method'] == 'sms') {
        final phone = d['phone'] as String?;
        if (phone == null || phone.isEmpty) {
          if (mounted) toast(context, tx('Onay için hesabınıza doğrulanmış bir telefon numarası ekleyin.'), error: true);
          return;
        }
        final t = await _smsToken(phone);
        if (t == null) return; // vazgeçildi
        body['idToken'] = t;
      } else {
        if (!mounted) return;
        final pw = await askText(context, tx('Hesap şifreniz'), hint: tx('Onaylamak için şifrenizi girin'), obscure: true);
        if (pw == null || pw.isEmpty) return;
        body['password'] = pw;
      }
      final r = await Api.post('/api/contracts/${widget.kind}/accept', body);
      if (!mounted) return;
      toast(context, tx('Sözleşme onaylandı · {no}', {'no': '${r['contractNo'] ?? ''}'}));
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      // Metin bu arada güncellendiyse yenisi yüklenir ve yeniden okunması istenir.
      if (e is ApiException && e.statusCode == 409) {
        setState(() {
          _atEnd = false;
          _agree = false;
          _data = null;
        });
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
                    child: Scrollbar(
                      controller: _sc,
                      thumbVisibility: true,
                      child: SingleChildScrollView(
                        controller: _sc,
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                        child: SelectionArea(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: _paragraphs('${d['text']}'))),
                      ),
                    ),
                  ),
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(8, 4, 16, 12),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        if (!_atEnd)
                          Padding(
                            padding: const EdgeInsets.only(left: 8, bottom: 4),
                            child: Text(tx('Onaylamak için metni sonuna kadar okuyun.'), style: const TextStyle(fontSize: 12, color: Colors.white60)),
                          ),
                        CheckboxListTile(
                          value: _agree,
                          onChanged: _atEnd && !_busy ? (v) => setState(() => _agree = v == true) : null,
                          controlAffinity: ListTileControlAffinity.leading,
                          contentPadding: EdgeInsets.zero,
                          title: Text(tx('Sözleşmenin tamamını okudum, anladım ve kabul ediyorum.'), style: const TextStyle(fontSize: 13)),
                        ),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _atEnd && _agree && !_busy ? _accept : null,
                            child: _busy
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                : Text(d['method'] == 'sms' ? tx('SMS koduyla onayla') : tx('Şifremle onayla')),
                          ),
                        ),
                      ]),
                    ),
                  ),
                ]),
    );
  }
}

/// Sözleşmelerim: durum (onaylandı / güncel sürüm bekliyor) ve onaylanan sözleşmelerin PDF kopyası.
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

  Future<void> _pdf(String id) async {
    final r = await guard(context, () => Api.post('/api/contracts/acceptances/$id/link'));
    final url = Api.absoluteUrl(r?['path'] as String?);
    if (url == null) return;
    if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication) && mounted) toast(context, tx('Belge açılamadı.'), error: true);
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
                            ? tx('Güncel sürüm onaylı ({v})', {'v': '${s['version']}'})
                            : s['accepted'] == null
                                ? tx('Onayınızı bekliyor')
                                : tx('Yeni sürüm ({v}) onayınızı bekliyor', {'v': '${s['version']}'})),
                    trailing: s['published'] == true && s['upToDate'] != true ? FilledButton(onPressed: () async {
                      if (await openContract(context, '${s['kind']}')) _load();
                    }, child: Text(tx('Oku ve onayla'))) : null,
                  ),
                if (_acc.isNotEmpty) Padding(padding: const EdgeInsets.fromLTRB(16, 16, 16, 4), child: Text(tx('Onaylanan belgeler'), style: const TextStyle(fontWeight: FontWeight.w700))),
                for (final a in _acc)
                  ListTile(
                    leading: const Icon(Icons.picture_as_pdf_outlined),
                    title: Text('${a['contractNo']} · ${tx('Sürüm')} ${a['version']}'),
                    subtitle: Text('${a['acceptedAt']}'.replaceFirst('T', ' ').split('.').first),
                    onTap: () => _pdf('${a['id']}'),
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
            ? tx('{t} onayınızı bekliyor. Onaylanana kadar ödemeleriniz bekletilir ve ilgili paneller açılmaz.', {'t': '${s['title']}'})
            : tx('{t} güncellendi (sürüm {v}). Yeni sürümü okuyup onaylayın.', {'t': '${s['title']}', 'v': '${s['version']}'}),
        action: tx('Oku ve onayla'),
      );
      if (go && context.mounted) await openContract(context, '${s['kind']}');
    }
  }
}
