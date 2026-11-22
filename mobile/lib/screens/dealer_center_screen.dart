import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/l10n.dart';
import '../services/api.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import '../widgets/external_webview.dart';
import 'dealer_subs_screen.dart';

/// Coins Bayisi Merkezi (v2.124, Yoho "Coins bayim" akışı; uygulama renkleri):
///  · Merkez: satıştaki Coin, "Kendine yükle", "Kullanıcıya Coins Yükle", işletme verileri, araçlar.
///  · Satış: ID ile ara → kişi kartı → miktar → hesaba geçiş (anında / 5 dk sonra) → not → sipariş onayı.
///  · Stok yükle (Şarj): ödeme yöntemi + toptan paket → yönetimin bağlantısı açılır, talep "bekliyor" düşer.
///  · İşlem geçmişi: tarih aralığı, Tümü / Coin satın alma / Coin satışı.
const _dark = Color(0xFF0B0906);
const _card = Color(0xFF17130C);
const _line = Color(0xFF3A2F1A);
const _gold = Color(0xFFF2B92A);
const _goldHi = Color(0xFFFFD54F);

String _short(String v) {
  final n = BigInt.tryParse(v) ?? BigInt.zero;
  String f(int d, String u) {
    final whole = n ~/ BigInt.from(d);
    final frac = (n % BigInt.from(d)) * BigInt.from(100) ~/ BigInt.from(d);
    if (frac == BigInt.zero) return '$whole$u';
    final s = frac.toString().padLeft(2, '0').replaceAll(RegExp(r'0+$'), '');
    return '$whole,$s$u';
  }

  if (n >= BigInt.from(1000000)) return f(1000000, 'M');
  return fmtNumber(n.toString());
}

Widget _goldButton(String label, VoidCallback? onTap, {double h = 50, IconData? icon}) => Opacity(
      opacity: onTap == null ? 0.45 : 1,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(h / 2),
          onTap: onTap,
          child: Ink(
            height: h,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(h / 2), gradient: const LinearGradient(colors: [_gold, _goldHi])),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              if (icon != null) ...[Icon(icon, color: _dark, size: 20), const SizedBox(width: 6)],
              Text(label, style: const TextStyle(color: _dark, fontWeight: FontWeight.w900, fontSize: 16)),
            ]),
          ),
        ),
      ),
    );

Widget _panel({required Widget child}) => Container(
      margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: _card, borderRadius: BorderRadius.circular(16), border: Border.all(color: _line)),
      child: child,
    );

// ============================================================================================================
// Merkez
// ============================================================================================================
class DealerCenterScreen extends StatefulWidget {
  const DealerCenterScreen({super.key});

  @override
  State<DealerCenterScreen> createState() => _DealerCenterScreenState();
}

class _DealerCenterScreenState extends State<DealerCenterScreen> {
  int _v = 0;
  bool _more = false;

  Future<Map<String, dynamic>> _load() async {
    final me = Api.get('/api/dealer/me');
    final st = Api.get('/api/dealer/stats').catchError((_) => <String, dynamic>{});
    // Alt bayi bölümü: eski sunucuda bu uç yok, o yüzden hatası yutuluyor — ekranın
    // tamamı bir ek bölüm yüzünden açılmaz hale gelmesin.
    final sub = Api.get('/api/dealer/subs').catchError((_) => <String, dynamic>{});
    return {'me': await me, 'stats': await st, 'subs': await sub};
  }

