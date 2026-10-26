import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'common.dart';

/// Yayıncı rozeti (maaş seviyesi ödülü ya da yönetimce verilir).
class HostBadgeStyle {
  final String label;
  final List<Color> colors;
  final Color text;
  final Color ring;
  const HostBadgeStyle(this.label, this.colors, this.text, this.ring);
}

const Map<String, HostBadgeStyle> kHostBadges = {
  'bronz': HostBadgeStyle('Bronz Yayıncı', [Color(0xFFF0B27A), Color(0xFFB86B34), Color(0xFF7A3F17)], Colors.white, Color(0xFFFFD2A8)),
  'gumus': HostBadgeStyle('Gümüş Yayıncı', [Color(0xFFFFFFFF), Color(0xFFC9D1DA), Color(0xFF8A95A3)], Color(0xFF1F2A36), Color(0xFFFFFFFF)),
  'altin': HostBadgeStyle('Altın Yayıncı', [Color(0xFFFFF1A8), Color(0xFFF5C22C), Color(0xFFB57A06)], Color(0xFF3A2500), Color(0xFFFFF6C8)),
  'super': HostBadgeStyle('Süper Yayıncı', [Color(0xFF5CF2FF), Color(0xFF3B82F6), Color(0xFF7C3AED)], Colors.white, Color(0xFFB9F6FF)),
  'ozel': HostBadgeStyle('Özel Yayıncı', [Color(0xFFFFC43D), Color(0xFFFF4FA8), Color(0xFF8B5CF6)], Colors.white, Color(0xFFFFE7F4)),
};

String hostBadgeLabel(String? badge) => kHostBadges[badge]?.label ?? '';

/// Küçük kapsül rozet: madalya + "Altın Yayıncı".
class HostBadgeChip extends StatelessWidget {
  final String? badge;
  final double height;
  const HostBadgeChip({super.key, required this.badge, this.height = 18});

  @override
  Widget build(BuildContext context) {
    final s = kHostBadges[badge];
    if (s == null) return const SizedBox.shrink();
    final h = height;
    return Container(
      height: h,
      padding: EdgeInsets.only(right: h * 0.42),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: s.colors, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(h / 2),
        border: Border.all(color: s.ring.withValues(alpha: 0.8), width: 0.8),
        boxShadow: [BoxShadow(color: s.colors[1].withValues(alpha: 0.45), blurRadius: 5)],
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: h,
          height: h,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: RadialGradient(colors: [s.ring, s.colors.last]),
            border: Border.all(color: Colors.white.withValues(alpha: 0.75), width: 0.8),
          ),
          child: Icon(badge == 'ozel' ? Icons.auto_awesome : badge == 'super' ? Icons.bolt : Icons.star_rounded, size: h * 0.66, color: s.text == Colors.white ? Colors.white : s.text),
        ),
        SizedBox(width: h * 0.22),
        Text(s.label, style: TextStyle(fontSize: h * 0.56, height: 1.0, fontWeight: FontWeight.w900, color: s.text, shadows: s.text == Colors.white ? const [Shadow(color: Colors.black45, blurRadius: 2)] : null)),
      ]),
    );
  }
}

/// Özel ID kapsülü: kısa numara daha nadir → daha gösterişli renk (3 hane gökkuşağı, 4–5 hane mor, 6+ hane altın-ateş).
/// Üzerinde ara ara parıltı geçer.
class SpecialIdPill extends StatefulWidget {
  final String id;
  final double height;
  const SpecialIdPill({super.key, required this.id, this.height = 20});

  @override
  State<SpecialIdPill> createState() => _SpecialIdPillState();
}

