import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/session.dart';
import 'app_theme.dart';
import 'common.dart';
import 'net_image.dart';

/// Uygulama açılışında: günlük giriş açıksa ve bugün henüz yapılmadıysa pencereyi gösterir.
Future<void> maybeShowCheckin(BuildContext context) async {
  try {
    final s = await Api.get('/api/checkin');
    if (!context.mounted || s['enabled'] == false || s['signedToday'] == true) return;
    await showCheckinDialog(context, initial: s);
  } catch (_) {/* sessizce geç: açılışı bozmasın */}
}

/// Günlük giriş penceresi (7 gün). [initial] verilirse yeniden yüklemeden açılır.
Future<void> showCheckinDialog(BuildContext context, {Map<String, dynamic>? initial}) {
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Kapat',
    barrierColor: const Color(0xB3000000),
    transitionDuration: const Duration(milliseconds: 220),
    pageBuilder: (_, __, ___) => _CheckinDialog(initial: initial),
    transitionBuilder: (_, a, __, child) => ScaleTransition(
      scale: CurvedAnimation(parent: a, curve: Curves.easeOutBack),
      child: FadeTransition(opacity: a, child: child),
    ),
  );
}

class _CheckinDialog extends StatefulWidget {
  final Map<String, dynamic>? initial;
  const _CheckinDialog({this.initial});

  @override
  State<_CheckinDialog> createState() => _CheckinDialogState();
}

