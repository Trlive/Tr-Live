import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';

/// Sent tutarını "12.50 $" biçiminde yazar (tutarlar sunucudan metin olarak gelir).
String usdText(dynamic cents) {
  final v = BigInt.tryParse('${cents ?? 0}') ?? BigInt.zero;
  final a = v.abs();
  final whole = a ~/ BigInt.from(100);
  final frac = (a % BigInt.from(100)).toInt().toString().padLeft(2, '0');
  return '${v < BigInt.zero ? '-' : ''}$whole.$frac \$';
}

/// Sent tutarını Fasulye olarak yazar: 1250 → "12,5", 1000 → "10" (1 Fasulye = 1 dolar = 100 sent).
String beanText(dynamic cents) {
  final v = BigInt.tryParse('${cents ?? 0}') ?? BigInt.zero;
  final a = v.abs();
  final whole = a ~/ BigInt.from(100);
  final frac = (a % BigInt.from(100)).toInt().toString().padLeft(2, '0').replaceAll(RegExp(r'0+$'), '');
  return '${v < BigInt.zero ? '-' : ''}$whole${frac.isEmpty ? '' : ',$frac'}';
}

/// Fasulye simgesi (uygulama renklerinde altın fasulye).
class BeanIcon extends StatelessWidget {
  final double size;
  const BeanIcon({super.key, this.size = 20});

  @override
  Widget build(BuildContext context) => Image.asset('assets/images/bean.webp', width: size, height: size);
}

/// "12", "12.5", "12,50" → sent (1250). Geçersizse null.
int? parseUsdCents(String input) {
  final s = input.trim().replaceAll(',', '.');
  final m = RegExp(r'^(\d{1,9})(?:\.(\d{1,2}))?$').firstMatch(s);
  if (m == null) return null;
  final whole = int.parse(m.group(1)!);
  final f = m.group(2) ?? '';
  final frac = f.isEmpty ? 0 : int.parse(f.padRight(2, '0'));
  return whole * 100 + frac;
}

String _typeLabel(String type) {
  switch (type) {
    case 'salary':
      return tx('Maaş');
    case 'agency_bonus':
      return tx('Ajans primi');
    case 'assistant_share':
      return tx('Asistan payı');
    case 'referral_bonus':
      return tx('Davet primi');
    case 'withdraw_request':
      return tx('Admine gönderim');
    case 'withdraw_refund':
      return tx('İade');
    case 'dealer_transfer':
      return tx('Bayiye gönderim');
    case 'coin_exchange':
      return tx('Coin\'e çevrildi');
    case 'coin_send':
      return tx('Coin gönderildi');
    default:
      return tx('Yönetici düzeltmesi');
  }
}

String _statusLabel(String status) {
  switch (status) {
    case 'paid':
      return tx('Ödendi');
    case 'rejected':
      return tx('Reddedildi');
    case 'cancelled':
      return tx('Vazgeçildi');
    default:
      return tx('Bekliyor');
  }
}

String _dateText(dynamic iso) {
  final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
  if (d == null) return '';
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(d.day)}.${two(d.month)}.${d.year} ${two(d.hour)}:${two(d.minute)}';
}

/// Fasulye cüzdanı: yayıncı ve ajans sahiplerinin maaş / prim bakiyesi (1 Fasulye = 1 dolar).
/// Fasulye Coin'e çevrilir (kendine ya da başka bir kullanıcıya Coin olarak gönderilir) ya da dolar olarak
/// bir bayiye (anında, geri alınamaz) veya admin'e (çekim talebi) gönderilir.
class UsdWalletScreen extends StatefulWidget {
  const UsdWalletScreen({super.key});

  @override
  State<UsdWalletScreen> createState() => _UsdWalletScreenState();
}

