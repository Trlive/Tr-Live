import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api.dart';
import 'app_theme.dart';
import 'net_image.dart';
import 'wip_style.dart';
export 'net_image.dart';
export 'wip_style.dart';

OverlayEntry? _toastEntry;
Timer? _toastTimer;

/// Kısa bilgi/hata mesajı. En üst katmanda gösterilir: açık alt pencere veya diyalog varken de görünür.
void toast(BuildContext context, String message, {bool error = false}) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) {
    final m = ScaffoldMessenger.maybeOf(context);
    m?.hideCurrentSnackBar();
    m?.showSnackBar(SnackBar(content: Text(message), backgroundColor: error ? Pal.red : null, behavior: SnackBarBehavior.floating));
    return;
  }
  _toastTimer?.cancel();
  final old = _toastEntry;
  old?.remove();
  old?.dispose();
  late final OverlayEntry entry;
  void close() {
    if (_toastEntry == entry) {
      entry.remove();
      entry.dispose();
      _toastEntry = null;
    }
  }

  entry = OverlayEntry(builder: (_) => _ToastView(message: message, error: error, onTap: close));
  _toastEntry = entry;
  overlay.insert(entry);
  _toastTimer = Timer(Duration(milliseconds: (2400 + message.length * 35).clamp(2400, 6000).toInt()), close);
}

class _ToastView extends StatelessWidget {
  final String message;
  final bool error;
  final VoidCallback onTap;
  const _ToastView({required this.message, required this.error, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return Positioned(
      left: Gap.l,
      right: Gap.l,
      bottom: mq.viewInsets.bottom + mq.padding.bottom + 96,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: 0, end: 1),
        duration: const Duration(milliseconds: 180),
        builder: (_, t, child) => Opacity(opacity: t, child: Transform.translate(offset: Offset(0, 12 * (1 - t)), child: child)),
        child: Center(
          child: Material(
            color: error ? const Color(0xFFB3261E) : Pal.surfaceHi,
            elevation: 8,
            shadowColor: Colors.black54,
            borderRadius: BorderRadius.circular(Rad.md),
            child: InkWell(
              borderRadius: BorderRadius.circular(Rad.md),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: Gap.l, vertical: Gap.m),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(error ? Icons.error_outline : Icons.check_circle_outline, size: 20, color: error ? Colors.white : Pal.cyan),
                  const SizedBox(width: Gap.s),
                  Flexible(child: Text(message, style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.3))),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Boş liste / sonuç yok görünümü: simge, açıklama ve isteğe bağlı eylem düğmesi.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String text;
  final String? actionLabel;
  final VoidCallback? onAction;
  const EmptyState({super.key, this.icon = Icons.inbox_outlined, required this.text, this.actionLabel, this.onAction});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(Gap.xl),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 52, color: Pal.textDim.withValues(alpha: 0.7)),
            const SizedBox(height: Gap.m),
            Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim, fontSize: 14, height: 1.4)),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: Gap.l),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ]),
        ),
      );
}

/// Avatar çerçevesi ölçüsü = avatar çapı × bu oran (çerçeve görsellerinde iç boşluk çapın ~%62'si).
/// Profil, kullanıcı profili ve seviye ekranı aynı oranı kullanır.
const double kFrameScale = 1.6;

final RegExp _frameScaleRe = RegExp(r'\.s(\d{3})\.[a-z0-9]+$', caseSensitive: false);

/// Çerçevenin kendi gösterim oranı: sunucu kalın / kanatlı çerçevelerin adresine ".s200." gibi ek koyar
/// (çerçeve avatar çapının 2 katı çizilir, delik avatarı tam sarar). Ek yoksa [kFrameScale].
double frameScaleOf(String? url) {
  final m = url == null ? null : _frameScaleRe.firstMatch(url.split('?').first);
  final v = m == null ? null : int.tryParse(m.group(1)!);
  if (v == null) return kFrameScale;
  return (v / 100).clamp(1.2, 2.6).toDouble();
}