  Future<void> _open(Widget page) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => page));
    if (mounted) setState(() => _v++);
  }

  Future<void> _selfTopup(String balance) async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: _card,
        title: Text(tx('Kendine yükle'), style: const TextStyle(color: _goldHi)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(tx('Stoğundan kendi hesabına anında Coin aktarılır.'), style: const TextStyle(color: Colors.white70)),
          const SizedBox(height: 10),
          TextField(
            controller: ctl,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(hintText: tx('Coin miktarı'), suffixText: '/ ${fmtNumber(balance)}'),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tx('İptal'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tx('Yükle'))),
        ],
      ),
    );
    final amount = ctl.text.trim();
    if (ok != true || amount.isEmpty || !mounted) return;
    final r = await guard(context, () => Api.postOnce('/api/dealer/self', {'amount': amount}));
    if (r == null || !mounted) return;
    if (r['userBalance'] != null) Session.setCoins('${r['userBalance']}');
    toast(context, tx('{n} Coin hesabına yüklendi.', {'n': fmtNumber(amount)}));
    setState(() => _v++);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _dark,
      appBar: AppBar(backgroundColor: _dark, title: Text(tx('Coins Bayisi Merkezi'))),
      body: AsyncBody<Map<String, dynamic>>(
        version: _v,
        load: _load,
        builder: (context, data, reload) {
          final dealer = mapOf(mapOf(data['me'])?['dealer']) ?? {};
          final st = mapOf(data['stats']) ?? {};
          final total = mapOf(st['total']) ?? {};
          final balance = '${dealer['coinBalance'] ?? '0'}';
          Widget stat(String value, String label) => Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: _dark, borderRadius: BorderRadius.circular(12), border: Border.all(color: _line)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800))),
                  const SizedBox(height: 4),
                  Text(label, style: const TextStyle(color: Colors.white54, fontSize: 11.5)),
                ]),
              );
          Widget period(String label, Map<String, dynamic>? p) => Expanded(
                child: Column(children: [
                  Text(_short('${p?['coins'] ?? 0}'), style: const TextStyle(color: _goldHi, fontWeight: FontWeight.w800, fontSize: 15)),
                  Text(label, style: const TextStyle(color: Colors.white54, fontSize: 11)),
                  Text(tx('{n} işlem', {'n': p?['count'] ?? 0}), style: const TextStyle(color: Colors.white38, fontSize: 10.5)),
                ]),
              );
          Widget tool(IconData icon, String label, VoidCallback onTap) => Expanded(
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: onTap,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Column(children: [
                      Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: _dark, border: Border.all(color: _gold.withValues(alpha: 0.6))),
                        child: Icon(icon, color: _goldHi),
                      ),
                      const SizedBox(height: 6),
                      Text(label, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                    ]),
                  ),
                ),
              );
          return RefreshIndicator(
            onRefresh: reload,
            child: ListView(padding: const EdgeInsets.only(top: 8, bottom: 24), children: [
              // Satışa sunulan Coin (stok).
              Container(
                margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF3A2A0C), _card, Color(0xFF2A1F08)]),
                  border: Border.all(color: _gold.withValues(alpha: 0.7)),
                  boxShadow: [BoxShadow(color: _gold.withValues(alpha: 0.18), blurRadius: 18)],
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(tx('Satışa Sunulan Coins'), style: const TextStyle(color: Colors.white70, fontSize: 13.5))),
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(side: const BorderSide(color: _gold), shape: const StadiumBorder(), visualDensity: VisualDensity.compact),
                      onPressed: () => _selfTopup(balance),
                      child: Text(tx('Kendine yükle'), style: const TextStyle(color: _goldHi, fontSize: 12)),
                    ),
                  ]),
                  const SizedBox(height: 6),
                  Row(children: [
                    const Text('🪙', style: TextStyle(fontSize: 22)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        alignment: Alignment.centerLeft,
                        child: Text(fmtNumber(balance), style: const TextStyle(color: _goldHi, fontSize: 32, fontWeight: FontWeight.w900)),
                      ),
                    ),
                  ]),
                  if ((total['scheduled'] as num? ?? 0) > 0)
                    Text(tx('{n} sipariş teslim sırasında', {'n': total['scheduled']}), style: const TextStyle(color: Colors.white54, fontSize: 11.5)),
                  const SizedBox(height: 14),
                  _goldButton(tx('Kullanıcıya Coins Yükle'), () => _open(const DealerSellScreen()), icon: Icons.send_rounded),
                ]),
              ),
              // İşletme verileri.
              _panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(tx('İşletme Verileri'), style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800))),
                    IconButton(onPressed: () => _open(const DealerHistoryScreen()), icon: const Icon(Icons.chevron_right, color: Colors.white54)),
                  ]),
                  Text(tx('İşletmeye Genel Bakış'), style: const TextStyle(color: Colors.white54, fontSize: 12)),
                  const SizedBox(height: 10),
                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 2.1,
                    children: [
                      stat('₺${fmtNumber((double.tryParse('${total['cashTry'] ?? 0}') ?? 0).round().toString())}', tx('Stok yüklemesi · TL')),
                      stat(fmtNumber('${total['coins'] ?? 0}'), tx('Satılan Geçerli Coins')),
                      stat('${total['customers'] ?? 0}', tx('Tekil Müşteriler')),
                      stat(tx('{n} sipariş', {'n': total['orders'] ?? 0}), tx('Başarılı işlemler')),
                    ],
                  ),
                  AnimatedCrossFade(
                    duration: const Duration(milliseconds: 200),
                    crossFadeState: _more ? CrossFadeState.showSecond : CrossFadeState.showFirst,
                    firstChild: const SizedBox(width: double.infinity),
                    secondChild: Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Row(children: [
                        period(tx('Bugün'), mapOf(st['today'])),
                        period(tx('7 gün'), mapOf(st['week'])),
                        period(tx('30 gün'), mapOf(st['month'])),
                      ]),
                    ),
                  ),
                  Center(
                    child: TextButton.icon(
                      onPressed: () => setState(() => _more = !_more),
                      icon: Icon(_more ? Icons.expand_less : Icons.expand_more, color: Colors.white54),
                      label: Text(_more ? tx('Daha az') : tx('Daha Fazlasını Görüntüle'), style: const TextStyle(color: Colors.white54)),
                    ),
                  ),
                ]),
              ),
              // Araçlarım.
              _panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(tx('Araçlarım'), style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 8),
                  Row(children: [
                    tool(Icons.person_search, tx('Müşteri Bul'), () => _open(const DealerSellScreen())),
                    tool(Icons.history, tx('İşlem Geçmişi'), () => _open(const DealerHistoryScreen())),
                    tool(Icons.add_card, tx('Stok Yükle'), () async {
                      await showDealerStockSheet(context, balance: balance);
                      if (mounted) setState(() => _v++);
                    }),
                    tool(Icons.receipt_long, tx('Taleplerim'), () => _open(const DealerRequestsScreen())),
                  ]),
                ]),
              ),
              // Ana bayi / Alt bayi. Yalnızca ANA bayide görünür: alt bayinin kendi
              // altında bayi olamaz (en fazla iki kat), boş bir bölüm göstermeyelim.
              if ((mapOf(data['subs']) ?? const <String, dynamic>{})['isSub'] == false)
                _panel(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => _open(const DealerSubsScreen()),
                    child: Row(children: [
                      const Icon(Icons.account_tree_outlined, color: _goldHi),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(tx('Alt Bayilerim'), style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
                          Text(
                            '${listOf((mapOf(data['subs']) ?? const <String, dynamic>{})['subs']).length} ${tx('bayi')}',
                            style: const TextStyle(color: Colors.white54, fontSize: 12),
                          ),
                        ]),
                      ),
                      const Icon(Icons.chevron_right, color: Colors.white54),
                    ]),
                  ),
                ),
            ]),
          );
        },
      ),
    );
  }
}

