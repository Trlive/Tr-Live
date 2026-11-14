import 'package:flutter/material.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import '../services/session.dart';
import 'app_theme.dart';
import 'common.dart';
import 'image_pick.dart';
import 'net_image.dart';
import 'room_theme.dart';

/// Oda teması penceresi (alt %62), uygulamanın koyu altın renkleriyle:
///  * "Müsait": önce satın alınanlar ve özel tema (altlarında "Kullan" düğmesi), sonra Coin'siz temalar (dokununca uygulanır).
///  * "Mağaza": Coin'li, süreli temalar. Satın alınmışsa "Kullan" + "Uzat", değilse "Satın al".
/// [onApply] temayı odaya uygular; başarılıysa true döner. Oda sesi ve bağlantısı etkilenmez.
Future<void> showRoomThemeSheet(BuildContext context, {required String roomId, required String current, String? currentImage, required Future<bool> Function(String key) onApply}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Pal.bg,
    barrierColor: Colors.black45,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    clipBehavior: Clip.antiAlias,
    builder: (c) => SizedBox(height: MediaQuery.sizeOf(c).height * 0.62, child: _ThemeSheet(roomId: roomId, current: current, currentImage: currentImage, onApply: onApply)),
  );
}

class _ThemeSheet extends StatefulWidget {
  final String roomId;
  final String current;
  /// Odanın tema görseli (özel temalardan hangisinin kullanıldığını belirler).
  final String? currentImage;
  final Future<bool> Function(String key) onApply;
  const _ThemeSheet({required this.roomId, required this.current, this.currentImage, required this.onApply});

  @override
  State<_ThemeSheet> createState() => _ThemeSheetState();
}