/// Türkçe büyük/küçük harf (Dart'ın toUpperCase'i 'i'yi 'I' yapar).
String trUpper(String s) => s.replaceAll('i', 'İ').replaceAll('ı', 'I').toUpperCase();
String trLower(String s) => s.replaceAll('İ', 'i').replaceAll('I', 'ı').toLowerCase();

String errorText(Object e) => e is ApiException ? e.message : e.toString().replaceFirst('Exception: ', '');

/// Hata olursa kullanıcıya gösterir ve null döner.
Future<T?> guard<T>(BuildContext context, Future<T> Function() action) async {
  try {
    return await action();
  } catch (e) {
    if (context.mounted) toast(context, errorText(e), error: true);
    return null;
  }
}

/// Onay penceresi. [destructive]: silme/kapatma gibi geri alınamaz işlemlerde düğme kırmızı olur.
Future<bool> confirm(BuildContext context, String message, {String action = 'Onayla', bool destructive = false}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
        FilledButton(
          style: destructive ? FilledButton.styleFrom(backgroundColor: Pal.red, foregroundColor: Colors.white) : null,
          onPressed: () => Navigator.pop(c, true),
          child: Text(action),
        ),
      ],
    ),
  );
  return r == true;
}

Future<String?> askText(BuildContext context, String title, {String? hint, bool obscure = false, TextInputType? keyboard, String? initial}) async {
  final controller = TextEditingController(text: initial);
  final r = await showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        obscureText: obscure,
        keyboardType: keyboard,
        decoration: InputDecoration(hintText: hint),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Vazgeç')),
        FilledButton(onPressed: () => Navigator.pop(c, controller.text.trim()), child: const Text('Tamam')),
      ],
    ),
  );
  controller.dispose();
  return (r == null || r.isEmpty) ? null : r;
}

Color? parseColor(String? hex) {
  if (hex == null || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(hex)) return null;
  return Color(int.parse('FF${hex.substring(1)}', radix: 16));
}

String fmtNumber(dynamic v) {
  final s = (v ?? 0).toString();
  final neg = s.startsWith('-');
  final digits = neg ? s.substring(1) : s;
  if (!RegExp(r'^\d+$').hasMatch(digits)) return s;
  final buf = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buf.write('.');
    buf.write(digits[i]);
  }
  return '${neg ? '-' : ''}$buf';
}

/// Kuruş cinsinden tutarı "12,50 USD" biçiminde gösterir.
String fmtMoney(dynamic cents, [String currency = 'USD']) {
  final v = BigInt.tryParse((cents ?? 0).toString()) ?? BigInt.zero;
  final whole = v ~/ BigInt.from(100);
  final frac = (v % BigInt.from(100)).toInt().toString().padLeft(2, '0');
  return '${fmtNumber(whole.toString())},$frac $currency';
}

String fmtDuration(num seconds) {
  final s = seconds.toInt();
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  return h > 0 ? '$h sa $m dk' : '$m dk';
}

class UserAvatar extends StatelessWidget {
  final Map<String, dynamic>? user;
  final double radius;
  final bool speaking;
  const UserAvatar({super.key, this.user, this.radius = 22, this.speaking = false});

  @override
  Widget build(BuildContext context) {
    final url = Api.absoluteUrl(user?['avatarUrl'] as String?);
    final name = (user?['displayName'] ?? '?').toString();
    // Görsel, gösterileceği boyutta çözülür ve telefonda saklanır (her açılışta yeniden indirilmez).
    final px = NetImage.px(radius * 2, MediaQuery.devicePixelRatioOf(context));
    // Gizli kullanıcı: gerçek fotoğraf yerine gizemli kişi görseli.
    final Widget avatar = user?['isHidden'] == true && url == null
        ? HiddenAvatar(radius: radius)
        : CircleAvatar(
            radius: radius,
            backgroundImage: url == null ? null : NetImage(url, targetW: px, targetH: px),
            onBackgroundImageError: url == null ? null : (_, __) {},
            child: url == null ? Text(name.isEmpty ? '?' : trUpper(name.characters.first)) : null,
          );
    if (!speaking) return avatar;
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.greenAccent, width: 2.5)),
      child: avatar,
    );
  }
}

