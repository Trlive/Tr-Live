import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';

/// Kayan yazı: içerik alana sığmıyorsa sağdan sola sürekli (döngüyle) kayar; sığıyorsa yerinde durur.
/// [height] verilmelidir (kayan satırın yüksekliği).
class Marquee extends StatefulWidget {
  final Widget child;
  final double height;
  /// Saniyede kaç piksel kayar.
  final double speed;
  /// İki tekrar arasındaki boşluk.
  final double gap;
  /// Sığdığında hizası (-1 sol, 0 orta, 1 sağ).
  final double alignX;
  /// Sığsa bile kaysın (ör. art arda geçen kazanç listesi).
  final bool always;
  /// Kaymaya başlamadan önceki bekleme.
  final Duration startDelay;
  const Marquee({
    super.key,
    required this.child,
    required this.height,
    this.speed = 32,
    this.gap = 36,
    this.alignX = -1,
    this.always = false,
    this.startDelay = const Duration(milliseconds: 1200),
  });

  @override
  State<Marquee> createState() => _MarqueeState();
}

class _MarqueeState extends State<Marquee> with SingleTickerProviderStateMixin {
  final _key = GlobalKey();
  Ticker? _ticker;
  double? _w; // içeriğin genişliği
  double _maxW = 0;
  double _off = 0;

  @override
  void initState() {
    super.initState();
    _measureLater();
  }

  @override
  void didUpdateWidget(covariant Marquee old) {
    super.didUpdateWidget(old);
    _measureLater();
  }

  void _measureLater() => WidgetsBinding.instance.addPostFrameCallback((_) => _measure());

  void _measure() {
    if (!mounted) return;
    final box = _key.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final w = box.size.width;
    if (w != _w) setState(() => _w = w);
    _sync();
  }

  bool get _moving => _w != null && _maxW > 0 && (widget.always || _w! > _maxW + 0.5);

  void _sync() {
    if (_moving) {
      final t = _ticker ??= createTicker(_onTick);
      if (!t.isActive) t.start();
    } else {
      if (_ticker?.isActive == true) _ticker!.stop();
      if (_off != 0) setState(() => _off = 0);
    }
  }

  void _onTick(Duration elapsed) {
    final w = _w;
    if (w == null) return;
    final t = (elapsed - widget.startDelay).inMicroseconds / 1e6;
    final off = t <= 0 ? 0.0 : (t * widget.speed) % _period(w);
    if (off != _off) setState(() => _off = off);
  }

  /// Bir döngünün uzunluğu: içerik alandan kısaysa (always) boşluk kalmasın diye alan genişliği esas alınır.
  double _period(double w) => (w > _maxW ? w : _maxW) + widget.gap;

  @override
  void dispose() {
    _ticker?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (context, box) {
      final maxW = box.maxWidth.isFinite ? box.maxWidth : MediaQuery.sizeOf(context).width;
      if (maxW != _maxW) {
        _maxW = maxW;
        _measureLater();
      }
      final moving = _moving;
      final w = _w ?? 0;
      final left = moving ? -_off : (_w == null ? 0.0 : ((maxW - w) * (widget.alignX + 1) / 2).clamp(0.0, double.infinity));
      final period = _period(w);
      return SizedBox(
        width: maxW,
        height: widget.height,
        child: ClipRect(
          child: Opacity(
            // Ölçülmeden önceki ilk karede görünmez (yanlış yerde bir an belirmesin).
            opacity: _w == null ? 0 : 1,
            child: Stack(clipBehavior: Clip.hardEdge, children: [
            Positioned(
              left: left,
              top: 0,
              bottom: 0,
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                KeyedSubtree(key: _key, child: widget.child),
                if (moving) ...[SizedBox(width: period - w), widget.child],
              ]),
            ),
          ]),
          ),
        ),
      );
    });
  }
}