class _CheckinDialogState extends State<_CheckinDialog> {
  Map<String, dynamic>? _s;
  Object? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _s = widget.initial;
    if (_s == null) _load();
  }

  Future<void> _load() async {
    try {
      final s = await Api.get('/api/checkin');
      if (mounted) setState(() => _s = s);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _claim() async {
    if (_busy) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.post('/api/checkin', {}));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (r != null && r['state'] is Map) _s = Map<String, dynamic>.from(r['state'] as Map);
    });
    if (r == null) return;
    Session.refresh();
    final items = (r['items'] as List? ?? const []).whereType<Map>().map((m) => (m['name'] ?? '').toString()).where((x) => x.isNotEmpty).toList();
    final coins = int.tryParse('${r['coins'] ?? 0}') ?? 0;
    final parts = [if (coins > 0) '${fmtNumber(coins)} Coin', ...items];
    toast(context, parts.isEmpty ? 'Giriş yapıldı!' : '🎉 ${parts.join(' + ')} hesabına eklendi!');
  }

  @override
  Widget build(BuildContext context) {
    final w = MediaQuery.sizeOf(context).width;
    final cardW = (w - 40).clamp(280.0, 420.0).toDouble();
    return Center(
      child: Material(
        type: MaterialType.transparency,
        child: SizedBox(
          width: cardW,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
              // Kart
              Container(
                margin: const EdgeInsets.only(top: 34),
                padding: const EdgeInsets.fromLTRB(14, 52, 14, 18),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF2A2012), Pal.surface, Pal.bg]),
                  border: Border.all(color: Pal.outline, width: 1.5),
                  boxShadow: const [BoxShadow(color: Color(0x66F2B92A), blurRadius: 30, spreadRadius: -6)],
                ),
                child: _body(),
              ),
              // Şerit başlık
              Positioned(top: 0, left: 10, right: 10, child: _ribbon()),
            ]),
            const SizedBox(height: 18),
            // Kapat
            GestureDetector(
              onTap: () => Navigator.of(context).maybePop(),
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white70, width: 2)),
                child: const Icon(Icons.close, color: Colors.white, size: 26),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _ribbon() {
    return SizedBox(
      height: 70,
      child: Stack(alignment: Alignment.center, children: [
        // Şeridin kıvrık uçları
        Positioned(left: 0, bottom: 2, child: _ribbonTail(left: true)),
        Positioned(right: 0, bottom: 2, child: _ribbonTail(left: false)),
        Container(
          height: 58,
          margin: const EdgeInsets.symmetric(horizontal: 22),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            gradient: const LinearGradient(colors: kGoldLight, begin: Alignment.topCenter, end: Alignment.bottomCenter),
            boxShadow: const [BoxShadow(color: Color(0x88000000), blurRadius: 10, offset: Offset(0, 4))],
          ),
          child: const Text('Günlük Giriş', style: TextStyle(color: Pal.onBright, fontSize: 26, fontWeight: FontWeight.w900, letterSpacing: 0.5)),
        ),
        const Positioned(left: 4, top: 0, child: Text('🎁', style: TextStyle(fontSize: 30))),
        const Positioned(right: 4, top: 0, child: Text('🎁', style: TextStyle(fontSize: 30))),
      ]),
    );
  }

  Widget _ribbonTail({required bool left}) => Transform(
        alignment: Alignment.center,
        transform: Matrix4.identity()..scale(left ? 1.0 : -1.0, 1.0),
        child: Container(
          width: 40,
          height: 40,
          decoration: const BoxDecoration(
            gradient: LinearGradient(colors: kGoldDeep, begin: Alignment.topLeft, end: Alignment.bottomRight),
            borderRadius: BorderRadius.only(topLeft: Radius.circular(10), bottomLeft: Radius.circular(20)),
          ),
        ),
      );

  Widget _body() {
    if (_error != null && _s == null) {
      return SizedBox(height: 180, child: Center(child: Text(errorText(_error!), textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim))));
    }
    if (_s == null) return const SizedBox(height: 260, child: Center(child: CircularProgressIndicator(color: Pal.cyan)));
    final s = _s!;
    final signed = (s['signedDays'] as num?)?.toInt() ?? 0;
    final today = s['signedToday'] == true;
    final days = [for (final d in (s['days'] as List? ?? const [])) if (d is Map) Map<String, dynamic>.from(d)];
    if (days.length < 7) return const SizedBox(height: 120);
    // Bugün alınacak gün (henüz alınmadıysa): bir sonraki gün parlak çerçeveli.
    final nextDay = today ? -1 : signed + 1;
    Widget day(int i) => _dayCard(days[i], signed: i + 1 <= signed, next: i + 1 == nextDay);
    return Column(mainAxisSize: MainAxisSize.min, children: [
      Text.rich(
        TextSpan(children: [
          const TextSpan(text: 'Bu seri '),
          TextSpan(text: '$signed', style: const TextStyle(color: Pal.gold, fontWeight: FontWeight.w900)),
          const TextSpan(text: ' gün giriş yaptın'),
        ]),
        style: const TextStyle(color: Pal.text, fontSize: 17, fontWeight: FontWeight.w600),
      ),
      const SizedBox(height: 14),
      // Kartlar sabit yükseklikte (içlerindeki esnek alan sınırsız yükseklikte çalışmaz).
      SizedBox(
        height: 116,
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = 0; i < 4; i++) Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: day(i))),
        ]),
      ),
      const SizedBox(height: 10),
      SizedBox(
        height: 128,
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: day(4))),
          Expanded(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: day(5))),
          Expanded(flex: 2, child: Padding(padding: const EdgeInsets.symmetric(horizontal: 4), child: day(6))),
        ]),
      ),
      const SizedBox(height: 20),
      _button(today),
      if (today) ...[
        const SizedBox(height: 8),
        const Text('Bugünün ödülünü aldın. Yarın tekrar gel!', style: TextStyle(color: Pal.textDim, fontSize: 12)),
      ],
    ]);
  }

  Widget _coin(double size) => Image.asset('assets/images/lucky_coin.png', width: size, height: size);

  Widget _dayCard(Map<String, dynamic> d, {required bool signed, required bool next}) {
    final n = (d['day'] as num?)?.toInt() ?? 0;
    final coins = int.tryParse('${d['coins'] ?? 0}') ?? 0;
    final items = [for (final it in (d['items'] as List? ?? const [])) if (it is Map) Map<String, dynamic>.from(it)];
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final top = items.isEmpty
        ? Column(mainAxisSize: MainAxisSize.min, children: [
            _coin(38),
            const SizedBox(height: 6),
            Text('${fmtNumber(coins)} Coin', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.text, fontSize: 13, fontWeight: FontWeight.w800)),
          ])
        : Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
            for (final it in items.take(2))
              Expanded(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  SizedBox(
                    width: 52,
                    height: 52,
                    child: Api.absoluteUrl(it['imageUrl']?.toString()) == null
                        ? const Icon(Icons.card_giftcard, color: Pal.gold, size: 36)
                        : Image(image: NetImage(Api.absoluteUrl(it['imageUrl']?.toString())!, targetW: NetImage.px(52, dpr), targetH: NetImage.px(52, dpr)), fit: BoxFit.contain),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${it['category'] == 'vehicle' ? 'Araç' : 'Çerçeve'}/${it['days'] ?? 7} gün',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Pal.text, fontSize: 11, fontWeight: FontWeight.w800),
                  ),
                ]),
              ),
            if (coins > 0)
              Expanded(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  _coin(40),
                  const SizedBox(height: 4),
                  Text('${fmtNumber(coins)} Coin', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.text, fontSize: 11, fontWeight: FontWeight.w800)),
                ]),
              ),
          ]);
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: signed ? Pal.cyan.withValues(alpha: 0.18) : Pal.surfaceHi,
        border: Border.all(color: signed || next ? Pal.cyan : Pal.outline, width: next ? 2.2 : 1.4),
        boxShadow: next ? const [BoxShadow(color: Color(0x66F2B92A), blurRadius: 12)] : null,
      ),
      child: Column(children: [
        Expanded(
          child: Container(
            margin: const EdgeInsets.all(4),
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
            alignment: Alignment.center,
            decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(11)),
            child: Opacity(opacity: signed ? 0.75 : 1, child: top),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 6, top: 2),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            if (signed) const Icon(Icons.check_circle, size: 15, color: Pal.cyan),
            if (signed) const SizedBox(width: 3),
            Text('$n. gün', style: TextStyle(color: signed ? Pal.cyan : Pal.textDim, fontSize: 13, fontWeight: FontWeight.w800)),
          ]),
        ),
      ]),
    );
  }

  Widget _button(bool done) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(28),
          gradient: done ? null : const LinearGradient(colors: kGoldLight, begin: Alignment.topCenter, end: Alignment.bottomCenter),
          color: done ? Pal.surfaceHi : null,
          boxShadow: done ? null : const [BoxShadow(color: Color(0x66F2B92A), blurRadius: 14, offset: Offset(0, 5))],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(28),
            onTap: done || _busy ? null : _claim,
            child: Center(
              child: _busy
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.6, color: Pal.onBright))
                  : Text(done ? 'Alındı ✓' : 'Giriş yap', style: TextStyle(color: done ? Pal.textDim : Pal.onBright, fontSize: 18, fontWeight: FontWeight.w900)),
            ),
          ),
        ),
      ),
    );
  }
}