class _ThemeSheetState extends State<_ThemeSheet> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);
  late String _current = widget.current;

  /// Özel temada seçim anahtarı görselden bulunur ("custom:<id>"); temalar yüklenince yeniden hesaplanır.
  void _resolveCurrent() {
    if (_current == kCustomThemeKey) _current = RoomThemes.selectedKey(_current, widget.currentImage);
  }
  bool _loading = true;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _resolveCurrent();
    _reload();
  }

  Future<void> _reload() async {
    await RoomThemes.load(roomId: widget.roomId, force: true);
    if (mounted) {
      setState(() {
        _loading = false;
        _resolveCurrent();
      });
    }
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _apply(String key) async {
    if (key == _current || _busy != null) return;
    setState(() => _busy = key);
    final ok = await widget.onApply(key);
    if (!mounted) return;
    setState(() {
      _busy = null;
      if (ok) _current = key;
    });
  }

  Future<void> _buy(RoomThemeDef t) async {
    final again = t.owned;
    final ok = await confirm(
      context,
      again
          ? tx('"{name}" temasını {coins} Coin karşılığında {days} gün uzatmak istiyor musunuz?', {'name': t.label, 'coins': fmtNumber(t.priceCoins), 'days': t.durationDays})
          : tx('"{name}" temasını {coins} Coin karşılığında {days} gün kullanmak istiyor musunuz?', {'name': t.label, 'coins': fmtNumber(t.priceCoins), 'days': t.durationDays}),
      action: again ? tx('Uzat') : tx('Satın al'),
    );
    if (!ok || !mounted) return;
    setState(() => _busy = t.key);
    final r = await guard(context, () => Api.postOnce('/api/room-themes/${t.key}/buy', {}));
    if (!mounted) return;
    setState(() => _busy = null);
    if (r == null) return;
    Session.refresh();
    await _reload();
    if (!mounted) return;
    toast(context, again ? tx('"{name}" süresi uzatıldı.', {'name': t.label}) : tx('"{name}" hesabına eklendi. "Kullan" ile odana uygulayabilirsin.', {'name': t.label}));
  }

  Future<void> _uploadCustom(CustomTheme c) async {
    final picked = await pickImage(context, crop: CropSpec.roomTheme);
    if (picked == null || !mounted) return;
    setState(() => _busy = c.id);
    final r = await guard(context, () => Api.putBytes('/api/room-themes/custom/${c.id}/image', picked.bytes, picked.mime));
    if (!mounted) return;
    setState(() => _busy = null);
    if (r == null) return;
    toast(context, tx('Görselin incelemeye gönderildi. Onaylanınca {n} gün kullanabilirsin.', {'n': c.days}));
    await _reload();
  }

  void _preview(RoomThemeDef t) {
    Navigator.of(context).push(PageRouteBuilder(
      opaque: false,
      pageBuilder: (c, _, __) => _ThemePreview(
        theme: t,
        onBuy: t.free || !RoomThemes.self
            ? null
            : () {
                Navigator.pop(c);
                _buy(t);
              },
      ),
      transitionsBuilder: (_, a, __, child) => FadeTransition(opacity: a, child: child),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      const SizedBox(height: 8),
      Container(width: 38, height: 4, decoration: BoxDecoration(color: Pal.outline, borderRadius: BorderRadius.circular(2))),
      TabBar(
        controller: _tabs,
        dividerColor: Colors.transparent,
        labelColor: Pal.text,
        unselectedLabelColor: Pal.textDim,
        labelStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        unselectedLabelStyle: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        indicator: const UnderlineTabIndicator(borderSide: BorderSide(color: Pal.cyan, width: 4), borderRadius: BorderRadius.all(Radius.circular(4)), insets: EdgeInsets.symmetric(horizontal: 46)),
        tabs: [Tab(text: tx('Müsait')), Tab(text: tx('Mağaza'))],
      ),
      const SizedBox(height: 4),
      Expanded(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: Pal.cyan))
            : ValueListenableBuilder<int>(
                valueListenable: RoomThemes.version,
                builder: (_, __, ___) => TabBarView(controller: _tabs, children: [_available(), _store()]),
              ),
      ),
    ]);
  }

  // ---------------- ortak parçalar ----------------
  Widget _thumb(String? url, List<Color> colors) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final abs = Api.absoluteUrl(url);
    return DecoratedBox(
      decoration: BoxDecoration(gradient: LinearGradient(colors: colors.length < 2 ? const [Pal.surfaceHi, Pal.surface] : colors, begin: Alignment.topCenter, end: Alignment.bottomCenter)),
      child: abs == null ? const SizedBox.expand() : Image(image: NetImage(abs, targetW: NetImage.px(200, dpr), targetH: NetImage.px(356, dpr)), fit: BoxFit.cover, width: double.infinity, height: double.infinity),
    );
  }

  Widget _chip(IconData icon, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(color: const Color(0x99000000), borderRadius: BorderRadius.circular(10)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 13, color: Pal.gold),
          const SizedBox(width: 3),
          Text(text, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
        ]),
      );

  Widget _spinner() => const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: Pal.onBright));

  /// Altın "Kullan" düğmesi; tema zaten odadaysa "Kullanılıyor" (pasif).
  Widget _useButton(String key, {double height = 36}) {
    final inUse = _current == key;
    final busy = _busy == key;
    return SizedBox(
      height: height,
      width: double.infinity,
      child: Material(
        color: inUse ? Pal.surfaceHi : Pal.cyan,
        child: InkWell(
          onTap: inUse || _busy != null ? null : () => _apply(key),
          child: Center(
            child: busy
                ? _spinner()
                : Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(inUse ? Icons.check_circle : Icons.play_arrow_rounded, size: 17, color: inUse ? Pal.cyan : Pal.onBright),
                    const SizedBox(width: 4),
                    Text(inUse ? tx('Kullanılıyor') : tx('Kullan'), style: TextStyle(color: inUse ? Pal.cyan : Pal.onBright, fontSize: 14, fontWeight: FontWeight.w800)),
                  ]),
          ),
        ),
      ),
    );
  }

  Widget _selectedMark() => Positioned(
        left: 8,
        top: 8,
        child: Container(
          width: 30,
          height: 30,
          decoration: const BoxDecoration(color: Pal.cyan, shape: BoxShape.circle),
          child: const Icon(Icons.check_rounded, color: Pal.onBright, size: 22),
        ),
      );

  Widget _header(String text) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        child: Text(text, style: const TextStyle(color: Pal.textDim, fontSize: 13, fontWeight: FontWeight.w700)),
      );

  // ---------------- Müsait ----------------
  Widget _available() {
    final self = RoomThemes.self;
    final customs = self ? RoomThemes.custom.where((c) => c.status != 'expired').toList() : <CustomTheme>[];
    final owned = RoomThemes.all.where((t) => !t.free && t.owned).toList();
    final free = RoomThemes.all.where((t) => t.free).toList();
    final mine = <Widget>[
      for (final c in customs)
        if (c.active) _ownedTile(key: customKeyOf(c), image: c.imageUrl, label: tx('Özel tema'), days: c.daysLeft) else _customState(c),
      if (!self)
        for (final c in RoomThemes.activeCustoms) _ownedTile(key: customKeyOf(c), image: c.imageUrl, label: tx('Özel tema'), days: c.daysLeft),
      for (final t in owned) _ownedTile(key: t.key, image: t.thumbUrl, colors: t.colors, label: t.label, days: t.daysLeft, animated: t.animated),
    ];
    const grid = SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.62);
    return CustomScrollView(slivers: [
      if (mine.isNotEmpty) ...[
        SliverToBoxAdapter(child: _header(tx('Satın aldıklarım'))),
        SliverPadding(padding: const EdgeInsets.symmetric(horizontal: 14), sliver: SliverGrid(delegate: SliverChildListDelegate(mine), gridDelegate: grid)),
      ],
      SliverToBoxAdapter(child: _header(tx('Ücretsiz temalar'))),
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(14, 0, 14, 24),
        sliver: SliverGrid(
          delegate: SliverChildListDelegate([for (final t in free) _freeTile(t)]),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.72),
        ),
      ),
    ]);
  }

  /// Satın alınan / özel tema: görsel + kalan gün + altta "Kullan".
  Widget _ownedTile({required String key, String? image, List<Color> colors = const [], required String label, required int days, bool animated = false}) {
    final sel = _current == key;
    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Pal.cyan : Pal.outline, width: sel ? 2.5 : 1)),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(13),
        child: Column(children: [
          Expanded(
            child: GestureDetector(
              onTap: () => _apply(key),
              child: Stack(fit: StackFit.expand, children: [
                _thumb(image, colors),
                const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.center, end: Alignment.bottomCenter, colors: [Colors.transparent, Color(0xB3000000)]))),
                Positioned(right: 6, top: 6, child: _chip(Icons.schedule, tx('{n} gün', {'n': days}))),
                if (animated) const Positioned(right: 6, bottom: 24, child: Icon(Icons.auto_awesome, size: 16, color: Pal.gold)),
                Positioned(left: 8, right: 8, bottom: 6, child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700))),
                if (sel) _selectedMark(),
              ]),
            ),
          ),
          _useButton(key),
        ]),
      ),
    );
  }

  /// Coin'siz tema: dokununca uygulanır.
  Widget _freeTile(RoomThemeDef t) {
    final sel = _current == t.key;
    return GestureDetector(
      onTap: () => _apply(t.key),
      child: DecoratedBox(
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Pal.cyan : Pal.outline, width: sel ? 2.5 : 1)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(13),
          child: Stack(fit: StackFit.expand, children: [
            _thumb(t.thumbUrl, t.colors),
            const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.center, end: Alignment.bottomCenter, colors: [Colors.transparent, Color(0xB3000000)]))),
            Positioned(left: 8, right: 8, bottom: 6, child: Text(t.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700))),
            if (sel) _selectedMark(),
            if (_busy == t.key) const ColoredBox(color: Color(0x80000000), child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Pal.cyan)))),
          ]),
        ),
      ),
    );
  }

  Widget _customState(CustomTheme c) {
    final (icon, title, sub, canUpload) = switch (c.status) {
      'pending' => (Icons.hourglass_top_rounded, tx('İncelemede'), tx('Onay bekleniyor'), false),
      'rejected' => (Icons.refresh_rounded, tx('Reddedildi'), c.reviewNote?.isNotEmpty == true ? c.reviewNote! : tx('Yeni görsel yükle'), true),
      _ => (Icons.add_photo_alternate_outlined, tx('Özel tema'), tx('{n} gün · görsel yükle', {'n': c.days}), true),
    };
    return GestureDetector(
      onTap: canUpload && _busy == null ? () => _uploadCustom(c) : null,
      child: DecoratedBox(
        decoration: BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: Pal.outline)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(13),
          child: Stack(fit: StackFit.expand, children: [
            if (c.imageUrl != null) Opacity(opacity: 0.35, child: _thumb(c.imageUrl, const [])),
            Padding(
              padding: const EdgeInsets.all(8),
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(icon, color: Pal.cyan, size: 30),
                const SizedBox(height: 6),
                Text(title, style: const TextStyle(fontWeight: FontWeight.w800, color: Pal.text, fontSize: 13)),
                const SizedBox(height: 2),
                Text(sub, textAlign: TextAlign.center, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.textDim, fontSize: 11)),
              ]),
            ),
            if (_busy == c.id) const ColoredBox(color: Color(0x80000000), child: Center(child: CircularProgressIndicator(color: Pal.cyan))),
          ]),
        ),
      ),
    );
  }

  // ---------------- Mağaza ----------------
  Widget _store() {
    final list = RoomThemes.all.where((t) => !t.free).toList();
    if (list.isEmpty) return Center(child: Text(tx('Mağazada şu an tema yok.'), style: TextStyle(color: Pal.textDim)));
    return Column(children: [
      if (!RoomThemes.self)
        Padding(
          padding: EdgeInsets.fromLTRB(16, 4, 16, 6),
          child: Text(tx('Temalar oda sahibinin hesabına alınır. Satın almayı oda sahibi yapabilir; alınmış temaları kullanabilirsin.'), style: TextStyle(color: Pal.textDim, fontSize: 12)),
        ),
      Expanded(
        child: GridView.builder(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 14, crossAxisSpacing: 14, childAspectRatio: 0.62),
          itemCount: list.length,
          itemBuilder: (_, i) => _storeCard(list[i]),
        ),
      ),
    ]);
  }

  Widget _storeCard(RoomThemeDef t) {
    final busy = _busy == t.key;
    final canBuy = RoomThemes.self && _busy == null;
    final sel = _current == t.key;
    return DecoratedBox(
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? Pal.cyan : Pal.outline, width: sel ? 2.5 : 1)),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(13),
        child: Column(children: [
          Expanded(
            child: GestureDetector(
              onTap: () => _preview(t),
              child: Stack(fit: StackFit.expand, children: [
                _thumb(t.thumbUrl, t.colors),
                const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment(0, 0.2), end: Alignment.bottomCenter, colors: [Colors.transparent, Color(0xB3000000)]))),
                Positioned(left: 8, top: 8, child: _chip(Icons.schedule, t.owned ? tx('{n} gün kaldı', {'n': t.daysLeft}) : tx('{n} gün', {'n': t.durationDays}))),
                Positioned(
                  right: 4,
                  top: 2,
                  child: IconButton(
                    tooltip: tx('Önizle'),
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _preview(t),
                    icon: const Icon(Icons.remove_red_eye_outlined, color: Colors.white, size: 24),
                  ),
                ),
                if (t.animated) Positioned(right: 8, bottom: 32, child: _chip(Icons.auto_awesome, tx('Hareketli'))),
                Positioned(left: 10, right: 10, bottom: 8, child: Text(t.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 12))),
                Positioned(
                  left: 10,
                  bottom: 26,
                  child: Text('${fmtNumber(t.priceCoins)} Coin', style: const TextStyle(color: Pal.gold, fontSize: 16, fontWeight: FontWeight.w800, shadows: [Shadow(blurRadius: 4)])),
                ),
                if (sel) _selectedMark(),
              ]),
            ),
          ),
          if (t.owned)
            // Satın alınmış: Kullan + Uzat
            Row(children: [
              Expanded(child: _useButton(t.key, height: 44)),
              SizedBox(
                width: 64,
                height: 44,
                child: Material(
                  color: Pal.surfaceHi,
                  child: InkWell(
                    onTap: canBuy ? () => _buy(t) : null,
                    child: Center(child: Text(tx('Uzat'), style: TextStyle(color: canBuy ? Pal.text : Pal.textDim, fontSize: 13, fontWeight: FontWeight.w700))),
                  ),
                ),
              ),
            ])
          else
            SizedBox(
              width: double.infinity,
              height: 44,
              child: Material(
                color: RoomThemes.self ? Pal.cyan : Pal.surfaceHi,
                child: InkWell(
                  onTap: canBuy ? () => _buy(t) : null,
                  child: Center(
                    child: busy
                        ? _spinner()
                        : Text(tx('Satın al'), style: TextStyle(color: RoomThemes.self ? Pal.onBright : Pal.textDim, fontSize: 16, fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
            ),
        ]),
      ),
    );
  }
}