// ============================================================================================================
// Satış: "Coins Bayi Ajansını Kullanın"
// ============================================================================================================
class DealerSellScreen extends StatefulWidget {
  const DealerSellScreen({super.key});

  @override
  State<DealerSellScreen> createState() => _DealerSellScreenState();
}

class _DealerSellScreenState extends State<DealerSellScreen> {
  final _q = TextEditingController();
  final _amount = TextEditingController();
  final _note = TextEditingController();
  Map<String, dynamic>? _buyer;
  String _balance = '0';
  String? _findErr;
  bool _finding = false;
  bool _busy = false;
  int _delay = 0;
  String _key = Api.newIdempotencyKey(); // aynı sipariş iki kez gitmesin; yalnızca başarılı satıştan sonra yenilenir

  @override
  void initState() {
    super.initState();
    _loadBalance();
    _amount.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _q.dispose();
    _amount.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _loadBalance() async {
    try {
      final r = await Api.get('/api/dealer/me');
      if (mounted) setState(() => _balance = '${mapOf(r['dealer'])?['coinBalance'] ?? '0'}');
    } catch (_) {}
  }

  Future<void> _find() async {
    final q = _q.text.trim().replaceFirst('@', '');
    if (q.isEmpty) return;
    FocusScope.of(context).unfocus();
    setState(() {
      _finding = true;
      _findErr = null;
      _buyer = null;
    });
    try {
      final r = await Api.get('/api/dealer/lookup', query: {'q': q});
      if (mounted) setState(() => _buyer = mapOf(r['user']));
    } catch (e) {
      if (mounted) setState(() => _findErr = errorText(e));
    } finally {
      if (mounted) setState(() => _finding = false);
    }
  }

  BigInt get _coins => BigInt.tryParse(_amount.text.trim()) ?? BigInt.zero;
  bool get _tooMuch => _coins > (BigInt.tryParse(_balance) ?? BigInt.zero);

  Future<void> _confirm() async {
    final b = _buyer;
    if (b == null || _coins <= BigInt.zero || _tooMuch || _busy) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => Dialog(
        backgroundColor: _card,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: _line)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 20, 18, 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(tx('Sipariş onayı'), style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Text(tx('Lütfen şarj ID\'sini ve coin miktarını kontrol edin. Bu işlem geri alınamaz.'),
                textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFFFB74D), fontSize: 13)),
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: _dark, borderRadius: BorderRadius.circular(12), border: Border.all(color: _line)),
              child: Row(children: [
                UserAvatar(user: b, radius: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('${b['displayName'] ?? b['username']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    Text('ID: ${b['publicId'] ?? '—'}', style: const TextStyle(color: Colors.white54, fontSize: 12)),
                    Text('${tx('Şarj')}: 🪙 ${fmtNumber(_coins.toString())}${_delay > 0 ? ' · ${tx('5 dakika sonra')}' : ''}',
                        style: const TextStyle(color: _goldHi, fontSize: 12.5, fontWeight: FontWeight.w700)),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(side: const BorderSide(color: Colors.white24), shape: const StadiumBorder(), minimumSize: const Size(0, 46)),
                  onPressed: () => Navigator.pop(c, false),
                  child: Text(tx('İptal et'), style: const TextStyle(color: Colors.white70)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(child: _goldButton(tx('Şarj'), () => Navigator.pop(c, true), h: 46)),
            ]),
          ]),
        ),
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _busy = true);
    final r = await guard(
      context,
      () => Api.postOnce('/api/dealer/sell', {
        'userId': b['id'],
        'amount': _coins.toString(),
        'delayMinutes': _delay,
        if (_note.text.trim().isNotEmpty) 'description': _note.text.trim(),
      }, key: _key),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (r == null) return;
    toast(context, r['scheduled'] == true
        ? tx('Sipariş alındı; Coin 5 dakika sonra hesaba geçecek.')
        : tx('{n} Coin {name} hesabına yüklendi.', {'n': fmtNumber(_coins.toString()), 'name': '${b['displayName'] ?? b['username']}'}));
    setState(() {
      _balance = '${r['dealerBalance'] ?? _balance}';
      _key = Api.newIdempotencyKey();
      _amount.clear();
      _note.clear();
      _buyer = null;
      _q.clear();
      _delay = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    final b = _buyer;
    final canSend = b != null && _coins > BigInt.zero && !_tooMuch && !_busy;
    InputDecoration deco(String hint, {Widget? prefix, Widget? suffix}) => InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Colors.white38),
          filled: true,
          fillColor: _card,
          prefixIcon: prefix,
          suffixIcon: suffix,
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: _line)),
          enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: _line)),
          focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: _gold)),
        );
    Widget label(String t) => Padding(padding: const EdgeInsets.fromLTRB(2, 16, 2, 8), child: Text(t, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w700)));
    Widget radio(int v, String t) => Expanded(
          child: InkWell(
            onTap: () => setState(() => _delay = v),
            child: Row(children: [
              Icon(_delay == v ? Icons.check_circle : Icons.radio_button_unchecked, color: _delay == v ? _gold : Colors.white38, size: 22),
              const SizedBox(width: 6),
              Flexible(child: Text(t, style: TextStyle(color: _delay == v ? Colors.white : Colors.white54, fontSize: 13))),
            ]),
          ),
        );
    return Scaffold(
      backgroundColor: _dark,
      appBar: AppBar(backgroundColor: _dark, title: Text(tx('Coins Bayi Ajansını Kullanın'))),
      body: ListView(padding: const EdgeInsets.fromLTRB(14, 8, 14, 24), children: [
        // Stok kartı.
        Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: const LinearGradient(colors: [Color(0xFF8A5A00), _gold, _goldHi]),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(tx('Coin Bakiyesi'), style: const TextStyle(color: Color(0xCC0B0906), fontWeight: FontWeight.w600))),
              IconButton(
                visualDensity: VisualDensity.compact,
                onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DealerHistoryScreen())),
                icon: const Icon(Icons.receipt_long, color: _dark),
              ),
            ]),
            Row(children: [
              const Text('🪙', style: TextStyle(fontSize: 22)),
              const SizedBox(width: 6),
              Expanded(
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(fmtNumber(_balance), style: const TextStyle(color: _dark, fontSize: 28, fontWeight: FontWeight.w900)),
                ),
              ),
              TextButton(
                onPressed: () async {
                  await showDealerStockSheet(context, balance: _balance);
                  _loadBalance();
                },
                child: Text('${tx('Şarj')} ›', style: const TextStyle(color: _dark, fontWeight: FontWeight.w800)),
              ),
            ]),
          ]),
        ),
        label(tx('Şarj için')),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _q,
              style: const TextStyle(color: Colors.white),
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _find(),
              decoration: deco(tx('Kullanıcının ID\'sini girin')),
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(width: 82, child: _goldButton(_finding ? '…' : tx('Ara'), _finding ? null : _find, h: 48)),
        ]),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: b != null ? _gold.withValues(alpha: 0.7) : _line),
          ),
          child: b == null
              ? Text(_findErr ?? tx('Kullanıcı kimliği doğrulaması için kullanıcının ID\'sini girin'),
                  textAlign: TextAlign.center, style: TextStyle(color: _findErr != null ? Colors.redAccent : Colors.white38, height: 1.35))
              : Row(children: [
                  UserAvatar(user: b, radius: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        const Icon(Icons.verified, color: Colors.greenAccent, size: 16),
                        const SizedBox(width: 4),
                        Flexible(child: Text('${b['displayName'] ?? b['username']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15))),
                      ]),
                      Text('ID: ${b['publicId'] ?? '—'}${b['level'] != null ? ' · Lv.${b['level']}' : ''}', style: const TextStyle(color: Colors.white54, fontSize: 12.5)),
                    ]),
                  ),
                  IconButton(onPressed: () => setState(() => _buyer = null), icon: const Icon(Icons.close, color: Colors.white38)),
                ]),
        ),
        label(tx('Yeniden şarj miktarı')),
        TextField(
          controller: _amount,
          enabled: b != null,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          style: const TextStyle(color: _goldHi, fontSize: 18, fontWeight: FontWeight.w800),
          decoration: deco(tx('Coin miktarını girin'), prefix: const Padding(padding: EdgeInsets.all(12), child: Text('🪙'))),
        ),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final v in const ['50000', '100000', '500000', '1000000', '2000000'])
            ActionChip(
              label: Text(_short(v)),
              onPressed: b == null ? null : () => _amount.text = v,
              backgroundColor: _card,
              side: const BorderSide(color: _line),
              labelStyle: const TextStyle(color: _goldHi, fontWeight: FontWeight.w700),
            ),
        ]),
        if (_tooMuch) Padding(padding: const EdgeInsets.only(top: 6), child: Text(tx('Stok yetersiz.'), style: const TextStyle(color: Colors.redAccent))),
        label(tx('Hesaba Geçiş Süresi')),
        Row(children: [radio(0, tx('Anında Hesaba Geçiş')), radio(5, tx('5 Dakika Sonra Hesaba Geçiş'))]),
        label(tx('Not:')),
        TextField(controller: _note, maxLength: 200, style: const TextStyle(color: Colors.white), decoration: deco(tx('İsteğe bağlı (ör. havale referansı)'))),
        const SizedBox(height: 8),
        _goldButton(_busy ? tx('Gönderiliyor…') : tx('Onayla'), canSend ? _confirm : null),
      ]),
    );
  }
}