class _UsdWalletScreenState extends State<UsdWalletScreen> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Api.get('/api/usd/me');
      if (!mounted) return;
      setState(() {
        _data = r;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(e));
    }
  }

  int _cents(String key) => int.tryParse('${mapOf(_data?['settings'])?[key] ?? 0}') ?? 0;
  int get _balance => int.tryParse('${_data?['balanceCents'] ?? 0}') ?? 0;
  // Kimlik doğrulaması onaylanmadığı için cüzdana yatmayı bekleyen maaş.
  int get _held => int.tryParse('${_data?['heldSalaryCents'] ?? 0}') ?? 0;
  bool get _enabled => mapOf(_data?['settings'])?['enabled'] != false;

  Future<void> _openForm(Widget form) async {
    final done = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => form));
    if (done == true) await _load();
  }

  Future<void> _cancel(String id) async {
    if (_busy) return;
    if (!await confirm(context, tx('Bu talepten vazgeçilsin mi? Tutar cüzdanına geri döner.'), action: tx('Vazgeç'))) return;
    if (!mounted) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.post('/api/usd/withdrawals/$id/cancel'));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    return Scaffold(
      appBar: AppBar(title: Text(tx('Fasulye cüzdanı'))),
      body: d == null
          ? Center(
              child: _error == null
                  ? const CircularProgressIndicator()
                  : Column(mainAxisSize: MainAxisSize.min, children: [
                      Text(_error ?? '', textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim)),
                      const SizedBox(height: 10),
                      FilledButton(onPressed: _load, child: Text(tx('Tekrar dene'))),
                    ]),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(14), children: [
                _balanceCard(),
                if (_held > 0) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Pal.gold)),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Icon(Icons.verified_user_outlined, color: Pal.gold, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          tx('{a} maaşın bekliyor. Kimlik doğrulaman onaylanınca cüzdanına yatar (Yayıncı Merkezi → Kimlik doğrulama).', {'a': usdText(_held)}),
                          style: const TextStyle(fontSize: 12.5),
                        ),
                      ),
                    ]),
                  ),
                ],
                const SizedBox(height: 14),
                ..._pendingSection(d),
                Text(tx('Hareketler'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 6),
                if (listOf(d['transactions']).isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: Text(tx('Henüz hareket yok.'), style: const TextStyle(color: Pal.textDim))),
                  ),
                for (final t in listOf(d['transactions'])) _txRow(t),
              ]),
            ),
    );
  }

  Widget _balanceCard() {
    final minW = _cents('withdrawMinCents');
    final minD = _cents('dealerMinCents');
    final minX = _cents('exchangeMinCents');
    final rate = _cents('exchangeCoinsPerUsd');
    final canExchange = _enabled && _balance > 0 && _balance >= minX;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF2A2010), Pal.bg]),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Pal.gold),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(tx('Fasulye bakiyesi'), style: const TextStyle(color: Pal.textDim, fontSize: 13)),
        const SizedBox(height: 4),
        Row(children: [
          const BeanIcon(size: 34),
          const SizedBox(width: 8),
          Expanded(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(beanText(_balance), style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: Pal.gold)),
            ),
          ),
        ]),
        const SizedBox(height: 2),
        Text(tx('1 Fasulye = 1 dolar = {c} Coin', {'c': fmtNumber(rate)}), style: const TextStyle(color: Pal.textDim, fontSize: 12)),
        const SizedBox(height: 12),
        if (!_enabled)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(tx('Fasulye işlemleri şu an kapalı.'), style: const TextStyle(color: Pal.textDim)),
          ),
        // 1) Fasulyeyi Coin'e çevir: kendine ya da başka bir kullanıcıya.
        Row(children: [
          Expanded(
            child: FilledButton.icon(
              onPressed: canExchange ? () => _openForm(_BeanCoinForm(balance: _balance, min: minX, coinsPerUsd: rate, toOther: false)) : null,
              icon: const Icon(Icons.currency_exchange, size: 18),
              label: Text(tx('Coin\'e çevir')),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: FilledButton.icon(
              onPressed: canExchange ? () => _openForm(_BeanCoinForm(balance: _balance, min: minX, coinsPerUsd: rate, toOther: true)) : null,
              icon: const Icon(Icons.card_giftcard, size: 18),
              label: Text(tx('Coin gönder')),
            ),
          ),
        ]),
        const SizedBox(height: 14),
        // 2) Dolar olarak gönder: bayi ya da admin.
        Text(tx('Dolar olarak gönder'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _enabled && _balance >= minD
                  ? () => _openForm(_UsdDealerForm(balance: _balance, min: minD, coinsPerUsd: _cents('coinsPerUsd')))
                  : null,
              icon: const Icon(Icons.storefront_outlined, size: 18),
              label: Text(tx('Bayiye gönder')),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: _enabled && _balance >= minW ? () => _openForm(_UsdAdminForm(balance: _balance, min: minW)) : null,
              icon: const Icon(Icons.account_balance_outlined, size: 18),
              label: Text(tx('Admine gönder')),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        Text(
          tx('En az: Coin\'e çevirme {x} Fasulye, bayiye {b}, admine {a}. Kesinti yok.', {'x': beanText(minX), 'a': usdText(minW), 'b': usdText(minD)}),
          style: const TextStyle(color: Pal.textDim, fontSize: 12),
        ),
      ]),
    );
  }

  List<Widget> _pendingSection(Map<String, dynamic> d) {
    final all = listOf(d['withdrawals']);
    if (all.isEmpty) return const [];
    return [
      Text(tx('Admine gönderimlerim'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      const SizedBox(height: 6),
      for (final w in all.take(10))
        Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: Pal.outline)),
          child: Row(children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${usdText(w['amountCents'])} · ${w['method'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text('${_statusLabel('${w['status']}')} · ${_dateText(w['createdAt'])}', style: const TextStyle(color: Pal.textDim, fontSize: 12)),
                if ('${w['adminNote'] ?? ''}'.isNotEmpty) Text('${w['adminNote']}', style: const TextStyle(color: Pal.textDim, fontSize: 12)),
              ]),
            ),
            if (w['status'] == 'pending') TextButton(onPressed: _busy ? null : () => _cancel('${w['id']}'), child: Text(tx('Vazgeç'))),
          ]),
        ),
      const SizedBox(height: 8),
    ];
  }

  Widget _txRow(Map<String, dynamic> t) {
    final amount = BigInt.tryParse('${t['amountCents'] ?? 0}') ?? BigInt.zero;
    final plus = amount > BigInt.zero;
    final note = '${t['note'] ?? ''}';
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        Icon(plus ? Icons.south_west : Icons.north_east, size: 18, color: plus ? Pal.gold : Pal.textDim),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_typeLabel('${t['type']}'), style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(note.isEmpty ? _dateText(t['createdAt']) : '${_dateText(t['createdAt'])} · $note',
                maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.textDim, fontSize: 12)),
          ]),
        ),
        Text('${plus ? '+' : ''}${beanText(amount.toString())}', style: TextStyle(fontWeight: FontWeight.w800, color: plus ? Pal.gold : Pal.text)),
        const SizedBox(width: 4),
        const BeanIcon(size: 16),
      ]),
    );
  }
}

