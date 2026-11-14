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

/// Özel ID kapsülü (Yoho "güzel numara" gibi): kısa numara daha nadir → daha gösterişli renk
/// (≤3 hane neon aurora, 4–5 hane mor-pembe, 6+ hane altın-ateş). Zemin rengi akar, çevresinde dönen altın çerçeve,
/// solda taçlı altın madalyon, üzerinden parıltı geçer, iki yıldız sırayla parlar.
class SpecialIdPill extends StatefulWidget {
  final String id;
  final double height;
  const SpecialIdPill({super.key, required this.id, this.height = 20});

  @override
  State<SpecialIdPill> createState() => _SpecialIdPillState();
}

class _SpecialIdPillState extends State<SpecialIdPill> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 3000))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  List<Color> get _colors {
    final n = widget.id.length;
    // Kısa (≤3 hane) en nadir: neon aurora — turkuaz → elektrik mavisi → mor → fuşya; düz gökkuşağı değil, serin ve parlak.
    if (n <= 3) return const [Color(0xFF00F0FF), Color(0xFF2F7BFF), Color(0xFF7A3CFF), Color(0xFFFF2E9A), Color(0xFF7A3CFF), Color(0xFF2F7BFF), Color(0xFF00F0FF)];
    if (n <= 5) return const [Color(0xFFFF6FD8), Color(0xFFB04BFF), Color(0xFF5B21B6), Color(0xFFB04BFF), Color(0xFFFF6FD8)];
    return const [Color(0xFFFFE27A), Color(0xFFFF9F1C), Color(0xFFE5483D), Color(0xFFFF9F1C), Color(0xFFFFE27A)];
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.height;
    final colors = _colors;
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = _c.value;
          final sweep = (t / 0.45).clamp(0.0, 1.0); // parıltı turun ilk %45'inde geçer
          final pill = Container(
            height: h,
            padding: const EdgeInsets.all(1.3),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(h / 2),
              // Dönen altın çerçeve
              gradient: SweepGradient(
                transform: GradientRotation(t * 6.283),
                colors: const [Color(0xFFFFF6C2), Color(0xFFFFC300), Color(0xFF9A6A00), Color(0xFFFFE57F), Color(0xFFFFF6C2)],
              ),
              boxShadow: [BoxShadow(color: colors[1].withValues(alpha: 0.6), blurRadius: 9)],
            ),
            child: Container(
              padding: EdgeInsets.only(right: h * 0.45),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(h / 2),
                // Akan zemin rengi
                gradient: LinearGradient(
                  begin: Alignment(-1 - 2 * t, 0),
                  end: Alignment(1 - 2 * t, 0),
                  colors: colors,
                  tileMode: TileMode.mirror,
                ),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                // Taçlı altın madalyon
                Container(
                  width: h - 2.6,
                  height: h - 2.6,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const RadialGradient(colors: [Color(0xFFFFFBE6), Color(0xFFFFD54F), Color(0xFFC88A00)], stops: [0, 0.55, 1]),
                    border: Border.all(color: Colors.white, width: 0.9),
                    boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 2)],
                  ),
                  alignment: Alignment.center,
                  child: Icon(Icons.workspace_premium_rounded, size: h * 0.62, color: const Color(0xFF7A4300)),
                ),
                SizedBox(width: h * 0.28),
                Text(
                  widget.id,
                  style: TextStyle(
                    fontSize: h * 0.62,
                    height: 1.0,
                    fontWeight: FontWeight.w900,
                    fontStyle: FontStyle.italic,
                    letterSpacing: h * 0.06,
                    color: Colors.white,
                    shadows: const [Shadow(color: Color(0xAA000000), blurRadius: 3, offset: Offset(0, 1))],
                  ),
                ),
              ]),
            ),
          );
          return Stack(clipBehavior: Clip.none, children: [
            if (sweep < 1)
              ShaderMask(
                blendMode: BlendMode.srcATop,
                shaderCallback: (r) => LinearGradient(
                  begin: Alignment(-1.8 + 3.6 * sweep, -0.4),
                  end: Alignment(-1.0 + 3.6 * sweep, 0.4),
                  colors: const [Color(0x00FFFFFF), Color(0xB3FFFFFF), Color(0x00FFFFFF)],
                ).createShader(r),
                child: pill,
              )
            else
              pill,
            // Sırayla parlayan iki yıldız
            for (final (i, fx, fy) in const [(0, 0.82, -0.18), (1, 0.42, 0.72)])
              Positioned.fill(
                child: IgnorePointer(
                  child: Align(
                    alignment: Alignment(fx * 2 - 1, fy * 2 - 1),
                    child: Opacity(
                      opacity: _twinkle(t, i),
                      child: Icon(Icons.auto_awesome, size: h * 0.5, color: Colors.white, shadows: [Shadow(color: colors[1], blurRadius: 4)]),
                    ),
                  ),
                ),
              ),
          ]);
        },
      ),
    );
  }

  static double _twinkle(double t, int i) {
    final p = (t * 2 + i * 0.5) % 1.0;
    return p < 0.3 ? (p < 0.15 ? p / 0.15 : (0.3 - p) / 0.15) : 0.0;
  }
}