// ============================================================================================================
// Stok yükle (Şarj): ödeme yöntemi + toptan paket → ödeme bağlantısı
// ============================================================================================================
Future<void> showDealerStockSheet(BuildContext context, {required String balance}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _StockSheet(balance: balance),
  );
}

class _StockSheet extends StatefulWidget {
  final String balance;
  const _StockSheet({required this.balance});

  @override
  State<_StockSheet> createState() => _StockSheetState();
}

class _StockSheetState extends State<_StockSheet> {
  List<Map<String, dynamic>> _packages = [];
  List<Map<String, dynamic>> _methods = [];
  String? _method;
  String? _pkg;
  bool _loading = true;
  bool _busy = false;
  String? _err;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Api.get('/api/dealer/topup-packages');
      if (!mounted) return;
      setState(() {
        _packages = listOf(r['packages']);
        _methods = listOf(r['methods']);
        _method = _methods.where((m) => m['ready'] == true).firstOrNull?['id']?.toString();
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _err = errorText(e);
          _loading = false;
        });
      }
    }
  }

  Future<void> _buy() async {
    final code = _pkg;
    if (code == null || _busy) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.postOnce('/api/dealer/topup-requests', {'packageCode': code, if (_method != null) 'methodId': _method}));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r == null) return;
    final ref = '${mapOf(r['request'])?['refCode'] ?? ''}';
    final url = r['payUrl']?.toString();
    Navigator.pop(context);
    toast(context, tx('Talep oluşturuldu (referans {ref}). Ödeme onaylanınca stoğuna eklenir.', {'ref': ref}));
    if (url != null && url.isNotEmpty) await openPayLink(url);
  }

  Widget _icon(String ic, double size) {
    final u = ic.startsWith('http') || ic.startsWith('/') ? Api.absoluteUrl(ic) : null;
    return u != null ? NetImg(u, width: size, height: size, fit: BoxFit.contain) : Text(ic, style: TextStyle(fontSize: size * 0.8));
  }

  @override
  Widget build(BuildContext context) {
    final sel = _packages.where((p) => p['code'] == _pkg).firstOrNull;
    return Container(
      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.8),
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF2A1F08), _dark]),
        border: Border(top: BorderSide(color: _gold, width: 1.2)),
      ),
      child: SafeArea(
        top: false,
        child: _loading
            ? const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: _gold)))
            : _err != null
                ? Padding(padding: const EdgeInsets.all(30), child: Text(_err!, style: const TextStyle(color: Colors.white70)))
                : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 8, 4),
                      child: Row(children: [
                        Expanded(child: Text(tx('Stok yükle'), style: const TextStyle(color: _goldHi, fontSize: 17, fontWeight: FontWeight.w900))),
                        IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close, color: Colors.white70)),
                      ]),
                    ),
                    if (_methods.isNotEmpty)
                      SizedBox(
                        height: 52,
                        child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
                          for (final m in _methods)
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: Stack(clipBehavior: Clip.none, children: [
                                ChoiceChip(
                                  avatar: _icon('${m['icon'] ?? '💳'}', 20),
                                  label: Text('${m['name']}'),
                                  selected: _method == m['id'],
                                  onSelected: m['ready'] == true ? (_) => setState(() => _method = '${m['id']}') : null,
                                  selectedColor: const Color(0xFF3A2A0C),
                                  backgroundColor: _card,
                                  side: BorderSide(color: _method == m['id'] ? _gold : _line),
                                  labelStyle: const TextStyle(color: Colors.white),
                                  showCheckmark: false,
                                ),
                                if ('${m['badge'] ?? ''}'.isNotEmpty)
                                  Positioned(
                                    right: 0,
                                    top: -6,
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                      decoration: BoxDecoration(color: const Color(0xFFE53935), borderRadius: BorderRadius.circular(6)),
                                      child: Text('${m['badge']}', style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w700)),
                                    ),
                                  ),
                              ]),
                            ),
                        ]),
                      ),
                    Flexible(
                      child: GridView.count(
                        crossAxisCount: 3,
                        shrinkWrap: true,
                        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                        childAspectRatio: 1.35,
                        children: [
                          for (final p in _packages)
                            InkWell(
                              borderRadius: BorderRadius.circular(12),
                              onTap: () => setState(() => _pkg = '${p['code']}'),
                              child: Container(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(12),
                                  color: _pkg == p['code'] ? const Color(0xFF3A2A0C) : _card,
                                  border: Border.all(color: _pkg == p['code'] ? _gold : _line, width: _pkg == p['code'] ? 1.6 : 1),
                                ),
                                child: Column(children: [
                                  Expanded(
                                    child: Center(
                                      child: Text('🪙 ${_short('${p['coins']}')}', style: const TextStyle(color: _goldHi, fontWeight: FontWeight.w900, fontSize: 15.5)),
                                    ),
                                  ),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.symmetric(vertical: 4),
                                    decoration: BoxDecoration(
                                      color: _pkg == p['code'] ? _gold : const Color(0xFF241B0E),
                                      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(11)),
                                    ),
                                    child: Text('₺${fmtNumber('${(p['priceTry'] as num?)?.round() ?? 0}')}',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(color: _pkg == p['code'] ? _dark : Colors.white70, fontWeight: FontWeight.w800, fontSize: 12.5)),
                                  ),
                                ]),
                              ),
                            ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 6),
                      child: Text(
                        _methods.where((m) => m['ready'] == true).isEmpty
                            ? tx('Ödeme bağlantısı henüz eklenmedi; talep yönetime düşer, ödeme bilgisi size iletilir.')
                            : tx('Ödeme sayfası açılır; ödeme açıklamasına talep referansını yazın. Onaylanınca stoğa eklenir.'),
                        style: const TextStyle(color: Colors.white54, fontSize: 11.5),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
                      child: Row(children: [
                        Text('${tx('Stok')} 🪙 ${fmtNumber(widget.balance)}', style: const TextStyle(color: Colors.white70)),
                        const Spacer(),
                        SizedBox(
                          width: 170,
                          child: _goldButton(
                            _busy ? '…' : (sel == null ? tx('Paket seç') : '₺${fmtNumber('${(sel['priceTry'] as num?)?.round() ?? 0}')} ${tx('Öde')}'),
                            sel == null || _busy ? null : _buy,
                            h: 46,
                          ),
                        ),
                      ]),
                    ),
                  ]),
      ),
    );
  }
}