/// Tam ekran önizleme: temanın kendisi (hareket efekti dahil) + odadaki gibi koltuk taslakları.
class _ThemePreview extends StatelessWidget {
  final RoomThemeDef theme;
  final VoidCallback? onBuy;
  const _ThemePreview({required this.theme, this.onBuy});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Pal.bg,
      body: Stack(fit: StackFit.expand, children: [
        ThemeArt(theme: theme, dim: true),
        SafeArea(
          child: Column(children: [
            Row(children: [
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close, color: Colors.white, size: 28)),
              Expanded(child: Text(theme.label, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800))),
              const SizedBox(width: 48),
            ]),
            const Spacer(flex: 2),
            for (var row = 0; row < 2; row++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 14),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
                  for (var i = 0; i < 4; i++)
                    Container(
                      width: 58,
                      height: 58,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.10), border: Border.all(color: Colors.white24)),
                      child: const Icon(Icons.add, color: Colors.white54),
                    ),
                ]),
              ),
            const Spacer(flex: 3),
            if (onBuy != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: Pal.cyan, foregroundColor: Pal.onBright, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                    onPressed: onBuy,
                    child: Text('${theme.owned ? tx('Süreyi uzat') : tx('Satın al')} · ${fmtNumber(theme.priceCoins)} Coin · ${tx('{n} gün', {'n': theme.durationDays})}', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
          ]),
        ),
      ]),
    );
  }
}
