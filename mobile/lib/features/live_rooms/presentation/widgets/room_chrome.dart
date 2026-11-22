import 'package:flutter/material.dart';

import '../../../../l10n/l10n.dart';
import '../../../../widgets/common.dart';
import '../../../../widgets/id_badge.dart';
import '../../../../widgets/level_badge.dart';
import '../../../../widgets/wip_style.dart';

/// Oda ekranının duruma BAĞLI OLMAYAN parçaları.
///
/// room_screen.dart 5357 satırdı. Bu dosyaya yalnızca şu ölçütü geçenler taşındı:
/// gövdesinde hiçbir ekran alanına (`_room`, `_members` …), `setState`, `widget.`
/// ya da `mounted` geçmeyen metotlar. Ölçüt mekanik olarak denetlendi, göz kararı
/// seçilmedi; böylece taşıma davranışı değiştiremez.
///
/// Geri kalan büyük metotlar (ör. 355 satırlık üye kartı) ekran durumuna bağlı.
/// Onları ayırmak dosya taşımakla olmaz, durumu bir denetleyiciye (controller)
/// çıkarmakla olur — ayrı ve büyük bir iş. Bkz. docs/MODULE_STANDARD.md.

Widget mutedBadge(double size) => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(color: Colors.white, shape: BoxShape.circle, boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 3)]),
      padding: EdgeInsets.all(size * 0.08),
      child: Container(
        decoration: const BoxDecoration(color: Color(0xFFF2457A), shape: BoxShape.circle),
        child: Icon(Icons.mic_off, color: Colors.white, size: size * 0.58),
      ),
    );

Widget badgeRow(Map<String, dynamic>? u, {double h = 16}) {
  // Gizli kullanıcı: seviye / rozet yerine gizli kimliği (kim olduğu seviyesinden anlaşılmasın).
  if (u?['isHidden'] == true) return HiddenIdPill(alias: u?['hiddenId']?.toString() ?? '', height: h);
  final wip = wipLevelOf(u?['wipBadge'] ?? u?['wipLevel']);
  final gift = (u?['giftLevel'] as num?)?.toInt() ?? 1;
  final cp = (u?['cpLevel'] as num?)?.toInt();
  final items = <Widget>[
    if (wip != null) WipChip(level: wip, colorHex: u?['nameColor'] as String?, height: h),
    LevelPill(level: u?['coinLevel'] ?? 1, send: true, height: h),
    if (gift > 1) LevelPill(level: gift, send: false, height: h),
    if (cp != null && cp >= 1) CpLevelPill(level: cp, height: h),
    // "Doğrulanmış" rozeti BİLEREK YOK: oda içinde gösterilmiyor (sahibinin kararı).
    // Rozet odadaki isim satırını şişiriyor ve kimin doğrulanmış olduğu oda içinde bir işe
    // yaramıyor. Doğrulama durumu profilde duruyor. badgeRow yalnızca oda ekranından
    // çağrıldığı için burada kaldırmak = odadan kaldırmak.
  ];
  // WIP, seviye ve CP kutucukları aynı yükseklikte (h) ve eşit aralıkla.
  return Wrap(spacing: 4, runSpacing: 3, crossAxisAlignment: WrapCrossAlignment.center, children: items);
}

Widget nameText(Map<String, dynamic>? u, {double size = 13.5, Color? fallback}) => u?['isHidden'] == true
    // Gizli kullanıcı: altın yazı (uygulama renkleri).
    ? ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (r) => const LinearGradient(colors: [Color(0xFFFFE9A0), Color(0xFFF2B92A), Color(0xFFFFD54F)]).createShader(r),
        child: Text('${u?['displayName'] ?? ''}', style: TextStyle(fontSize: size, fontWeight: FontWeight.w900, color: Colors.white)),
      )
    : WipNameText(
      '${u?['displayName'] ?? ''}',
      level: (u?['wipLevel'] as num?)?.toInt(),
      color: parseColor(u?['nameColor'] as String?) ?? fallback ?? const Color(0xFF7DD3FC),
      style: TextStyle(fontSize: size, fontWeight: FontWeight.w800, shadows: const [Shadow(color: Colors.black54, blurRadius: 2)]),
    );

Widget announcementCard(String ann, double maxW) => Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: maxW),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xB37C3AED), Color(0xB3DB2777)]),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white24),
        ),
        child: Text.rich(
          TextSpan(children: [
            const WidgetSpan(alignment: PlaceholderAlignment.middle, child: Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.campaign_rounded, size: 16, color: Colors.amberAccent))),
            TextSpan(text: tx('Oda duyurusu: '), style: TextStyle(fontWeight: FontWeight.w800, color: Colors.amberAccent)),
            TextSpan(text: ann),
          ]),
          style: const TextStyle(fontSize: 14, height: 1.3, color: Colors.white),
        ),
      ),
    );

Widget pill(String text, Color color) => Container(
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(10)),
      // widthFactor 1: yazı kadar (Wrap içinde satırı kaplamasın).
      child: Center(widthFactor: 1, child: Text(text, maxLines: 1, style: const TextStyle(fontSize: 11, height: 1.0, fontWeight: FontWeight.w800, color: Colors.white))),
    );

Widget glass({Key? key, required Widget child, VoidCallback? onTap, EdgeInsets padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 6), double radius = 22}) {
  return Material(
    key: key,
    color: Colors.black38,
    borderRadius: BorderRadius.circular(radius),
    child: InkWell(borderRadius: BorderRadius.circular(radius), onTap: onTap, child: Padding(padding: padding, child: child)),
  );
}