// ============================================================================================================
// İşlem geçmişi: "Yeniden Şarj Geçmişi"
// ============================================================================================================
class DealerHistoryScreen extends StatefulWidget {
  const DealerHistoryScreen({super.key});

  @override
  State<DealerHistoryScreen> createState() => _DealerHistoryScreenState();
}

class _DealerHistoryScreenState extends State<DealerHistoryScreen> {
  DateTime _from = DateTime.now().subtract(const Duration(days: 7));
  DateTime _to = DateTime.now();
  String _type = 'all';
  final List<Map<String, dynamic>> _items = [];
  bool _more = false;
  bool _loading = false;
  String? _err;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_more && !_loading && _scroll.position.pixels > _scroll.position.maxScrollExtent - 200) _load();
    });
    _load(reset: true);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  String _d(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
  String _show(DateTime d) => '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';

  Future<void> _load({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _err = null;
      if (reset) {
        _items.clear();
        _more = false;
      }
    });
    try {
      final r = await Api.get('/api/dealer/transactions', query: {
        'from': _d(_from),
        'to': _d(_to),
        'type': _type,
        if (!reset && _items.isNotEmpty) 'before': '${_items.last['createdAt']}',
      });
      if (!mounted) return;
      setState(() {
        _items.addAll(listOf(r['items']));
        _more = r['more'] == true;
      });
    } catch (e) {
      if (mounted) setState(() => _err = errorText(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _pick(bool from) async {
    final d = await showDatePicker(
      context: context,
      initialDate: from ? _from : _to,
      firstDate: DateTime(2024),
      lastDate: DateTime.now(),
    );
    if (d == null || !mounted) return;
    setState(() {
      if (from) {
        _from = d;
        if (_to.isBefore(d)) _to = d;
      } else {
        _to = d;
        if (_from.isAfter(d)) _from = d;
      }
    });
    _load(reset: true);
  }

  @override
  Widget build(BuildContext context) {
    Widget dateBox(DateTime d, bool from) => Expanded(
          child: InkWell(
            onTap: () => _pick(from),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(color: _card, borderRadius: BorderRadius.circular(12), border: Border.all(color: _line)),
              child: Row(children: [
                Expanded(child: Text(_show(d), style: const TextStyle(color: Colors.white))),
                const Icon(Icons.expand_more, color: Colors.white54, size: 18),
              ]),
            ),
          ),
        );
    Widget tab(String v, String t) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(
            label: Text(t),
            selected: _type == v,
            onSelected: (_) {
              setState(() => _type = v);
              _load(reset: true);
            },
            selectedColor: _gold,
            backgroundColor: _card,
            side: BorderSide(color: _type == v ? _gold : _line),
            labelStyle: TextStyle(color: _type == v ? _dark : Colors.white70, fontWeight: FontWeight.w700),
            showCheckmark: false,
          ),
        );
    return Scaffold(
      backgroundColor: _dark,
      appBar: AppBar(backgroundColor: _dark, title: Text(tx('Yeniden Şarj Geçmişi'))),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 6),
          child: Row(children: [dateBox(_from, true), const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('—', style: TextStyle(color: Colors.white38))), dateBox(_to, false)]),
        ),
        SizedBox(
          height: 44,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 14), children: [
            tab('all', tx('Tümü')),
            tab('in', tx('Coin Satın Alma')),
            tab('out', tx('Coin Satışı')),
          ]),
        ),
        Expanded(
          child: _err != null && _items.isEmpty
              ? Center(child: Text(_err!, style: const TextStyle(color: Colors.white54)))
              : _items.isEmpty && !_loading
                  ? Center(child: Text(tx('Bu aralıkta işlem yok.'), style: const TextStyle(color: Colors.white38)))
                  : RefreshIndicator(
                      onRefresh: () => _load(reset: true),
                      child: ListView.separated(
                        controller: _scroll,
                        padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
                        itemCount: _items.length + (_loading ? 1 : 0),
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          if (i >= _items.length) return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator(color: _gold)));
                          final t = _items[i];
                          final u = mapOf(t['user']);
                          final sale = t['type'] == 'sale';
                          final at = DateTime.tryParse('${t['createdAt']}')?.toLocal();
                          final status = '${t['status'] ?? 'done'}';
                          return Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(color: _card, borderRadius: BorderRadius.circular(14), border: Border.all(color: _line)),
                            child: Row(children: [
                              if (u != null) UserAvatar(user: u, radius: 20) else CircleAvatar(radius: 20, backgroundColor: const Color(0xFF3A2A0C), child: Icon(sale ? Icons.person : Icons.add_card, color: _goldHi, size: 20)),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(u != null ? '${u['displayName']}' : (sale ? tx('Coin satışı') : tx('Stok yüklemesi')),
                                      maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                                  if (u != null) Text('ID: ${u['publicId'] ?? '—'}', style: const TextStyle(color: Colors.white54, fontSize: 12)),
                                  Text(
                                    at == null ? '' : '${_show(at)} ${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}:${at.second.toString().padLeft(2, '0')}',
                                    style: const TextStyle(color: Colors.white38, fontSize: 11.5),
                                  ),
                                ]),
                              ),
                              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Text('${sale ? '−' : '+'} 🪙 ${fmtNumber('${t['coinAmount']}')}',
                                    style: TextStyle(color: sale ? _goldHi : Colors.greenAccent, fontWeight: FontWeight.w800)),
                                if (status == 'scheduled')
                                  Text(tx('Teslim sırasında'), style: const TextStyle(color: Color(0xFFFFB74D), fontSize: 11))
                                else if (status == 'refunded')
                                  Text(tx('İade edildi'), style: const TextStyle(color: Colors.redAccent, fontSize: 11)),
                              ]),
                            ]),
                          );
                        },
                      ),
                    ),
        ),
      ]),
    );
  }
}