/// Gizli kullanıcının görseli (gizemli kişi): koyu mor küre, silik siluet ve ortada parlayan soru işareti.
class HiddenAvatar extends StatelessWidget {
  final double radius;
  const HiddenAvatar({super.key, this.radius = 22});

  @override
  Widget build(BuildContext context) {
    final r = radius;
    return Container(
      width: r * 2,
      height: r * 2,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const RadialGradient(
          center: Alignment(0, -0.35),
          radius: 0.95,
          colors: [Color(0xFF5B3FA8), Color(0xFF2A1C5C), Color(0xFF120C2A)],
          stops: [0, 0.55, 1],
        ),
        border: Border.all(color: const Color(0xAAC4B5FD), width: r * 0.05 < 1 ? 1 : r * 0.05),
      ),
      child: Stack(alignment: Alignment.center, children: [
        Positioned(bottom: -r * 0.3, child: Icon(Icons.person_rounded, size: r * 1.9, color: const Color(0x38E9D8FD))),
        Text(
          '?',
          style: TextStyle(
            fontSize: r * 0.95,
            height: 1.0,
            fontWeight: FontWeight.w900,
            color: const Color(0xFFE9D8FD),
            shadows: [Shadow(color: const Color(0xFF8B5CF6), blurRadius: r * 0.3)],
          ),
        ),
      ]),
    );
  }
}

/// WIP rozeti (Yoho VIP3 görünümü): koyu parlak hap, ince altın çerçeve, eğik altın "WIP3" yazısı.
/// Tüm kademeler aynı sade rozet; yalnızca SWIP'in üzerinden altın parıltı geçer.
class WipChip extends StatelessWidget {
  final dynamic level;
  final String? colorHex;
  /// Küçük koltuk satırı için: dar, 12 px yüksekliğe sığar.
  final bool compact;
  const WipChip({super.key, required this.level, this.colorHex, this.compact = false});

  @override
  Widget build(BuildContext context) {
    final lvl = wipLevelOf(level);
    if (lvl == null || lvl < 1) return const SizedBox.shrink();
    final swip = lvl >= kSwipLevel;
    final h = compact ? 12.0 : 18.0;
    final text = compact ? (swip ? 'SWIP' : 'W$lvl') : (swip ? 'SWIP' : 'WIP$lvl');
    final chip = Container(
      height: h,
      padding: EdgeInsets.all(compact ? 0.9 : 1.3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(h / 2),
        // İnce altın çerçeve (her yanda eşit)
        gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFFF8E7B5), Color(0xFFD9AE5C), Color(0xFFF3D892)]),
        boxShadow: swip ? const [BoxShadow(color: Color(0x88F2C14E), blurRadius: 6)] : null,
      ),
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: h * 0.5),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(h / 2),
          // Koyu, üstü parlak zemin
          gradient: const LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF4A4A4E), Color(0xFF242427), Color(0xFF151517)], stops: [0, 0.48, 1]),
        ),
        child: ShaderMask(
          blendMode: BlendMode.srcIn,
          shaderCallback: (r) => const LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFF4D6), Color(0xFFF1D08A), Color(0xFFD9A955)],
          ).createShader(r),
          child: Text(
            text,
            maxLines: 1,
            style: TextStyle(fontSize: compact ? 8 : 11.5, height: 1.0, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, letterSpacing: 0.2, color: Colors.white),
          ),
        ),
      ),
    );
    final out = swip ? _GoldSweep(radius: h / 2, child: chip) : chip;
    // Satır içinde genişlemesin (Wrap / Row içinde yalnızca yazı kadar).
    return Padding(padding: EdgeInsets.only(left: compact ? 0 : 6), child: IntrinsicWidth(child: out));
  }
}