/// Renkli ID (Görünüm'de takılır): bronz / gümüş / altın. Solda metalik "ID" etiketi, numara metalik akan renkte;
/// ara ara üzerinden parlak ışık geçer.
const Map<String, List<Color>> kIdColors = {
  'bronz': [Color(0xFFFFE0C2), Color(0xFFE8955A), Color(0xFF9C5426), Color(0xFFF7B983)],
  'gumus': [Color(0xFFFFFFFF), Color(0xFFD5DEE8), Color(0xFF8C9AAB), Color(0xFFEFF4F9)],
  'altin': [Color(0xFFFFF8C9), Color(0xFFFFD54F), Color(0xFFDB9A00), Color(0xFFFFEE99)],
};
const Map<String, Color> _idGlow = {'bronz': Color(0xFFC46A2E), 'gumus': Color(0xFF9FB3C8), 'altin': Color(0xFFFFB300)};
const Map<String, Color> _idTagText = {'bronz': Color(0xFF4A2208), 'gumus': Color(0xFF26313D), 'altin': Color(0xFF5A3600)};
const Map<String, String> kIdColorNames = {'bronz': 'Bronz Renkli ID', 'gumus': 'Gümüş Renkli ID', 'altin': 'Altın Renkli ID'};

class ColoredIdText extends StatefulWidget {
  final String text;
  final String tier;
  final double fontSize;
  const ColoredIdText({super.key, required this.text, required this.tier, this.fontSize = 13});

  @override
  State<ColoredIdText> createState() => _ColoredIdTextState();
}

class _ColoredIdTextState extends State<ColoredIdText> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = kIdColors[widget.tier] ?? kIdColors['altin']!;
    final glow = _idGlow[widget.tier] ?? const Color(0xFFFFB300);
    final f = widget.fontSize;
    final number = widget.text.replaceFirst(RegExp(r'^\s*ID\s*:\s*'), '');
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = _c.value;
          final sweep = (t / 0.4).clamp(0.0, 1.0);
          final tag = Container(
            height: f * 1.35,
            padding: EdgeInsets.symmetric(horizontal: f * 0.38),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(f * 0.35),
              gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: colors),
              border: Border.all(color: Colors.white.withValues(alpha: 0.75), width: 0.7),
              boxShadow: [BoxShadow(color: glow.withValues(alpha: 0.55), blurRadius: 6)],
            ),
            child: Text('ID',
                style: TextStyle(fontSize: f * 0.78, height: 1.0, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic, color: _idTagText[widget.tier] ?? const Color(0xFF5A3600))),
          );
          final numText = ShaderMask(
            blendMode: BlendMode.srcIn,
            shaderCallback: (r) => LinearGradient(
              begin: Alignment(-1 - 2 * t, 0),
              end: Alignment(1 - 2 * t, 0),
              colors: colors,
              tileMode: TileMode.mirror,
            ).createShader(r),
            child: Text(
              number,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: f, fontWeight: FontWeight.w900, letterSpacing: f * 0.06, color: Colors.white, shadows: [Shadow(color: glow.withValues(alpha: 0.85), blurRadius: 7)]),
            ),
          );
          final row = Row(mainAxisSize: MainAxisSize.min, children: [tag, SizedBox(width: f * 0.35), Flexible(child: numText)]);
          if (sweep >= 1) return row;
          return ShaderMask(
            blendMode: BlendMode.srcATop,
            shaderCallback: (r) => LinearGradient(
              begin: Alignment(-1.8 + 3.6 * sweep, -0.5),
              end: Alignment(-1.1 + 3.6 * sweep, 0.5),
              colors: const [Color(0x00FFFFFF), Color(0xCCFFFFFF), Color(0x00FFFFFF)],
            ).createShader(r),
            child: row,
          );
        },
      ),
    );
  }
}