// ============================================================================================================
// Stok taleplerim
// ============================================================================================================
class DealerRequestsScreen extends StatelessWidget {
  const DealerRequestsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _dark,
      appBar: AppBar(backgroundColor: _dark, title: Text(tx('Taleplerim'))),
      body: AsyncBody<Map<String, dynamic>>(
        load: () => Api.get('/api/dealer/topup-requests'),
        builder: (context, data, reload) {
          final list = listOf(data['requests']);
          if (list.isEmpty) return Center(child: Text(tx('Henüz stok talebin yok.'), style: const TextStyle(color: Colors.white38)));
          return ListView.separated(
            padding: const EdgeInsets.all(14),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final r = list[i];
              final st = '${r['status']}';
              final color = st == 'approved' ? Colors.greenAccent : (st == 'rejected' ? Colors.redAccent : const Color(0xFFFFB74D));
              final label = st == 'approved' ? tx('Onaylandı') : (st == 'rejected' ? tx('Reddedildi') : tx('Bekliyor'));
              final at = DateTime.tryParse('${r['createdAt']}')?.toLocal();
              return Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: _card, borderRadius: BorderRadius.circular(14), border: Border.all(color: _line)),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('🪙 ${fmtNumber('${r['requestedCoins']}')}', style: const TextStyle(color: _goldHi, fontWeight: FontWeight.w800, fontSize: 15)),
                      Text([
                        if (r['priceTry'] != null) '₺${fmtNumber('${(r['priceTry'] as num).round()}')}',
                        if ('${r['refCode'] ?? ''}'.isNotEmpty) '${tx('Referans')}: ${r['refCode']}',
                        if (at != null) '${at.day.toString().padLeft(2, '0')}.${at.month.toString().padLeft(2, '0')}.${at.year}',
                      ].join(' · '), style: const TextStyle(color: Colors.white54, fontSize: 12)),
                      if ('${r['reviewNote'] ?? ''}'.isNotEmpty) Text('${r['reviewNote']}', style: const TextStyle(color: Colors.white38, fontSize: 11.5)),
                    ]),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(10), border: Border.all(color: color)),
                    child: Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                ]),
              );
            },
          );
        },
      ),
    );
  }
}
