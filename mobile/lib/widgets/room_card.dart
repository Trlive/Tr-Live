import 'package:flutter/material.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import 'app_theme.dart';
import 'room_categories.dart';
import 'net_image.dart';

/// Ana sayfa oda kartı (Yoho ölçüleri): kare kapak görseli, sol altta tür etiketi, sağ altta dinleyici sayısı ve
/// üstünde üst üste binen üye avatarları; oda adı görselin altında. Tüm ölçüler kart genişliğine oranlıdır.
class RoomCard extends StatelessWidget {
  final Map<String, dynamic> room;
  final VoidCallback onTap;
  const RoomCard({super.key, required this.room, required this.onTap});

  /// Koyu cam kapsül: yarı saydam siyah zemin, ince uygulama sarısı çerçeve (sol üst simgeler aynı tip görünsün).
  static Widget _glass(double tagH, {required Widget child, double? width, EdgeInsets? padding}) => Container(
        height: tagH * 1.3,
        width: width,
        padding: padding,
        decoration: BoxDecoration(
          color: const Color(0x99000000),
          borderRadius: BorderRadius.circular(tagH * 0.65),
          border: Border.all(color: const Color(0xD9F2B92A), width: 0.9),
          boxShadow: const [BoxShadow(color: Color(0x66000000), blurRadius: 4, offset: Offset(0, 1))],
        ),
        // widthFactor 1: kapsül içeriği kadar (Flexible içinde gereksiz uzamasın).
        child: Center(widthFactor: 1, child: child),
      );