/// Normal ID: küçük "ID" etiketi + numara (sade).
class PlainIdText extends StatelessWidget {
  final String id;
  final double fontSize;
  final Color color;
  const PlainIdText({super.key, required this.id, this.fontSize = 12, this.color = Colors.white70});

  @override
  Widget build(BuildContext context) {
    final f = fontSize;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        height: f * 1.3,
        padding: EdgeInsets.symmetric(horizontal: f * 0.32),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(f * 0.3),
          color: color.withValues(alpha: 0.16),
          border: Border.all(color: color.withValues(alpha: 0.45), width: 0.7),
        ),
        child: Text('ID', style: TextStyle(fontSize: f * 0.74, height: 1.0, fontWeight: FontWeight.w800, color: color)),
      ),
      SizedBox(width: f * 0.32),
      Flexible(
        child: Text(id, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: f, height: 1.1, color: color, letterSpacing: f * 0.03)),
      ),
    ]);
  }
}

/// Kişinin görünen kimliği: gizli kullanıcıda gizli ID; değilse etkin özel ID varsa o, yoksa normal ID.
String displayIdOf(Map<String, dynamic>? user) {
  if (user?['isHidden'] == true) return user?['hiddenId']?.toString() ?? '';
  final special = user?['specialId']?.toString() ?? '';
  return special.isNotEmpty ? special : (user?['publicId']?.toString() ?? '');
}

/// Oda kimliği: sahibinin görünen kimliği (gizli / özel / normal); bilinmiyorsa eski oda numarası. Düz yazı olarak gösterilir.
String roomIdOf(Map<String, dynamic>? room, Map<String, dynamic>? owner) {
  final d = displayIdOf(owner);
  return d.isNotEmpty ? d : (room?['roomNumber'] ?? '').toString();
}

/// Gizli kimlik (Yoho "gizemli kişi"): koyu mor kapsül, solda gözü kapalı madalyon, "Gizli" + gizli ID;
/// üzerinden yavaşça mor ışık geçer. Gerçek ID hiçbir yerde görünmez.
class HiddenIdPill extends StatefulWidget {
  final String alias;
  final double height;
  const HiddenIdPill({super.key, required this.alias, this.height = 20});

  @override
  State<HiddenIdPill> createState() => _HiddenIdPillState();
}