class _SpecialIdPillState extends State<SpecialIdPill> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2600))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  List<Color> get _colors {
    final n = widget.id.length;
    if (n <= 3) return const [Color(0xFFFF4FA8), Color(0xFFFFC43D), Color(0xFF34D399), Color(0xFF38BDF8), Color(0xFFA78BFA)];
    if (n <= 5) return const [Color(0xFFE879F9), Color(0xFF8B5CF6), Color(0xFF4C1D95)];
    return const [Color(0xFFFFE27A), Color(0xFFFF9F1C), Color(0xFFE5483D)];
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.height;
    final colors = _colors;
    final pill = Container(
      height: h,
      padding: EdgeInsets.only(right: h * 0.45),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: colors),
        borderRadius: BorderRadius.circular(h / 2),
        border: Border.all(color: Colors.white.withValues(alpha: 0.7), width: 0.9),
        boxShadow: [BoxShadow(color: colors[colors.length ~/ 2].withValues(alpha: 0.55), blurRadius: 8)],
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: h,
          height: h,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const RadialGradient(colors: [Color(0xFFFFF7D6), Color(0xFFE0A100)]),
            border: Border.all(color: Colors.white, width: 0.9),
          ),
          alignment: Alignment.center,
          child: Text('ID', style: TextStyle(fontSize: h * 0.42, fontWeight: FontWeight.w900, color: const Color(0xFF6B3A00), height: 1.0)),
        ),
        SizedBox(width: h * 0.3),
        Text(
          widget.id,
          style: TextStyle(
            fontSize: h * 0.62,
            height: 1.0,
            fontWeight: FontWeight.w900,
            letterSpacing: h * 0.06,
            color: Colors.white,
            shadows: const [Shadow(color: Colors.black54, blurRadius: 3, offset: Offset(0, 1))],
          ),
        ),
      ]),
    );
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        child: pill,
        builder: (context, child) {
          // Parıltı turun ilk %40'ında soldan sağa geçer, sonra bekler.
          final t = (_c.value / 0.4).clamp(0.0, 1.0);
          if (t >= 1.0) return child!;
          return ShaderMask(
            blendMode: BlendMode.srcATop,
            shaderCallback: (r) => LinearGradient(
              begin: Alignment(-1.6 + 3.2 * t, -0.3),
              end: Alignment(-1.0 + 3.2 * t, 0.3),
              colors: const [Color(0x00FFFFFF), Color(0x99FFFFFF), Color(0x00FFFFFF)],
            ).createShader(r),
            child: child,
          );
        },
      ),
    );
  }
}

/// Kullanıcı kimliği: özel ID varsa süslü kapsül, yoksa WIP'li kişide adı gibi renkli/parlayan "ID: …", değilse düz yazı.
/// user: publicId, specialId, wipLevel, nameColor alanları okunur.
class IdBadge extends StatelessWidget {
  final Map<String, dynamic>? user;
  final double fontSize;
  final Color color;
  final bool copyable;
  const IdBadge({super.key, required this.user, this.fontSize = 12, this.color = Colors.white70, this.copyable = true});

  @override
  Widget build(BuildContext context) {
    final String special = user?['specialId']?.toString() ?? '';
    final bool hasSpecial = special.isNotEmpty;
    final String id = hasSpecial ? special : (user?['publicId']?.toString() ?? '');
    if (id.isEmpty) return const SizedBox.shrink();
    final level = (user?['wipLevel'] as num?)?.toInt();
    final nameColor = parseColor(user?['nameColor'] as String?);
    final Widget label = hasSpecial
        ? SpecialIdPill(id: special, height: fontSize * 1.7)
        : (level != null && level > 0)
            ? WipNameText('ID: $id', level: level, color: nameColor, style: TextStyle(fontSize: fontSize, color: nameColor ?? color))
            : Text('ID: $id', style: TextStyle(fontSize: fontSize, color: color));
    if (!copyable) return label;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () {
        Clipboard.setData(ClipboardData(text: id));
        toast(context, 'Kimlik kopyalandı.');
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Flexible(child: label),
          const SizedBox(width: 5),
          Icon(Icons.copy, size: fontSize + 1, color: color.withValues(alpha: 0.8)),
        ]),
      ),
    );
  }
}
