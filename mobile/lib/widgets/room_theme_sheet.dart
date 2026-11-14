import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/session.dart';
import 'common.dart';
import 'image_pick.dart';
import 'net_image.dart';
import 'room_theme.dart';

const _green = Color(0xFF00C853);
const _ink = Color(0xFF1F2430);
const _muted = Color(0xFF9AA3B2);

/// Oda teması penceresi (alt %62): "Müsait" (kullanılabilenler; dokununca uygulanır) ve "Mağaza" (Coin'li, süreli).
/// [onApply] temayı odaya uygular; başarılıysa true döner. Oda sesi ve bağlantısı etkilenmez.
Future<void> showRoomThemeSheet(BuildContext context, {required String roomId, required String current, required Future<bool> Function(String key) onApply}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    barrierColor: Colors.black38,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (c) => SizedBox(height: MediaQuery.sizeOf(c).height * 0.62, child: _ThemeSheet(roomId: roomId, current: current, onApply: onApply)),
  );
}

class _ThemeSheet extends StatefulWidget {
  final String roomId;
  final String current;
  final Future<bool> Function(String key) onApply;
  const _ThemeSheet({required this.roomId, required this.current, required this.onApply});

  @override
  State<_ThemeSheet> createState() => _ThemeSheetState();
}

class _ThemeSheetState extends State<_ThemeSheet> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);
  late String _current = widget.current;
  bool _loading = true;
  String? _busy;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    await RoomThemes.load(roomId: widget.roomId, force: true);
    if (mounted) setState(() => _loading = false);
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
      '"${t.label}" temasını ${fmtNumber(t.priceCoins)} Coin karşılığında ${again ? '${t.durationDays} gün uzatmak' : '${t.durationDays} gün kullanmak'} istiyor musunuz?',
      action: again ? 'Uzat' : 'Satın al',
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
    toast(context, '"${t.label}" hesabına eklendi. Müsait bölümünden uygulayabilirsin.');
    if (!again) _tabs.animateTo(0);
  }

  Future<void> _uploadCustom(CustomTheme c) async {
    final picked = await pickImage(context, crop: CropSpec.roomTheme);
    if (picked == null || !mounted) return;
    setState(() => _busy = c.id);
    final r = await guard(context, () => Api.putBytes('/api/room-themes/custom/${c.id}/image', picked.bytes, picked.mime));
    if (!mounted) return;
    setState(() => _busy = null);
    if (r == null) return;
    toast(context, 'Görselin incelemeye gönderildi. Onaylanınca ${c.days} gün kullanabilirsin.');
    await _reload();
  }

  void _preview(RoomThemeDef t) {
    Navigator.of(context).push(PageRouteBuilder(
      opaque: false,
      pageBuilder: (c, _, __) => _ThemePreview(theme: t, onBuy: t.free || !RoomThemes.self ? null : () { Navigator.pop(c); _buy(t); }),
      transitionsBuilder: (_, a, __, child) => FadeTransition(opacity: a, child: child),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: ThemeData.light(useMaterial3: true).copyWith(colorScheme: ColorScheme.fromSeed(seedColor: _green)),
      child: Column(children: [
        const SizedBox(height: 6),
        TabBar(
          controller: _tabs,
          dividerColor: Colors.transparent,
          labelColor: _ink,
          unselectedLabelColor: _muted,
          labelStyle: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600),
          unselectedLabelStyle: const TextStyle(fontSize: 19, fontWeight: FontWeight.w500),
          indicator: const UnderlineTabIndicator(borderSide: BorderSide(color: _green, width: 4), borderRadius: BorderRadius.all(Radius.circular(4)), insets: EdgeInsets.symmetric(horizontal: 46)),
          tabs: const [Tab(text: 'Müsait'), Tab(text: 'Mağaza')],
        ),
        const SizedBox(height: 6),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: _green))
              : ValueListenableBuilder<int>(
                  valueListenable: RoomThemes.version,
                  builder: (_, __, ___) => TabBarView(controller: _tabs, children: [_available(), _store()]),
                ),
        ),
      ]),
    );
  }

  // ---------------- Müsait ----------------
  Widget _available() {
    final owned = RoomThemes.all.where((t) => t.usable).toList()
      ..sort((a, b) => (a.free ? 1 : 0).compareTo(b.free ? 1 : 0)); // önce satın alınanlar
    final customs = RoomThemes.self ? RoomThemes.custom.where((c) => c.status != 'expired').toList() : <CustomTheme>[];
    final active = RoomThemes.activeCustom;
    final tiles = <Widget>[
      for (final c in customs)
        if (c.active)
          _tile(key: kCustomThemeKey, image: c.imageUrl, label: 'Özel tema', badge: '${c.daysLeft} gün')
        else
          _customState(c),
      if (!RoomThemes.self && active != null) _tile(key: kCustomThemeKey, image: active.imageUrl, label: 'Özel tema', badge: '${active.daysLeft} gün'),
      for (final t in owned) _tile(key: t.key, image: t.thumbUrl, colors: t.colors, label: t.label, badge: t.free ? null : '${t.daysLeft} gün', animated: t.animated),
    ];
    return GridView.count(
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 24),
      crossAxisCount: 3,
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 0.8,
      children: tiles,
    );
  }

  Widget _thumb(String? url, List<Color> colors) {
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final abs = Api.absoluteUrl(url);
    return DecoratedBox(
      decoration: BoxDecoration(gradient: LinearGradient(colors: colors.length < 2 ? const [Color(0xFF2A2F3A), Color(0xFF14171D)] : colors, begin: Alignment.topCenter, end: Alignment.bottomCenter)),
      child: abs == null ? const SizedBox.expand() : Image(image: NetImage(abs, targetW: NetImage.px(200, dpr), targetH: NetImage.px(356, dpr)), fit: BoxFit.cover, width: double.infinity, height: double.infinity),
    );
  }

  Widget _tile({required String key, String? image, List<Color> colors = const [], required String label, String? badge, bool animated = false}) {
    final sel = _current == key;
    return GestureDetector(
      onTap: () => _apply(key),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(fit: StackFit.expand, children: [
          _thumb(image, colors),
          const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.center, end: Alignment.bottomCenter, colors: [Colors.transparent, Color(0x99000000)]))),
          Positioned(left: 8, right: 8, bottom: 6, child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600))),
          if (badge != null) Positioned(right: 6, top: 6, child: _chip(Icons.schedule, badge)),
          if (animated) const Positioned(right: 6, bottom: 24, child: Icon(Icons.auto_awesome, size: 16, color: Colors.white)),
          if (sel)
            Positioned(
              left: 8,
              top: 8,
              child: Container(
                width: 34,
                height: 34,
                decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                child: const Icon(Icons.check_rounded, color: _green, size: 28),
              ),
            ),
          if (sel) DecoratedBox(decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: _green, width: 3))),
          if (_busy == key) const ColoredBox(color: Color(0x66000000), child: Center(child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white)))),
        ]),
      ),
    );
  }

  Widget _customState(CustomTheme c) {
    final (icon, title, sub, canUpload) = switch (c.status) {
      'pending' => (Icons.hourglass_top_rounded, 'İncelemede', 'Onay bekleniyor', false),
      'rejected' => (Icons.refresh_rounded, 'Reddedildi', c.reviewNote?.isNotEmpty == true ? c.reviewNote! : 'Yeni görsel yükle', true),
      _ => (Icons.add_photo_alternate_outlined, 'Özel tema', '${c.days} gün · görsel yükle', true),
    };
    return GestureDetector(
      onTap: canUpload ? () => _uploadCustom(c) : null,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(fit: StackFit.expand, children: [
          if (c.imageUrl != null) Opacity(opacity: 0.45, child: _thumb(c.imageUrl, const [])) else const ColoredBox(color: Color(0xFFF1F4F8)),
          DecoratedBox(decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: _green.withValues(alpha: 0.6), width: 1.5))),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(icon, color: _green, size: 30),
              const SizedBox(height: 6),
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, color: _ink, fontSize: 13)),
              const SizedBox(height: 2),
              Text(sub, textAlign: TextAlign.center, maxLines: 3, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Color(0xFF5B6475), fontSize: 11)),
            ]),
          ),
          if (_busy == c.id) const ColoredBox(color: Color(0x66000000), child: Center(child: CircularProgressIndicator(color: Colors.white))),
        ]),
      ),
    );
  }

  Widget _chip(IconData icon, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
        decoration: BoxDecoration(color: const Color(0x8C000000), borderRadius: BorderRadius.circular(10)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 13, color: Colors.white),
          const SizedBox(width: 3),
          Text(text, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600)),
        ]),
      );

  // ---------------- Mağaza ----------------
  Widget _store() {
    final list = RoomThemes.all.where((t) => !t.free).toList();
    if (list.isEmpty) return const Center(child: Text('Mağazada şu an tema yok.', style: TextStyle(color: _muted)));
    return Column(children: [
      if (!RoomThemes.self)
        const Padding(
          padding: EdgeInsets.fromLTRB(16, 0, 16, 6),
          child: Text('Temalar oda sahibinin hesabına alınır. Satın almayı oda sahibi yapabilir.', style: TextStyle(color: Color(0xFF5B6475), fontSize: 12)),
        ),
      Expanded(
        child: GridView.builder(
          padding: const EdgeInsets.fromLTRB(14, 6, 14, 24),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, mainAxisSpacing: 14, crossAxisSpacing: 14, childAspectRatio: 0.66),
          itemCount: list.length,
          itemBuilder: (_, i) => _storeCard(list[i]),
        ),
      ),
    ]);
  }

  Widget _storeCard(RoomThemeDef t) {
    final busy = _busy == t.key;
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: Column(children: [
        Expanded(
          child: GestureDetector(
            onTap: () => _preview(t),
            child: Stack(fit: StackFit.expand, children: [
              _thumb(t.thumbUrl, t.colors),
              const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment(0, 0.2), end: Alignment.bottomCenter, colors: [Colors.transparent, Color(0xA6000000)]))),
              Positioned(left: 8, top: 8, child: _chip(Icons.schedule, t.owned ? '${t.daysLeft} gün kaldı' : '${t.durationDays} gün')),
              Positioned(
                right: 6,
                top: 4,
                child: IconButton(
                  tooltip: 'Önizle',
                  visualDensity: VisualDensity.compact,
                  onPressed: () => _preview(t),
                  icon: const Icon(Icons.remove_red_eye_outlined, color: Colors.white, size: 26),
                ),
              ),
              if (t.animated) Positioned(right: 8, bottom: 32, child: _chip(Icons.auto_awesome, 'Hareketli')),
              Positioned(left: 10, right: 10, bottom: 8, child: Text(t.label, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 12))),
              Positioned(
                left: 10,
                bottom: 26,
                child: Text('${fmtNumber(t.priceCoins)} Coins', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700, shadows: [Shadow(blurRadius: 4)])),
              ),
            ]),
          ),
        ),
        SizedBox(
          width: double.infinity,
          height: 46,
          child: Material(
            color: RoomThemes.self ? _green : const Color(0xFFB8C2CC),
            child: InkWell(
              onTap: !RoomThemes.self || busy ? null : () => _buy(t),
              child: Center(
                child: busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.4, color: Colors.white))
                    : Text(t.owned ? 'Süreyi uzat' : 'Satın alma', style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ),
      ]),
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
      backgroundColor: Colors.black,
      body: Stack(fit: StackFit.expand, children: [
        ThemeArt(theme: theme, dim: true),
        SafeArea(
          child: Column(children: [
            Row(children: [
              IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close, color: Colors.white, size: 28)),
              Expanded(child: Text(theme.label, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700))),
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
                    style: FilledButton.styleFrom(backgroundColor: _green, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                    onPressed: onBuy,
                    child: Text('${fmtNumber(theme.priceCoins)} Coins · ${theme.durationDays} gün', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  ),
                ),
              ),
          ]),
        ),
      ]),
    );
  }
}
