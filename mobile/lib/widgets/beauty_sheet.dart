import 'package:flutter/material.dart';

import '../l10n/l10n.dart';
import '../services/beauty.dart';

/// Güzellik penceresi: alttan açılır, arkadaki kamera görüntüsü değişikliği anında gösterir.
/// "Güzellik" sekmesi: pürüzsüzleştirme, aydınlatma, beyazlatma, pembelik. "Filtre" sekmesi: renk filtreleri.
Future<void> showBeautySheet(BuildContext context) async {
  await Beauty.load();
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black12,
    isScrollControlled: true,
    builder: (_) => const _BeautySheet(),
  );
  // Kapanınca son ayar telefona kaydedilir.
  await Beauty.update(Beauty.settings.value);
}

class _BeautySheet extends StatefulWidget {
  const _BeautySheet();

  @override
  State<_BeautySheet> createState() => _BeautySheetState();
}

const _pink = Color(0xFFFF4F9A);

class _BeautySheetState extends State<_BeautySheet> {
  int _tab = 0;
  String _sel = 'smooth';

  static const _items = [
    ('smooth', 'Pürüzsüz', Icons.face_retouching_natural),
    ('bright', 'Aydınlat', Icons.wb_sunny_outlined),
    ('white', 'Beyazlat', Icons.auto_awesome),
    ('rosy', 'Pembelik', Icons.favorite_border),
  ];

  static const _tones = [
    (0, 'Doğal', [Color(0xFFE9D7C9), Color(0xFFB99B86)]),
    (1, 'Sıcak', [Color(0xFFFFC371), Color(0xFFFF5F6D)]),
    (2, 'Soğuk', [Color(0xFF8EC5FC), Color(0xFF4364F7)]),
    (3, 'Canlı', [Color(0xFF00F5A0), Color(0xFFFF2D95)]),
    (4, 'Pembe', [Color(0xFFFFC3E1), Color(0xFFFF4F9A)]),
    (5, 'S/B', [Color(0xFFEEEEEE), Color(0xFF333333)]),
    (6, 'Nostalji', [Color(0xFFE6C79C), Color(0xFF8D6E63)]),
  ];

  double _value(BeautySettings s, String k) => switch (k) {
        'smooth' => s.smooth,
        'bright' => s.bright,
        'white' => s.white,
        _ => s.rosy,
      };

  BeautySettings _with(BeautySettings s, String k, double v) => switch (k) {
        'smooth' => s.copyWith(smooth: v),
        'bright' => s.copyWith(bright: v),
        'white' => s.copyWith(white: v),
        _ => s.copyWith(rosy: v),
      };

  Widget _tabBtn(String label, int i) => GestureDetector(
        onTap: () => setState(() => _tab = i),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(label, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: _tab == i ? Colors.white : Colors.white54)),
            const SizedBox(height: 4),
            AnimatedContainer(duration: const Duration(milliseconds: 200), width: _tab == i ? 18 : 0, height: 3, decoration: BoxDecoration(color: _pink, borderRadius: BorderRadius.circular(2))),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<BeautySettings>(
      valueListenable: Beauty.settings,
      builder: (context, s, _) {
        return Container(
          decoration: const BoxDecoration(color: Color(0xE6121016), borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Row(children: [
                  _tabBtn(tx('Güzellik'), 0),
                  _tabBtn(tx('Filtre'), 1),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () => Beauty.update(s.isOff ? BeautySettings.natural : const BeautySettings(), save: false),
                    icon: Icon(s.isOff ? Icons.auto_fix_high : Icons.restart_alt, size: 18, color: Colors.white70),
                    label: Text(s.isOff ? tx('Doğal güzellik') : tx('Sıfırla'), style: const TextStyle(color: Colors.white70)),
                  ),
                ]),
                ValueListenableBuilder<bool?>(
                  valueListenable: Beauty.supported,
                  builder: (_, ok, __) => ok == false
                      ? Padding(
                          padding: EdgeInsets.only(bottom: 6),
                          child: Text(tx('Bu cihazda güzellik filtresi kameraya bağlanamadı.'), style: TextStyle(fontSize: 12, color: Colors.orangeAccent)),
                        )
                      : const SizedBox.shrink(),
                ),
                const SizedBox(height: 6),
                if (_tab == 0) ...[
                  Row(children: [
                    SizedBox(width: 40, child: Text('${(_value(s, _sel) * 100).round()}', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, color: Colors.white))),
                    Expanded(
                      child: SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                          activeTrackColor: _pink,
                          inactiveTrackColor: Colors.white24,
                          thumbColor: Colors.white,
                          overlayColor: _pink.withValues(alpha: 0.2),
                          trackHeight: 3,
                        ),
                        child: Slider(value: _value(s, _sel), onChanged: (v) => Beauty.update(_with(s, _sel, v), save: false)),
                      ),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceAround, children: [
                    for (final (k, label, icon) in _items)
                      GestureDetector(
                        onTap: () => setState(() => _sel = k),
                        child: Column(children: [
                          AnimatedContainer(
                            duration: const Duration(milliseconds: 180),
                            width: 54,
                            height: 54,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withValues(alpha: 0.08),
                              border: Border.all(color: _sel == k ? _pink : (_value(s, k) > 0.01 ? Colors.white54 : Colors.white12), width: _sel == k ? 2 : 1),
                            ),
                            child: Icon(icon, color: _sel == k ? _pink : Colors.white, size: 26),
                          ),
                          const SizedBox(height: 6),
                          Text(tx(label), style: TextStyle(fontSize: 12, color: _sel == k ? Colors.white : Colors.white70, fontWeight: FontWeight.w700)),
                        ]),
                      ),
                  ]),
                ] else
                  SizedBox(
                    height: 96,
                    child: ListView(scrollDirection: Axis.horizontal, children: [
                      for (final (tone, label, colors) in _tones)
                        GestureDetector(
                          onTap: () => Beauty.update(s.copyWith(tone: tone), save: false),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            child: Column(children: [
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 180),
                                width: 60,
                                height: 60,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(16),
                                  gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
                                  border: Border.all(color: s.tone == tone ? _pink : Colors.transparent, width: 2.5),
                                ),
                                child: s.tone == tone ? const Icon(Icons.check, color: Colors.white) : null,
                              ),
                              const SizedBox(height: 6),
                              Text(tx(label), style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: s.tone == tone ? Colors.white : Colors.white70)),
                            ]),
                          ),
                        ),
                    ]),
                  ),
              ]),
            ),
          ),
        );
      },
    );
  }
}