/// SWIP rozetinin üzerinden soldan sağa geçen altın parıltı.
class _GoldSweep extends StatefulWidget {
  final Widget child;
  final double radius;
  const _GoldSweep({required this.child, required this.radius});

  @override
  State<_GoldSweep> createState() => _GoldSweepState();
}

class _GoldSweepState extends State<_GoldSweep> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2200))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      widget.child,
      Positioned.fill(
        child: IgnorePointer(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(widget.radius),
            child: AnimatedBuilder(
              animation: _c,
              builder: (_, __) {
                // Geçiş zamanın %60'ında; kalan sürede bekler.
                final t = (_c.value / 0.6).clamp(0.0, 1.0);
                return FractionalTranslation(
                  translation: Offset(-1 + 2.2 * t, 0),
                  child: Transform(
                    transform: Matrix4.skewX(-0.5),
                    child: const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [Color(0x00FFE9A8), Color(0xCCFFF1C2), Color(0x00FFE9A8)], stops: [0.3, 0.5, 0.7]),
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    ]);
  }
}


/// WIP adı (Yoho VIP gibi kademeye göre): 1–3 renkli, 4 parlayan, 5 neon nabız, 6–9 hareketli parıltı
/// (altın, yeşim, buz, gökkuşağı), 10 ateş, SWIP hayalet.
class WipNameText extends StatefulWidget {
  final String text;
  final int? level;
  final Color? color;
  final TextStyle? style;
  final int maxLines;
  const WipNameText(this.text, {super.key, this.level, this.color, this.style, this.maxLines = 1});

  @override
  State<WipNameText> createState() => _WipNameTextState();
}

class _WipNameTextState extends State<WipNameText> with TickerProviderStateMixin {
  AnimationController? _c;

  WipNameFx get _fx => WipStyle.of(widget.level)?.nameFx ?? WipNameFx.plain;
  bool get _animated => _fx != WipNameFx.plain && _fx != WipNameFx.glow;
  Duration get _duration => Duration(
        milliseconds: switch (_fx) {
          WipNameFx.fire => 1600,
          WipNameFx.pulse => 1400,
          WipNameFx.ghost => 2600,
          _ => 2400,
        },
      );

  @override
  void initState() {
    super.initState();
    if (_animated) _c = AnimationController(vsync: this, duration: _duration)..repeat(reverse: true);
  }

  @override
  void didUpdateWidget(WipNameText old) {
    super.didUpdateWidget(old);
    if (_animated && _c == null) {
      _c = AnimationController(vsync: this, duration: _duration)..repeat(reverse: true);
    } else if (!_animated && _c != null) {
      _c!.dispose();
      _c = null;
    } else if (_c != null && old.level != widget.level) {
      _c!
        ..duration = _duration
        ..repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = WipStyle.of(widget.level);
    final fx = _fx;
    final bold = (widget.level ?? 0) >= 3;
    final base = (widget.style ?? const TextStyle()).copyWith(color: widget.color ?? widget.style?.color, fontWeight: bold ? FontWeight.w800 : widget.style?.fontWeight);
    Text plain(TextStyle st) => Text(widget.text, maxLines: widget.maxLines, overflow: TextOverflow.ellipsis, style: st);
    if (s == null || fx == WipNameFx.plain) return plain(base);
    final glow = widget.color ?? s.color;
    final c = _c;
    if (fx == WipNameFx.glow || c == null) return plain(base.copyWith(shadows: [Shadow(color: glow.withValues(alpha: 0.85), blurRadius: 6)]));
    // Hareketli adlar kendi katmanında çizilir (RepaintBoundary): sohbet/koltuk listesinin tamamı her karede yeniden çizilmez.
    final eased = c.drive(CurveTween(curve: Curves.easeInOut));
    if (fx == WipNameFx.pulse) {
      // Nabız: güçlü ışıklı kopya üstte belirip kaybolur. Yazı her karede yeniden dizilmez, yalnızca saydamlık değişir.
      return RepaintBoundary(
        child: Stack(fit: StackFit.passthrough, children: [
          plain(base.copyWith(shadows: [Shadow(color: glow.withValues(alpha: 0.45), blurRadius: 3)])),
          FadeTransition(opacity: eased, child: plain(base.copyWith(shadows: [Shadow(color: glow, blurRadius: 12)]))),
        ]),
      );
    }
    final shadow = fx == WipNameFx.fire ? const Color(0xAAFF5722) : s.color.withValues(alpha: 0.67);
    final shimmer = AnimatedBuilder(
      animation: eased,
      builder: (context, child) {
        final t = eased.value;
        return ShaderMask(
          blendMode: BlendMode.srcIn,
          shaderCallback: (r) => LinearGradient(begin: Alignment(-2.0 + 2.0 * t, 0), end: Alignment(2.0 * t, 0), colors: s.nameColors, tileMode: TileMode.mirror).createShader(r),
          child: child,
        );
      },
      child: plain(base.copyWith(color: Colors.white, shadows: [Shadow(color: shadow, blurRadius: 6)])),
    );
    return RepaintBoundary(
      child: fx == WipNameFx.ghost ? FadeTransition(opacity: c.drive(Tween(begin: 0.6, end: 1.0).chain(CurveTween(curve: Curves.easeInOut))), child: shimmer) : shimmer,
    );
  }
}

/// Kullanıcı adı (WIP renginde) + WIP rozeti.
class UserName extends StatelessWidget {
  final Map<String, dynamic>? user;
  final TextStyle? style;
  const UserName({super.key, this.user, this.style});

  @override
  Widget build(BuildContext context) {
    final color = parseColor(user?['nameColor'] as String?);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Flexible(
          child: WipNameText((user?['displayName'] ?? '').toString(), level: (user?['wipLevel'] as num?)?.toInt(), color: color, style: style),
        ),
        WipChip(level: user?['wipBadge'] ?? user?['wipLevel'], colorHex: user?['nameColor'] as String?),
      ],
    );
  }
}