/// Fasulyeyi Coin'e çevirme formu. [toOther] false: Coin kendi hesabına yüklenir; true: seçilen kullanıcıya gönderilir.
/// Anında işlenir ve geri alınamaz.
class _BeanCoinForm extends StatefulWidget {
  final int balance;
  final int min;
  final int coinsPerUsd;
  final bool toOther;
  const _BeanCoinForm({required this.balance, required this.min, required this.coinsPerUsd, required this.toOther});

  @override
  State<_BeanCoinForm> createState() => _BeanCoinFormState();
}

class _BeanCoinFormState extends State<_BeanCoinForm> {
  final _amount = TextEditingController();
  Map<String, dynamic>? _target;
  bool _busy = false;
  final String _key = Api.newIdempotencyKey();

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  int _coinsFor(int cents) => (cents * widget.coinsPerUsd) ~/ 100;

  Future<void> _pickTarget() async {
    final u = await pickUser(context);
    if (u != null && mounted) setState(() => _target = u);
  }

  Future<void> _send() async {
    final target = _target;
    if (widget.toOther && target == null) {
      toast(context, tx('Önce alıcıyı seç.'), error: true);
      return;
    }
    final cents = parseUsdCents(_amount.text);
    if (cents == null || cents <= 0 || cents < widget.min) {
      toast(context, tx('En az {a} Fasulye çevirebilirsin.', {'a': beanText(widget.min)}), error: true);
      return;
    }
    if (cents > widget.balance) {
      toast(context, tx('Bakiyen yetersiz.'), error: true);
      return;
    }
    final coins = fmtNumber(_coinsFor(cents));
    final name = target == null ? '' : '${target['displayName'] ?? target['username'] ?? ''}';
    final ok = await confirm(
      context,
      widget.toOther
          ? tx('{a} Fasulye karşılığı {c} Coin, {n} adlı kullanıcıya gönderilsin mi? Bu işlem ANINDA yapılır ve GERİ ALINAMAZ.', {'a': beanText(cents), 'c': coins, 'n': name})
          : tx('{a} Fasulye, {c} Coin\'e çevrilsin mi? Coin hesabına hemen yüklenir; bu işlem geri alınamaz.', {'a': beanText(cents), 'c': coins}),
      action: widget.toOther ? tx('Gönder') : tx('Çevir'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    final r = await guard(
      context,
      () => Api.postOnce('/api/usd/coin-exchanges', {'amountCents': cents, if (target != null) 'targetUserId': target['id']}, key: _key),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) {
      toast(context, widget.toOther ? tx('{c} Coin gönderildi.', {'c': coins}) : tx('{c} Coin hesabına yüklendi.', {'c': coins}));
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cents = parseUsdCents(_amount.text) ?? 0;
    final target = _target;
    return Scaffold(
      appBar: AppBar(title: Text(widget.toOther ? tx('Coin gönder') : tx('Coin\'e çevir'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Row(children: [
          const BeanIcon(size: 18),
          const SizedBox(width: 6),
          Expanded(child: Text(tx('Bakiye: {a} Fasulye', {'a': beanText(widget.balance)}), style: const TextStyle(color: Pal.textDim))),
        ]),
        const SizedBox(height: 12),
        if (widget.toOther) ...[
          Container(
            decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(12), border: Border.all(color: target == null ? Pal.outline : Pal.gold)),
            child: ListTile(
              onTap: _busy ? null : _pickTarget,
              leading: target == null ? const Icon(Icons.person_search_outlined, color: Pal.gold) : UserAvatar(user: target, radius: 18),
              title: Text(target == null ? tx('Alıcıyı seç') : '${target['displayName'] ?? target['username'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(
                target == null ? tx('ID ya da kullanıcı adıyla ara') : 'ID: ${target['specialId'] ?? target['publicId'] ?? ''} · @${target['username'] ?? ''}',
                style: const TextStyle(color: Pal.textDim),
              ),
              trailing: const Icon(Icons.chevron_right, color: Pal.textDim),
            ),
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: tx('Tutar (Fasulye)'),
            border: const OutlineInputBorder(),
            suffixIcon: TextButton(
              onPressed: () => setState(() => _amount.text = beanText(widget.balance)),
              child: Text(tx('Tümü')),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Text(
          cents > 0 ? tx('Karşılığı: {c} Coin', {'c': fmtNumber(_coinsFor(cents))}) : tx('1 Fasulye = {c} Coin', {'c': fmtNumber(widget.coinsPerUsd)}),
          style: TextStyle(color: cents > 0 ? Pal.gold : Pal.textDim, fontSize: 13, fontWeight: cents > 0 ? FontWeight.w800 : FontWeight.w400),
        ),
        const SizedBox(height: 10),
        Text(
          widget.toOther
              ? tx('Coin, seçtiğin kullanıcının hesabına anında yüklenir. İşlem geri alınamaz.')
              : tx('Coin kendi hesabına anında yüklenir. İşlem geri alınamaz.'),
          style: const TextStyle(color: Pal.textDim, fontSize: 12),
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: _busy ? null : _send, child: Text(widget.toOther ? tx('Gönder') : tx('Çevir'))),
      ]),
    );
  }
}

/// Admin'e gönderim formu: tutar, ödeme yöntemi ve ödeme bilgisi.
class _UsdAdminForm extends StatefulWidget {
  final int balance;
  final int min;
  const _UsdAdminForm({required this.balance, required this.min});

  @override
  State<_UsdAdminForm> createState() => _UsdAdminFormState();
}

class _UsdAdminFormState extends State<_UsdAdminForm> {
  final _amount = TextEditingController();
  final _account = TextEditingController();
  String _method = 'Banka (IBAN)';
  bool _busy = false;
  final String _key = Api.newIdempotencyKey();

  @override
  void dispose() {
    _amount.dispose();
    _account.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final cents = parseUsdCents(_amount.text);
    if (cents == null || cents < widget.min) {
      toast(context, tx('En az {a} gönderebilirsin.', {'a': usdText(widget.min)}), error: true);
      return;
    }
    if (cents > widget.balance) {
      toast(context, tx('Bakiyen yetersiz.'), error: true);
      return;
    }
    if (_account.text.trim().length < 4) {
      toast(context, tx('Ödeme bilgisini yaz.'), error: true);
      return;
    }
    if (!await confirm(context, tx('{a} admine gönderilsin mi? Tutar bakiyenden hemen düşer; ödeme yapılınca "Ödendi" olur.', {'a': usdText(cents)}), action: tx('Gönder'))) return;
    if (!mounted) return;
    setState(() => _busy = true);
    final r = await guard(
      context,
      () => Api.postOnce('/api/usd/withdrawals', {'amountCents': cents, 'method': _method, 'account': _account.text.trim()}, key: _key),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) {
      toast(context, tx('Talebin alındı.'));
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(tx('Admine gönder'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(tx('Bakiye: {a}', {'a': usdText(widget.balance)}), style: const TextStyle(color: Pal.textDim)),
        const SizedBox(height: 12),
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
          decoration: InputDecoration(labelText: tx('Tutar (dolar)'), border: const OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _method,
          decoration: InputDecoration(labelText: tx('Ödeme yöntemi'), border: const OutlineInputBorder()),
          items: [
            for (final m in const ['Banka (IBAN)', 'Papara', 'USDT (TRC20)', 'Western Union'])
              DropdownMenuItem(value: m, child: Text(m)),
            DropdownMenuItem(value: 'Diğer', child: Text(tx('Diğer'))),
          ],
          onChanged: (v) => setState(() => _method = v ?? _method),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _account,
          maxLength: 300,
          maxLines: 3,
          decoration: InputDecoration(
            labelText: tx('Ödeme bilgisi'),
            hintText: tx('Ad soyad ve IBAN ya da cüzdan adresi'),
            border: const OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 8),
        Text(tx('Ödeme bilgin yalnızca yönetime görünür. Talep sonuçlanana kadar vazgeçebilirsin.'), style: const TextStyle(color: Pal.textDim, fontSize: 12)),
        const SizedBox(height: 16),
        FilledButton(onPressed: _busy ? null : _send, child: Text(tx('Gönder'))),
      ]),
    );
  }
}

/// Bayiye gönderim formu: bayi seçilir, tutar girilir. Anında işlenir ve geri alınamaz.
class _UsdDealerForm extends StatefulWidget {
  final int balance;
  final int min;
  final int coinsPerUsd;
  const _UsdDealerForm({required this.balance, required this.min, required this.coinsPerUsd});

  @override
  State<_UsdDealerForm> createState() => _UsdDealerFormState();
}

class _UsdDealerFormState extends State<_UsdDealerForm> {
  final _amount = TextEditingController();
  final _search = TextEditingController();
  List<Map<String, dynamic>> _dealers = const [];
  Map<String, dynamic>? _picked;
  bool _loading = true;
  bool _busy = false;
  final String _key = Api.newIdempotencyKey();

  @override
  void initState() {
    super.initState();
    _loadDealers();
  }

  @override
  void dispose() {
    _amount.dispose();
    _search.dispose();
    super.dispose();
  }

  Future<void> _loadDealers() async {
    try {
      final r = await Api.get('/api/usd/dealers');
      if (!mounted) return;
      setState(() {
        _dealers = listOf(r['dealers']);
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      toast(context, errorText(e), error: true);
    }
  }

  Future<void> _send() async {
    final dealer = _picked;
    if (dealer == null) {
      toast(context, tx('Önce bir bayi seç.'), error: true);
      return;
    }
    final cents = parseUsdCents(_amount.text);
    if (cents == null || cents < widget.min) {
      toast(context, tx('En az {a} gönderebilirsin.', {'a': usdText(widget.min)}), error: true);
      return;
    }
    if (cents > widget.balance) {
      toast(context, tx('Bakiyen yetersiz.'), error: true);
      return;
    }
    final ok = await confirm(
      context,
      tx('{a}, {n} adlı bayiye gönderilsin mi? Bu işlem ANINDA yapılır ve GERİ ALINAMAZ. Paranı bayiden kendin alırsın.', {'a': usdText(cents), 'n': '${dealer['name']}'}),
      action: tx('Gönder'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.postOnce('/api/usd/dealer-transfers', {'dealerId': dealer['id'], 'amountCents': cents}, key: _key));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) {
      toast(context, tx('Gönderildi.'));
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final q = _search.text.trim().toLowerCase();
    final shown = [
      for (final d in _dealers)
        if (q.isEmpty || '${d['name']}'.toLowerCase().contains(q) || '${d['username']}'.toLowerCase().contains(q)) d,
    ];
    final cents = parseUsdCents(_amount.text) ?? 0;
    return Scaffold(
      appBar: AppBar(title: Text(tx('Bayiye gönder'))),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(tx('Bakiye: {a}', {'a': usdText(widget.balance)}), style: const TextStyle(color: Pal.textDim)),
        const SizedBox(height: 12),
        TextField(
          controller: _amount,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))],
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: tx('Tutar (dolar)'), border: const OutlineInputBorder()),
        ),
        if (cents > 0)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(
              tx('Bayinin stokuna geçecek: {c} Coin', {'c': '${(cents * widget.coinsPerUsd) ~/ 100}'}),
              style: const TextStyle(color: Pal.textDim, fontSize: 12),
            ),
          ),
        const SizedBox(height: 14),
        TextField(
          controller: _search,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(prefixIcon: const Icon(Icons.search), hintText: tx('Bayi ara'), border: const OutlineInputBorder()),
        ),
        const SizedBox(height: 8),
        if (_loading) const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator())),
        if (!_loading && shown.isEmpty) Padding(padding: const EdgeInsets.all(20), child: Center(child: Text(tx('Bayi bulunamadı.'), style: const TextStyle(color: Pal.textDim)))),
        for (final d in shown)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            decoration: BoxDecoration(
              color: Pal.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: _picked?['id'] == d['id'] ? Pal.gold : Pal.outline, width: _picked?['id'] == d['id'] ? 2 : 1),
            ),
            child: ListTile(
              onTap: () => setState(() => _picked = d),
              leading: const Icon(Icons.storefront_outlined, color: Pal.gold),
              title: Text('${d['name']}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('@${d['username']}', style: const TextStyle(color: Pal.textDim)),
              trailing: _picked?['id'] == d['id'] ? const Icon(Icons.check_circle, color: Pal.gold) : null,
            ),
          ),
        const SizedBox(height: 8),
        Text(tx('Gönderim anında yapılır ve geri alınamaz. Bayiyle önceden anlaş.'), style: const TextStyle(color: Pal.textDim, fontSize: 12)),
        const SizedBox(height: 14),
        FilledButton(onPressed: _busy ? null : _send, child: Text(tx('Gönder'))),
      ]),
    );
  }
}

