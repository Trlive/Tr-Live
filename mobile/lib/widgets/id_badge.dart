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

/// Renkli ID (Görünüm'de takılır): bronz / gümüş / altın. Solda parlak kapsül "ID" etiketi, yanında aynı renkte numara.
/// Düz, sakin tasarım (animasyon yok).
const Map<String, List<Color>> kIdColors = {
  'bronz': [Color(0xFFF6C49C), Color(0xFFD9803F), Color(0xFF9C5426)],
  'gumus': [Color(0xFFFFFFFF), Color(0xFFD3DBE5), Color(0xFF8C9AAB)],
  'altin': [Color(0xFFFFE27A), Color(0xFFF7B516), Color(0xFFD97E06)],
};
const Map<String, Color> _idNumber = {'bronz': Color(0xFFD9803F), 'gumus': Color(0xFF9AA7B6), 'altin': Color(0xFFF59E0B)};
const Map<String, Color> _idTagText = {'bronz': Color(0xFF4A2208), 'gumus': Color(0xFF26313D), 'altin': Color(0xFF5A3600)};
const Map<String, String> kIdColorNames = {'bronz': 'Bronz Renkli ID', 'gumus': 'Gümüş Renkli ID', 'altin': 'Altın Renkli ID'};

class ColoredIdText extends StatelessWidget {
  final String text;
  final String tier;
  final double fontSize;
  const ColoredIdText({super.key, required this.text, required this.tier, this.fontSize = 13});

  @override
  Widget build(BuildContext context) {
    final colors = kIdColors[tier] ?? kIdColors['altin']!;
    final f = fontSize;
    final number = text.replaceFirst(RegExp(r'^\s*ID\s*:\s*'), '');
    final tag = Container(
      height: f * 1.5,
      padding: EdgeInsets.symmetric(horizontal: f * 0.7),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(f * 0.75),
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: colors),
        border: Border.all(color: colors.last.withValues(alpha: 0.9), width: 1),
      ),
      child: Text('ID', style: TextStyle(fontSize: f * 0.9, height: 1.0, fontWeight: FontWeight.w900, color: _idTagText[tier] ?? const Color(0xFF5A3600))),
    );
    return Row(mainAxisSize: MainAxisSize.min, children: [
      tag,
      SizedBox(width: f * 0.4),
      Flexible(
        child: Text(number,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: f * 1.1, height: 1.1, fontWeight: FontWeight.w800, color: _idNumber[tier] ?? const Color(0xFFF59E0B))),
      ),
    ]);
  }
}

/// Normal ID: sade "ID:12345678" yazısı (kapsül yok).
class PlainIdText extends StatelessWidget {
  final String id;
  final double fontSize;
  final Color color;
  const PlainIdText({super.key, required this.id, this.fontSize = 12, this.color = Colors.white70});

  @override
  Widget build(BuildContext context) {
    return Text('ID:$id', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: fontSize, height: 1.1, color: color, letterSpacing: fontSize * 0.02));
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

/// Kullanıcı kimliği: gizli kullanıcıda gizli kimlik kapsülü; takılı renkli ID (bronz/gümüş/altın) varsa metalik; yoksa WIP'li kişide
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
    final String id = displayIdOf(user);
    if (id.isEmpty) return const SizedBox.shrink();
    final level = (user?['wipLevel'] as num?)?.toInt();
    final nameColor = parseColor(user?['nameColor'] as String?);
    final String tier = user?['idColor']?.toString() ?? '';
    // Özel ID = rakamları kullanıcının seçtiği ID; ayrı bir görünümü yok. Görünüm yalnızca takılı renkli ID'ye (bronz/gümüş/altın) bağlıdır.
    final Widget label = kIdColors.containsKey(tier)
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