class LoadError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const LoadError({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.cloud_off, size: 48),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Tekrar dene')),
          ]),
        ),
      );
}

/// Yükleme / hata / içerik durumlarını yöneten basit ekran gövdesi.
class AsyncBody<T> extends StatefulWidget {
  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;
  /// Değişince veriler sessizce yenilenir: eski içerik ekranda kalır (sayfa baştan kurulmaz, dönen simge çıkmaz).
  /// Yenileme, sayfa geçişi bitsin diye kısa bir gecikmeyle yapılır (geri dönerken takılma olmasın).
  final Object? version;
  /// Yükleniyor / hata durumunu saran çerçeve (ör. geri tuşu olan bir Scaffold). Veri gelince [builder] kendisi çizer.
  final Widget Function(BuildContext context, Widget child)? shell;
  const AsyncBody({super.key, required this.load, required this.builder, this.version, this.shell});

  @override
  State<AsyncBody<T>> createState() => _AsyncBodyState<T>();
}

class _AsyncBodyState<T> extends State<AsyncBody<T>> {
  T? _data;
  bool _loaded = false; // T null olabilir (ör. "ailem yok"), bu yüzden ayrı bayrak tutulur
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void didUpdateWidget(covariant AsyncBody<T> old) {
    super.didUpdateWidget(old);
    if (old.version != widget.version) {
      // Sayfa geçişi sürüyorsa (alt sayfadan geri dönülüyor) yenileme geçiş bitince yapılır; yoksa hemen.
      final sec = ModalRoute.of(context)?.secondaryAnimation;
      if (sec != null && sec.status != AnimationStatus.dismissed) {
        Future.delayed(const Duration(milliseconds: 350), () {
          if (mounted) _reload();
        });
      } else {
        _reload();
      }
    }
  }

  int _seq = 0;