  /// Altın degrade simge / yazı.
  static Widget _gold(Widget child) => ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (r) => const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFFF3B0), Color(0xFFF2B92A), Color(0xFFC98A12)],
        ).createShader(r),
        child: child,
      );

  /// Kartın görselinin altındaki ad alanı (genişliğe oranla); ızgara bu payı ayırır.
  static double titleAreaFor(double screenW) => (screenW * 0.104).clamp(38.0, 50.0).toDouble();

  @override
  Widget build(BuildContext context) {
    final owner = room['owner'] is Map ? Map<String, dynamic>.from(room['owner'] as Map) : null;
    final themeImg = room['themeImageUrl'] as String?;
    final cover = room['coverUrl'] as String?;
    final image = Api.absoluteUrl(cover != null && cover.isNotEmpty ? cover : (themeImg != null && themeImg.isNotEmpty ? themeImg : owner?['avatarUrl'] as String?));
    final bags = (room['bagCount'] as num?)?.toInt() ?? 0;
    final tags = room['tags'] is List ? (room['tags'] as List).map((e) => e.toString()).where((t) => t.trim().isNotEmpty).toList() : <String>[];
    final isVideo = room['roomType'] == 'video';
    final count = room['memberCount'] ?? 0;
    final name = (room['name'] ?? '').toString();
    final avatars = [
      for (final a in (room['avatars'] is List ? room['avatars'] as List : const []))
        if (Api.absoluteUrl(a?.toString()) != null) Api.absoluteUrl(a.toString())!,
    ];
    // Yayın isim kartı (tür) varsa kendi renkleriyle; yoksa ilk etiket / oda türü.
    final cat = roomCategoryOf(tags.isNotEmpty ? tags.first : null);
    final tag = cat?.label ?? (tags.isNotEmpty ? tags.first : (isVideo ? (room['layout'] == 'live' ? tx('Canlı') : tx('Görüntülü')) : tx('Sohbet')));
    final tagColors = cat?.colors ?? (isVideo ? const [Color(0xFFFF9F0A), Color(0xFFFF9F0A)] : const [Color(0xFF16C25B), Color(0xFF16C25B)]);
    return Semantics(
      button: true,
      label: tx('{name}, {count} kişi', {'name': name, 'count': count}),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        // Kart içi ölçüler kart genişliğine oranlı; telefonun yazı boyutu ayarı etiketleri taşırmasın.
        child: MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling),
          child: LayoutBuilder(builder: (context, box) {
          final cw = box.maxWidth; // kart (görsel) genişliği; görsel karedir
          final inset = cw * 0.042;
          final tagH = (cw * 0.082).clamp(14.0, 20.0).toDouble();
          final av = (cw * 0.104).clamp(16.0, 26.0).toDouble();
          final shown = avatars.take(8).toList();
          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: cw,
              height: cw,
              // Bir kademe yükseltilmiş görünüm: altında gölge; aktif odada hafif sarı ışıma.
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                boxShadow: [
                  const BoxShadow(color: Color(0x8C000000), blurRadius: 10, offset: Offset(0, 6)),
                  if (count is num && count > 0) const BoxShadow(color: Color(0x40F2B92A), blurRadius: 8),
                ],
              ),
              // Aktif oda: ince uygulama sarısı çerçeve.
              foregroundDecoration: count is num && count > 0
                  ? BoxDecoration(borderRadius: BorderRadius.circular(10), border: Border.all(color: const Color(0xFFF2B92A), width: 1.3))
                  : null,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Stack(fit: StackFit.expand, children: [
                  const ColoredBox(color: Pal.surfaceHi),
                  if (image != null)
                    NetImg(image, box: Size.square(cw), fit: BoxFit.cover)
                  else
                    Center(child: Icon(isVideo ? Icons.videocam : Icons.graphic_eq, size: cw * 0.28, color: Pal.textDim)),
                  // Üstte ince ışık, altta koyulaşma: kabartma (yükseltilmiş) hissi.
                  const DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [Color(0x2EFFFFFF), Color(0x00FFFFFF), Color(0x00000000), Color(0x8C000000)],
                        stops: [0, 0.16, 0.55, 1],
                      ),
                    ),
                  ),
                  // Sol üst: oda türü, PK, "yükseliyor" — hepsi aynı koyu cam kapsül, ince uygulama sarısı çerçeve ve altın simge
                  // (rengarenk değil; tek tip, sade).
                  Positioned(
                    left: inset,
                    top: inset,
                    // Sağ üstteki çanta / kilit ile çakışmasın.
                    right: inset + (bags > 0 ? tagH * 1.9 : 0) + (room['locked'] == true ? tagH + 4 : 0) + 4,
                    child: Row(children: [
                      _glass(
                        tagH,
                        width: tagH * 1.3,
                        child: _gold(Icon(isVideo ? Icons.videocam_rounded : Icons.mic_rounded, size: tagH * 0.82, color: Colors.white)),
                      ),
                      if (room['inPk'] == true)
                        Padding(
                          padding: EdgeInsets.only(left: tagH * 0.22),
                          child: _glass(
                            tagH,
                            padding: EdgeInsets.symmetric(horizontal: tagH * 0.32),
                            child: _gold(Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(Icons.bolt_rounded, size: tagH * 0.72, color: Colors.white),
                              Text('PK', style: TextStyle(color: Colors.white, fontSize: tagH * 0.66, height: 1, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic)),
                            ])),
                          ),
                        ),
                      if (room['hot'] == true)
                        Flexible(
                          child: Padding(
                            padding: EdgeInsets.only(left: tagH * 0.22),
                            child: _glass(
                              tagH,
                              padding: EdgeInsets.symmetric(horizontal: tagH * 0.3),
                              child: _gold(Row(mainAxisSize: MainAxisSize.min, children: [
                                Icon(Icons.local_fire_department_rounded, size: tagH * 0.78, color: Colors.white),
                                if (cw >= 180)
                                  Flexible(
                                    child: Padding(
                                      padding: EdgeInsets.only(left: tagH * 0.1),
                                      child: Text(tx('Yükseliyor'),
                                          maxLines: 1,
                                          overflow: TextOverflow.clip,
                                          style: TextStyle(color: Colors.white, fontSize: tagH * 0.6, height: 1, fontWeight: FontWeight.w800)),
                                    ),
                                  ),
                              ])),
                            ),
                          ),
                        ),
                    ]),
                  ),
                  // Sağ üst: kilit ve şanslı çanta.
                  Positioned(
                    right: inset,
                    top: inset,
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      if (bags > 0) Image.asset('assets/images/lucky_pouch.webp', width: tagH * 1.9, height: tagH * 1.9),
                      if (room['locked'] == true) Padding(padding: const EdgeInsets.only(left: 4), child: Icon(Icons.lock, size: tagH, color: Pal.amber)),
                    ]),
                  ),
                  // Üye avatarları: sağa yaslı, %20 üst üste.
                  if (shown.isNotEmpty)
                    Positioned(
                      right: cw * 0.024,
                      bottom: inset + tagH + cw * 0.03,
                      width: av + av * 0.8 * (shown.length - 1),
                      height: av,
                      child: Stack(children: [
                        for (var i = 0; i < shown.length; i++)
                          Positioned(
                            left: av * 0.8 * i,
                            top: 0,
                            width: av,
                            height: av,
                            child: Container(
                              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 1.2), color: Pal.surfaceHi),
                              child: ClipOval(
                                child: NetImg(shown[i], box: Size.square(av), fit: BoxFit.cover),
                              ),
                            ),
                          ),
                      ]),
                    ),
                  // Sol alt: tür etiketi.
                  Positioned(
                    left: inset,
                    bottom: inset,
                    height: tagH,
                    child: Container(
                      constraints: BoxConstraints(maxWidth: cw * 0.55),
                      padding: EdgeInsets.symmetric(horizontal: tagH * 0.35),
                      decoration: BoxDecoration(gradient: LinearGradient(colors: tagColors), borderRadius: BorderRadius.circular(tagH * 0.28)),
                      // widthFactor 1: etiket yazıyı sarar (Container'ın alignment'ı en geniş hâline uzatırdı).
                      child: Center(widthFactor: 1, child: Text(tag, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white, fontSize: tagH * 0.72, height: 1.0, fontWeight: FontWeight.w700))),
                    ),
                  ),
                  // Sağ alt: dinleyici sayısı.
                  Positioned(
                    right: inset,
                    bottom: inset,
                    height: tagH,
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      Icon(Icons.bar_chart_rounded, size: tagH * 0.95, color: const Color(0xFFF2B92A), shadows: const [Shadow(color: Colors.black54, blurRadius: 3)]),
                      const SizedBox(width: 2),
                      Text('$count', style: TextStyle(color: Colors.white, fontSize: tagH * 0.82, height: 1.0, fontWeight: FontWeight.w800, shadows: const [Shadow(color: Colors.black54, blurRadius: 3)])),
                    ]),
                  ),
                ]),
              ),
            ),
            Expanded(
              child: Padding(
                padding: EdgeInsets.fromLTRB(cw * 0.036, 0, cw * 0.02, 0),
                child: Align(
                  alignment: const Alignment(-1, -0.25),
                  child: Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Pal.text, fontWeight: FontWeight.w800, fontSize: (cw * 0.082).clamp(13.0, 17.0).toDouble())),
                ),
              ),
            ),
          ]);
        }),
        ),
      ),
    );
  }
}