class _HiddenIdPillState extends State<HiddenIdPill> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 3600))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final h = widget.height;
    final alias = widget.alias;
    return RepaintBoundary(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = _c.value;
          final sweep = (t / 0.5).clamp(0.0, 1.0);
          final pill = Container(
            height: h,
            padding: EdgeInsets.only(left: 1.2, right: h * 0.45),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(h / 2),
              gradient: LinearGradient(
                begin: Alignment(-1 - 2 * t, 0),
                end: Alignment(1 - 2 * t, 0),
                colors: const [Color(0xFF1B1036), Color(0xFF4C1D95), Color(0xFF2A1659), Color(0xFF1B1036)],
                tileMode: TileMode.mirror,
              ),
              border: Border.all(color: const Color(0xB3C4B5FD), width: 0.9),
              boxShadow: const [BoxShadow(color: Color(0x668B5CF6), blurRadius: 8)],
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: h - 3,
                height: h - 3,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(colors: [Color(0xFF6D4BC4), Color(0xFF241445)]),
                ),
                alignment: Alignment.center,
                child: Icon(Icons.visibility_off_rounded, size: h * 0.56, color: const Color(0xFFE9D8FD)),
              ),
              SizedBox(width: h * 0.25),
              Text('Gizli', style: TextStyle(fontSize: h * 0.48, height: 1.0, fontWeight: FontWeight.w800, color: const Color(0xFFC4B5FD))),
              if (alias.isNotEmpty) ...[
                SizedBox(width: h * 0.22),
                Text(
                  alias,
                  style: TextStyle(
                    fontSize: h * 0.6,
                    height: 1.0,
                    fontWeight: FontWeight.w900,
                    fontStyle: FontStyle.italic,
                    letterSpacing: h * 0.05,
                    color: Colors.white,
                    shadows: const [Shadow(color: Color(0xFF8B5CF6), blurRadius: 5)],
                  ),
                ),
              ] else ...[
                SizedBox(width: h * 0.18),
                Text('ID', style: TextStyle(fontSize: h * 0.56, height: 1.0, fontWeight: FontWeight.w900, color: Colors.white)),
              ],
            ]),
          );
          if (sweep >= 1) return pill;
          return ShaderMask(
            blendMode: BlendMode.srcATop,
            shaderCallback: (r) => LinearGradient(
              begin: Alignment(-1.8 + 3.6 * sweep, -0.4),
              end: Alignment(-1.0 + 3.6 * sweep, 0.4),
              colors: const [Color(0x00FFFFFF), Color(0x66E9D8FD), Color(0x00FFFFFF)],
            ).createShader(r),
            child: pill,
          );
        },
      ),
    );
  }
}

/// Kullanıcı kimliği: gizli kullanıcıda gizli kimlik kapsülü; özel ID varsa süslü kapsül; takılı renkli ID (bronz/gümüş/altın) varsa metalik; yoksa WIP'li kişide
/// adı gibi renkli/parlayan "ID: …", değilse sade "ID" etiketi + numara. user: publicId, specialId, idColor, wipLevel,
/// nameColor alanları okunur. Oda kimliği de oda sahibinin bu kimliğidir (Yoho gibi; kimlik değişince oda da değişir).
class IdBadge extends StatelessWidget {
  final Map<String, dynamic>? user;
  final double fontSize;
  final Color color;
  final bool copyable;
  const IdBadge({super.key, required this.user, this.fontSize = 12, this.color = Colors.white70, this.copyable = true});

  @override
  Widget build(BuildContext context) {
    // Gizli kullanıcı: yalnızca gizli kimliği (kopyalanmaz, gerçek ID'ye ulaşılamaz).
    if (user?['isHidden'] == true) return HiddenIdPill(alias: user?['hiddenId']?.toString() ?? '', height: fontSize * 1.7);
    final String special = user?['specialId']?.toString() ?? '';
    final bool hasSpecial = special.isNotEmpty;
    final String id = displayIdOf(user);
    if (id.isEmpty) return const SizedBox.shrink();
    final level = (user?['wipLevel'] as num?)?.toInt();
    final nameColor = parseColor(user?['nameColor'] as String?);
    final String tier = user?['idColor']?.toString() ?? '';
    final Widget label = hasSpecial
        ? SpecialIdPill(id: special, height: fontSize * 1.7)
        : kIdColors.containsKey(tier)
            ? ColoredIdText(text: id, tier: tier, fontSize: fontSize + 0.5)
            : (level != null && level > 0)
                ? WipNameText('ID: $id', level: level, color: nameColor, style: TextStyle(fontSize: fontSize, color: nameColor ?? color))
                : PlainIdText(id: id, fontSize: fontSize, color: color);
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