  Future<void> _reload() async {
    final seq = ++_seq;
    if (!_loaded) setState(() => _loading = true);
    try {
      final d = await widget.load();
      if (!mounted || seq != _seq) return; // daha yeni bir yenileme başladıysa eski yanıt yazılmaz
      setState(() {
        _data = d;
        _loaded = true;
        _error = null;
        _loading = false;
      });
    } catch (e) {
      if (!mounted || seq != _seq) return;
      setState(() {
        _error = errorText(e);
        _loading = false;
      });
      // İçerik zaten görünüyorsa yenileme hatası sessiz kalmasın.
      if (_loaded) toast(context, _error!, error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loading && _loaded) return widget.builder(context, _data as T, _reload);
    final Widget child = _loading ? const Center(child: CircularProgressIndicator()) : LoadError(message: _error ?? 'Yüklenemedi.', onRetry: _reload);
    return widget.shell?.call(context, child) ?? child;
  }
}

/// Kullanıcı adına göre kullanıcı seçtiren arama penceresi.
Future<Map<String, dynamic>?> pickUser(BuildContext context, {bool admin = false}) async {
  final controller = TextEditingController();
  List<Map<String, dynamic>> results = [];
  String? error;
  final r = await showDialog<Map<String, dynamic>>(
    context: context,
    builder: (c) => StatefulBuilder(
      builder: (c, setS) => AlertDialog(
        title: const Text('Kullanıcı ara'),
        content: SizedBox(
          width: double.maxFinite,
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(
              controller: controller,
              autofocus: true,
              decoration: InputDecoration(hintText: admin ? 'ID, kullanıcı adı veya ad' : 'ID veya kullanıcı adı'),
              onChanged: (v) async {
                if (v.trim().length < 2) return;
                try {
                  final res = await Api.get(admin ? '/api/admin/users' : '/api/users/search', query: {'q': v.trim()});
                  if (!c.mounted) return;
                  setS(() {
                    results = listOf(res['users']);
                    error = null;
                  });
                } catch (e) {
                  if (!c.mounted) return;
                  setS(() => error = errorText(e));
                }
              },
            ),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(error!, style: const TextStyle(color: Colors.redAccent))),
            Flexible(
              child: ListView(shrinkWrap: true, children: [
                for (final u in results)
                  ListTile(
                    leading: UserAvatar(user: u, radius: 16),
                    title: Text((u['displayName'] ?? '').toString()),
                    subtitle: Text((u['specialId'] ?? u['publicId']) != null ? 'ID: ${u['specialId'] ?? u['publicId']} · @${u['username']}' : '@${u['username']}'),
                    onTap: () => Navigator.pop(c, u),
                  ),
              ]),
            ),
          ]),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(c), child: const Text('Kapat'))],
      ),
    ),
  );
  controller.dispose();
  return r;
}

/// Birden fazla alanlı basit form penceresi; {etiket: değer} döner.
Future<Map<String, String>?> formDialog(BuildContext context, String title, List<String> labels, {Map<String, String> initial = const {}}) async {
  final controllers = {for (final l in labels) l: TextEditingController(text: initial[l] ?? '')};
  final ok = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final l in labels) TextField(controller: controllers[l], decoration: InputDecoration(labelText: l)),
        ]),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Tamam')),
      ],
    ),
  );
  final values = {for (final l in labels) l: controllers[l]!.text.trim()};
  for (final c in controllers.values) {
    c.dispose();
  }
  return ok == true ? values : null;
}

/// Sıralama listelerinde kimse olmasa da ilk [count] satır görünür: eksik satırlar boş (sıra numarası, 0 puan) eklenir.
/// Boş satırda kullanıcı yoktur (dokununca bir şey açılmaz). [scoreKey]: puan alanının adı (total / score / points).
List<Map<String, dynamic>> padRanking(List<Map<String, dynamic>> list, {int count = 10, String scoreKey = 'total'}) {
  if (list.length >= count) return list;
  return [
    ...list,
    for (var i = list.length; i < count; i++) <String, dynamic>{'rank': i + 1, scoreKey: '0', 'placeholder': true},
  ];
}