/// Yönetim: dolar çekim talepleri (öde / reddet), toplamlar ve cüzdan ayarları. Yalnızca tam yetkili admin.
class AdminUsdScreen extends StatefulWidget {
  const AdminUsdScreen({super.key});

  @override
  State<AdminUsdScreen> createState() => _AdminUsdScreenState();
}

class _AdminUsdScreenState extends State<AdminUsdScreen> {
  Map<String, dynamic>? _data;
  String _status = 'pending';
  String? _error;
  bool _busy = false;
  final _minW = TextEditingController();
  final _minD = TextEditingController();
  final _rate = TextEditingController();
  final _xRate = TextEditingController();
  final _minX = TextEditingController();
  bool _enabled = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _minW.dispose();
    _minD.dispose();
    _rate.dispose();
    _xRate.dispose();
    _minX.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await Api.get('/api/admin/usd', query: {'status': _status});
      if (!mounted) return;
      final s = mapOf(r['settings']) ?? const <String, dynamic>{};
      setState(() {
        _data = r;
        _error = null;
        _enabled = s['enabled'] != false;
        _minW.text = usdText(s['withdrawMinCents']).replaceAll(' \$', '');
        _minD.text = usdText(s['dealerMinCents']).replaceAll(' \$', '');
        _rate.text = '${s['coinsPerUsd'] ?? ''}';
        _xRate.text = '${s['exchangeCoinsPerUsd'] ?? ''}';
        _minX.text = usdText(s['exchangeMinCents']).replaceAll(' \$', '');
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(e));
    }
  }

  Future<void> _saveSettings() async {
    final w = parseUsdCents(_minW.text);
    final d = parseUsdCents(_minD.text);
    final rate = int.tryParse(_rate.text.trim());
    final xRate = int.tryParse(_xRate.text.trim());
    final minX = parseUsdCents(_minX.text);
    if (w == null || d == null || rate == null || rate < 1 || xRate == null || xRate < 1 || minX == null || minX < 1) {
      toast(context, 'Ayarları kontrol et.', error: true);
      return;
    }
    setState(() => _busy = true);
    final r = await guard(
      context,
      () => Api.put('/api/admin/app-config', {
        'usdEnabled': _enabled, 'usdWithdrawMinCents': w, 'usdDealerMinCents': d, 'usdDealerCoinsPerUsd': rate,
        'usdCoinsPerUsd': xRate, 'usdExchangeMinCents': minX,
      }),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) toast(context, 'Kaydedildi.');
  }

  Future<void> _decide(Map<String, dynamic> w, bool pay) async {
    if (_busy) return;
    final c = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(pay ? 'Ödendi olarak işaretle' : 'Talebi reddet'),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('@${w['username']} · ${usdText(w['amountCents'])}'),
          const SizedBox(height: 4),
          Text(pay ? 'Parayı gönderdikten sonra onayla. Geri alınamaz.' : 'Tutar kullanıcının cüzdanına geri döner.', style: const TextStyle(color: Pal.textDim, fontSize: 12)),
          const SizedBox(height: 10),
          TextField(controller: c, maxLength: 300, decoration: InputDecoration(labelText: pay ? 'Not (isteğe bağlı)' : 'Ret nedeni (zorunlu)', border: const OutlineInputBorder())),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Vazgeç')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(pay ? 'Ödendi' : 'Reddet')),
        ],
      ),
    );
    final note = c.text.trim();
    c.dispose();
    if (ok != true || !mounted) return;
    if (!pay && note.length < 2) {
      toast(context, 'Ret nedeni yaz.', error: true);
      return;
    }
    setState(() => _busy = true);
    final r = await guard(context, () => Api.postOnce('/api/admin/usd/withdrawals/${w['id']}/${pay ? 'pay' : 'reject'}', {'note': note}));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final t = mapOf(d?['totals']) ?? const <String, dynamic>{};
    return Scaffold(
      appBar: AppBar(title: const Text('Fasulye cüzdanı yönetimi')),
      body: d == null
          ? Center(child: _error == null ? const CircularProgressIndicator() : Text(_error ?? ''))
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(padding: const EdgeInsets.all(14), children: [
                Text('Cüzdanlarda duran toplam: ${usdText(t['walletCents'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
                Text('Bekleyen talepler: ${t['pendingCount'] ?? 0} adet · ${usdText(t['pendingCents'])}'),
                Text('Bugüne kadar ödenen: ${usdText(t['paidCents'])}'),
                Text('Bayilere giden: ${usdText(t['dealerCents'])} → ${fmtNumber(t['dealerCoins'] ?? 0)} Coin'),
                Text('Coin\'e çevrilen: ${beanText(t['exchangeCents'])} Fasulye → ${fmtNumber(t['exchangeCoins'] ?? 0)} Coin'),
                const Text('1 Fasulye = 1 dolar. Tutarlar dolar olarak gösterilir.', style: TextStyle(color: Pal.textDim, fontSize: 12)),
                const Divider(height: 24),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Fasulye işlemleri açık'),
                  subtitle: const Text('Kapalıyken Coin\'e çevirme, admine ve bayiye gönderim yapılamaz; bakiyeler görünür.'),
                  value: _enabled,
                  onChanged: (v) => setState(() => _enabled = v),
                ),
                Row(children: [
                  Expanded(child: TextField(controller: _minW, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Admine alt sınır (\$)'))),
                  const SizedBox(width: 10),
                  Expanded(child: TextField(controller: _minD, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Bayiye alt sınır (\$)'))),
                ]),
                TextField(controller: _rate, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Bayiye gönderimde 1 dolar = kaç Coin')),
                Row(children: [
                  Expanded(child: TextField(controller: _xRate, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Coin\'e çevirmede 1 Fasulye = kaç Coin'))),
                  const SizedBox(width: 10),
                  Expanded(child: TextField(controller: _minX, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: 'Çevirmede alt sınır (Fasulye)'))),
                ]),
                const SizedBox(height: 8),
                OutlinedButton(onPressed: _busy ? null : _saveSettings, child: const Text('Ayarları kaydet')),
                const Divider(height: 24),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'pending', label: Text('Bekleyen')),
                    ButtonSegment(value: 'paid', label: Text('Ödenen')),
                    ButtonSegment(value: 'rejected', label: Text('Reddedilen')),
                  ],
                  selected: {_status},
                  onSelectionChanged: (s) {
                    setState(() => _status = s.first);
                    _load();
                  },
                ),
                const SizedBox(height: 10),
                if (listOf(d['withdrawals']).isEmpty) const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Kayıt yok.'))),
                for (final w in listOf(d['withdrawals']))
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('@${w['username']} · ${usdText(w['amountCents'])}', style: const TextStyle(fontWeight: FontWeight.w800)),
                        Text('${w['method']} · ${_dateText(w['createdAt'])}', style: const TextStyle(color: Pal.textDim, fontSize: 12)),
                        const SizedBox(height: 4),
                        SelectableText('${w['account']}'),
                        if ('${w['adminNote'] ?? ''}'.isNotEmpty) Text('Not: ${w['adminNote']}', style: const TextStyle(color: Pal.textDim, fontSize: 12)),
                        if (w['status'] == 'pending')
                          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                            TextButton(onPressed: _busy ? null : () => _decide(w, false), child: const Text('Reddet')),
                            const SizedBox(width: 6),
                            FilledButton(onPressed: _busy ? null : () => _decide(w, true), child: const Text('Ödendi')),
                          ]),
                      ]),
                    ),
                  ),
              ]),
            ),
    );
  }
}
