import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../l10n/l10n.dart';
import 'app_theme.dart';
import 'video_grid.dart';

/// Koltuk düzeni seçici: sayı çipleri ve seçilen düzenin küçük önizlemesi.
class SeatLayoutPicker extends StatelessWidget {
  static const options = [2, 5, 8, 9, 12, 15, 20, 30];
  final int value;
  final ValueChanged<int> onChanged;
  const SeatLayoutPicker({super.key, required this.value, required this.onChanged});

  int get _cols => value <= 5 ? (value <= 2 ? 2 : (value == 4 ? 2 : 3)) : (value == 6 ? 3 : (value == 9 ? 3 : (value >= 30 ? 6 : (value >= 12 ? 5 : 4))));

  @override
  Widget build(BuildContext context) {
    final cols = _cols;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(tx('Koltuk düzeni'), style: TextStyle(fontWeight: FontWeight.w700)),
      const SizedBox(height: 8),
      Wrap(spacing: 8, runSpacing: 6, children: [
        for (final n in options)
          ChoiceChip(
            showCheckmark: false,
            avatar: Icon(Icons.event_seat, size: 16, color: n == value ? Pal.cyan : Pal.textDim),
            label: Text('$n'),
            selected: n == value,
            selectedColor: Pal.surfaceHi,
            side: BorderSide(color: n == value ? Pal.cyan : Pal.outline),
            onSelected: (_) => onChanged(n),
          ),
      ]),
      const SizedBox(height: 10),
      Center(
        child: SizedBox(
          width: 180,
          child: GridView.count(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisCount: cols,
            mainAxisSpacing: 4,
            crossAxisSpacing: 4,
            children: [
              for (var i = 0; i < value; i++)
                Container(
                  decoration: BoxDecoration(color: i == 0 ? Pal.cyan.withValues(alpha: 0.35) : Pal.surfaceHi, borderRadius: BorderRadius.circular(8), border: Border.all(color: Pal.outline)),
                  child: Icon(i == 0 ? Icons.star : Icons.event_seat, size: 14, color: i == 0 ? Pal.amber : Pal.textDim),
                ),
            ],
          ),
        ),
      ),
    ]);
  }
}

/// Bir koltuk satırı: koltukların yatay merkezleri ve çapı (ikisi de sahne genişliğinin oranı).
class SeatRowSpec {
  final List<double> xs;
  final double dia;
  /// İsteğe bağlı koltuk başına çap ([xs] ile aynı uzunlukta); verilmezse hepsi [dia].
  final List<double>? dias;
  const SeatRowSpec(this.xs, this.dia, {this.dias});
}

/// Bir mikrofon modunun yerleşimi (Yoho ölçüleri, ekran genişliğine oranla):
/// [topGap]: başlığın altından ilk satırdaki koltuğun üst kenarına uzaklık,
/// [pitch]: art arda iki satırın merkezleri arası uzaklık.
class SeatLayoutSpec {
  final double topGap;
  final List<SeatRowSpec> rows;
  final List<double> pitch;
  const SeatLayoutSpec(this.topGap, this.rows, this.pitch);
}

const _x1 = [0.5];
const _x2 = [0.323, 0.677];
const _x2Top = [0.417, 0.583];
const _x4a = [0.118, 0.372, 0.628, 0.882];
const _x4b = [0.100, 0.367, 0.633, 0.900];
const _x4c = [0.114, 0.371, 0.629, 0.886];
const _x5 = [0.083, 0.2915, 0.5, 0.7085, 0.917];
const _x6 = [0.075, 0.245, 0.415, 0.585, 0.755, 0.925];

/// Yoho ekran görüntülerinden ölçülen yerleşimler.
const Map<int, SeatLayoutSpec> seatLayouts = {
  2: SeatLayoutSpec(0.116, [SeatRowSpec(_x2, 0.141)], []),
  4: SeatLayoutSpec(0.116, [SeatRowSpec(_x2, 0.141), SeatRowSpec(_x2, 0.141)], [0.239]),
  5: SeatLayoutSpec(0.116, [SeatRowSpec(_x1, 0.141), SeatRowSpec(_x4a, 0.131)], [0.239]),
  6: SeatLayoutSpec(0.116, [SeatRowSpec(_x2, 0.141), SeatRowSpec(_x4a, 0.131)], [0.239]),
  8: SeatLayoutSpec(0.112, [SeatRowSpec(_x4b, 0.132), SeatRowSpec(_x4b, 0.132)], [0.289]),
  9: SeatLayoutSpec(0.067, [SeatRowSpec(_x1, 0.150), SeatRowSpec(_x4c, 0.132), SeatRowSpec(_x4c, 0.132)], [0.249, 0.231]),
  12: SeatLayoutSpec(0.104, [SeatRowSpec(_x2Top, 0.1025), SeatRowSpec(_x5, 0.1025), SeatRowSpec(_x5, 0.1025)], [0.181, 0.182]),
  15: SeatLayoutSpec(0.103, [SeatRowSpec(_x5, 0.1025), SeatRowSpec(_x5, 0.1025), SeatRowSpec(_x5, 0.1025)], [0.213, 0.212]),
  20: SeatLayoutSpec(0.103, [SeatRowSpec(_x5, 0.1025), SeatRowSpec(_x5, 0.1025), SeatRowSpec(_x5, 0.1025), SeatRowSpec(_x5, 0.1025)], [0.205, 0.205, 0.205]),
  // 30: Yoho ekran görüntüsünden (Ekim 2026) yeniden ölçüldü — daire 0,0937 · satır arası 0,165 · ilk satır üst kenarı başlığın 0,100 altı.
  30: SeatLayoutSpec(0.100, [SeatRowSpec(_x6, 0.0937), SeatRowSpec(_x6, 0.0937), SeatRowSpec(_x6, 0.0937), SeatRowSpec(_x6, 0.0937), SeatRowSpec(_x6, 0.0937)], [0.165, 0.165, 0.165, 0.165]),
};

/// Oda ekranının sabit ölçüleri (Yoho ekran görüntülerinden, ekran genişliğine oranla; dp sınırlarıyla).
/// Yalnızca ekran genişliğine bağlıdır: koltuğa oturmak, izleyici gelmesi, klavye, aile/favori rozetleri,
/// PK şeridi hiçbir ölçüyü değiştirmez.
class RoomGeom {
  final double w;
  const RoomGeom(this.w);

  /// Başlık 1. satır (oda kutusu, izleyiciler, •••, ⏻): durum çubuğunun hemen altında.
  double get row1H => (w * 0.093).clamp(34.0, 46.0).toDouble();
  /// Başlık 2. satırın üst kenarı (durum çubuğunun altından).
  double get row2Top => row1H + (w * 0.020).clamp(6.0, 10.0).toDouble();
  /// Başlık 2. satır (elmas, favori, aile, taç).
  double get row2H => (w * 0.046).clamp(17.0, 22.0).toDouble();
  /// Başlığın toplam yüksekliği (durum çubuğu hariç). Koltuk alanı tam bunun altından başlar.
  double get headerH => row2Top + row2H + 1;
  /// Alt bar yüksekliği; düğme merkezleri barın ortasında (Yoho: ekran altından genişliğin %6,1'i yukarıda).
  double get barH => (w * 0.122).clamp(46.0, 58.0).toDouble();
  /// Alt bar yuvarlak düğme çapı ve ortadaki hediye düğmesi.
  double get btn => (w * 0.084).clamp(32.0, 44.0).toDouble();
  double get giftBtn => (w * 0.094).clamp(36.0, 48.0).toDouble();
}

/// Koltuk dairesine her modda eklenen pay (sahne genişliğinin oranı). Merkezler aynı kalır, daire etrafına büyür;
/// içindeki "+" simgesi bu paydan etkilenmez.
// v2.38.2: Yoho ile yan yana ölçümde %1'lik pay daireleri Yoho'dan ~%9 büyük gösteriyordu; kaldırıldı (birebir ölçü).
const double seatCircleBoost = 0.0;

const _xbTop = [0.16, 0.5, 0.84];
const _xbSide = [0.08, 0.27, 0.73, 0.92];

/// Doğum günü modu (özel tasarım, 25 mikrofon). Koltuk sırası soldan sağa, yukarıdan aşağıya:
///  0 = oda sahibi (sol üst), 1 = doğum günü koltuğu (ortada büyük, taçlı), 2 = sağ üst,
///  ardından pastanın iki yanında 3 sıra × 4 koltuk, en altta 5'erli iki sıra.
/// v2.99.1: satır araları koltuk + ad satırı + boşluk sığacak şekilde yeniden hesaplandı (önceki aralıkta koltuk
/// numaraları alttaki koltuğun altında kalıyordu). Oda ekranı ayrıca en az "yarım koltuk + ad + yarım koltuk" aralığını
/// zorunlu tutar (bkz. RoomScreen._rowStep); küçük ekranda ölçek düşse de koltuklar üst üste binmez.
/// İlk satırın [dia] değeri yandaki küçük koltuklardır; ortadaki taçlı koltuk [dias] ile büyüktür.
const birthdayLayout = SeatLayoutSpec(0.22, [
  SeatRowSpec(_xbTop, 0.11, dias: [0.11, 0.15, 0.11]),
  SeatRowSpec(_xbSide, 0.095),
  SeatRowSpec(_xbSide, 0.095),
  SeatRowSpec(_xbSide, 0.095),
  SeatRowSpec(_x5, 0.092),
  SeatRowSpec(_x5, 0.092),
], [0.18, 0.166, 0.166, 0.175, 0.166]);

const kBirthdaySkin = 'birthday';
const kBirthdaySeats = 25;
/// Ortadaki taçlı doğum günü koltuğu (herkes oturabilir). 0 numara oda sahibine ayrılıdır.
const kBirthdaySeat = 1;

/// Bilinmeyen sayı gelirse en yakın büyük mod kullanılır. [skin] özel tasarım anahtarı (ör. 'birthday').
SeatLayoutSpec seatLayoutFor(int n, {String? skin}) {
  if (skin == kBirthdaySkin && n == kBirthdaySeats) return birthdayLayout;
  final exact = seatLayouts[n];
  if (exact != null) return exact;
  final keys = seatLayouts.keys.toList()..sort();
  for (final k in keys) {
    if (k >= n) return seatLayouts[k]!;
  }
  return seatLayouts[30]!;
}

/// Her satırdaki koltuk sayısı, yukarıdan aşağıya.
List<int> seatRows(int n) => [for (final r in seatLayoutFor(n).rows) r.xs.length];

/// Mikrofon modu küçük önizlemesi: oda zemini (tema renkleri) üstünde, odadaki yerleşimle aynı oranda mikrofon daireleri.
/// [colors] verilmezse gece mavisi zemin kullanılır.
class SeatModeThumb extends StatelessWidget {
  final int n;
  final List<Color>? colors;
  /// Özel tasarım (ör. [kBirthdaySkin]): yerleşimi o tasarımdan alır ve süslerini (şerit, pasta) çizer.
  final String? skin;
  const SeatModeThumb(this.n, {super.key, this.colors, this.skin});

  static const _night = [Color(0xFF101C52), Color(0xFF1D3580), Color(0xFF2B4FA6)];

  @override
  Widget build(BuildContext context) {
    final spec = seatLayoutFor(n, skin: skin);
    final birthday = identical(spec, birthdayLayout);
    final bg = colors == null || colors!.length < 2 ? _night : colors!;
    return LayoutBuilder(builder: (context, box) {
      final w = box.maxWidth;
      final h = box.maxHeight;
      // Koltuk alanının yüksekliği (genişliğe oranla) önizlemeye sığdırılır, dikeyde ortalanır.
      var span = spec.rows.first.dia;
      for (final p in spec.pitch) {
        span += p;
      }
      span += spec.rows.last.dia * 0.5 - spec.rows.first.dia * 0.5;
      final scale = ((h * 0.78) / (span * w)).clamp(0.0, 0.92);
      final sw = w * scale; // önizlemedeki "sahne genişliği"
      final ox = (w - sw) / 2;
      final oy = (h - span * sw) / 2;
      final dots = <Widget>[];
      var cy = oy + spec.rows.first.dia * sw / 2;
      final rowCy = <double>[];
      for (var r = 0; r < spec.rows.length; r++) {
        final row = spec.rows[r];
        rowCy.add(cy);
        for (var k = 0; k < row.xs.length; k++) {
          final x = row.xs[k];
          final d = ((row.dias?[k] ?? row.dia) * sw * 1.25).clamp(8.0, 40.0).toDouble();
          dots.add(Positioned(
            left: ox + x * sw - d / 2,
            top: cy - d / 2,
            width: d,
            height: d,
            child: Container(
              decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.30), border: Border.all(color: Colors.white.withValues(alpha: 0.55), width: 1)),
              child: Icon(Icons.mic, size: d * 0.55, color: Colors.white.withValues(alpha: 0.9)),
            ),
          ));
        }
        if (r < spec.pitch.length) cy += spec.pitch[r] * sw;
      }
      return Stack(children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: bg)),
          ),
        ),
        if (birthday && rowCy.length >= 4) ...[
          // Üstte altın kutlama şeridi, ortada pasta.
          Positioned(
            left: w * 0.2,
            right: w * 0.2,
            top: math.max(2.0, rowCy[0] - spec.rows.first.dia * sw * 1.6),
            height: (h * 0.06).clamp(4.0, 10.0).toDouble(),
            child: DecoratedBox(decoration: BoxDecoration(gradient: const LinearGradient(colors: [Color(0xFFC8901A), Color(0xFFFFE08A), Color(0xFFC8901A)]), borderRadius: BorderRadius.circular(3))),
          ),
          Positioned(
            left: 0,
            right: 0,
            top: rowCy[1] - 2,
            height: rowCy[3] - rowCy[1] + 4,
            child: FittedBox(fit: BoxFit.contain, child: const Text('🎂', style: TextStyle(fontSize: 40))),
          ),
        ],
        ...dots,
      ]);
    });
  }
}

/// Oda içinde "Mikrofon modu" penceresi (uygulama renkleri: koyu zemin + altın). Pencere açık kalır; seçim [onSelect]
/// ile uygulanır, istek modu [onRequestMode] ile değişir. İkisi de başarılıysa true döndürmelidir.
/// [video]: çoklu (görüntülü) yayın — 4/6/9/12 kişilik ızgara önizlemeleri. [colors]: oda teması (önizleme zemini).
/// Doğum günü modu: [onBirthday] verilirse (sesli oda, oda sahibi) modların sonunda "Doğum Günü" kartı çıkar; fiyatı /
/// hakkı [birthday] ile gelir (sunucudaki mic_skins kaydı: priceCoins, durationDays, ownedUntil). Karta dokununca pencere
/// kapanır ve [onBirthday] açılır (satın alma, isim yazma, uygulama). [birthdayActive]: oda şu an doğum günü modunda.
Future<void> showMicModeSheet(
  BuildContext context, {
  required int current,
  required bool requestMode,
  required Future<bool> Function(int n) onSelect,
  required Future<bool> Function(bool on) onRequestMode,
  bool video = false,
  List<Color>? colors,
  Future<Map<String, dynamic>?>? birthday,
  bool birthdayActive = false,
  VoidCallback? onBirthday,
}) {
  final modes = video ? kVideoGridModes : const [2, 5, 8, 9, 12, 15, 20, 30];
  final cur = current;
  final showBirthday = !video && onBirthday != null;
  bool isCur(int n) => n == cur && !birthdayActive;
  var req = requestMode;
  var busy = false;
  return showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (c) => StatefulBuilder(
      builder: (c, setS) {
        Future<void> pick(int n) async {
          if (busy || isCur(n)) return;
          if (n < cur) {
            final ok = await showDialog<bool>(
              context: c,
              builder: (d) => AlertDialog(
                backgroundColor: Pal.surface,
                title: Text(tx('Emin misin?'), style: const TextStyle(color: Pal.text, fontWeight: FontWeight.w700)),
                content: Text(tx('Mikrofon modunu değiştirdikten sonra, mikrofondaki bazı kullanıcılar otomatik olarak kaldırılacaktır. Geçiş yapmayı onaylıyor musunuz?'), style: const TextStyle(color: Pal.textDim)),
                actions: [
                  TextButton(onPressed: () => Navigator.pop(d, false), child: Text(tx('Vazgeç'), style: const TextStyle(color: Pal.textDim, fontWeight: FontWeight.w800))),
                  TextButton(onPressed: () => Navigator.pop(d, true), child: Text(tx('Onayla'), style: const TextStyle(color: Pal.cyan, fontWeight: FontWeight.w800))),
                ],
              ),
            );
            if (ok != true || !c.mounted) return;
          }
          setS(() => busy = true);
          final done = await onSelect(n);
          if (!c.mounted) return;
          if (done) {
            Navigator.of(c).pop(); // mod değişti: pencere kendiliğinden kapanır
            return;
          }
          setS(() => busy = false);
        }

        Future<void> toggleReq() async {
          if (busy) return;
          setS(() => busy = true);
          final done = await onRequestMode(!req);
          if (!c.mounted) return;
          setS(() {
            busy = false;
            if (done) req = !req;
          });
        }

        Widget card({required bool selected, required Widget thumb, required Widget label, required VoidCallback onTap, Widget? badge}) => GestureDetector(
              onTap: onTap,
              child: Column(children: [
                Expanded(
                  child: Stack(children: [
                    Positioned.fill(
                      child: Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: selected ? Pal.cyan : Pal.outline, width: selected ? 3 : 1),
                        ),
                        padding: const EdgeInsets.all(1),
                        child: ClipRRect(borderRadius: BorderRadius.circular(10), child: thumb),
                      ),
                    ),
                    if (selected)
                      const Positioned(top: 6, right: 6, child: CircleAvatar(radius: 12, backgroundColor: Pal.cyan, child: Icon(Icons.check, size: 17, color: Pal.onBright))),
                    if (badge != null) Positioned(left: 6, right: 6, bottom: 6, child: Center(child: badge)),
                  ]),
                ),
                const SizedBox(height: 6),
                label,
              ]),
            );

        Widget birthdayCard() => FutureBuilder<Map<String, dynamic>?>(
              future: birthday,
              builder: (c2, snap) {
                final skin = snap.data;
                final until = DateTime.tryParse('${skin?['ownedUntil'] ?? ''}')?.toLocal();
                final owned = until != null && until.isAfter(DateTime.now());
                final price = skin?['priceCoins'];
                final Widget? badge = birthdayActive
                    ? null
                    : (owned
                        ? _pill(tx('Hakkın var'), Pal.green, Colors.white)
                        : (price == null ? null : _pill('🪙 ${_compact(price)}', Pal.cyan, Pal.onBright)));
                return card(
                  selected: birthdayActive,
                  thumb: SeatModeThumb(kBirthdaySeats, colors: colors, skin: kBirthdaySkin),
                  badge: badge,
                  label: Text(tx('🎂 Doğum Günü'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.amber, fontWeight: FontWeight.w800, fontSize: 15)),
                  onTap: () {
                    if (busy) return;
                    Navigator.of(c).pop();
                    onBirthday!();
                  },
                );
              },
            );

        return SafeArea(
          top: false,
          child: ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            child: Container(
              color: Pal.surface,
              constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.78),
              child: Stack(children: [
                Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(colors: [Color(0xFF3A2C10), Pal.surfaceHi, Color(0xFF3A2C10)]),
                      border: Border(bottom: BorderSide(color: Pal.outline)),
                    ),
                    child: Text(video ? tx('Yayın modu') : tx('Mikrofon modu'), textAlign: TextAlign.center, style: const TextStyle(color: Pal.cyan, fontWeight: FontWeight.w800, fontSize: 19)),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 4),
                    child: Text(
                      tx('İpuçları: 1. Koltuk sayısını azaltırsan fazla koltuklardaki kullanıcılar dinleyiciye iner;\n2. İstek modu açıkken kullanıcılar mikrofona ancak yetkili onayıyla çıkar;'),
                      style: const TextStyle(color: Pal.textDim, fontSize: 13, fontWeight: FontWeight.w600, height: 1.35),
                    ),
                  ),
                  Flexible(
                    child: GridView.count(
                      shrinkWrap: true,
                      crossAxisCount: 3,
                      padding: const EdgeInsets.fromLTRB(14, 8, 14, 4),
                      mainAxisSpacing: 4,
                      crossAxisSpacing: 8,
                      childAspectRatio: 0.80,
                      children: [
                        for (final n in modes)
                          card(
                            selected: isCur(n),
                            thumb: video ? VideoGridThumb(n) : SeatModeThumb(n, colors: colors),
                            label: Text(video ? tx('{n} Kişi', {'n': n}) : tx('{n} Mikrofon', {'n': n}), style: TextStyle(color: isCur(n) ? Pal.cyan : Pal.text, fontWeight: FontWeight.w600, fontSize: 15)),
                            onTap: () => pick(n),
                          ),
                        if (showBirthday) birthdayCard(),
                      ],
                    ),
                  ),
                  InkWell(
                    onTap: toggleReq,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                      child: Row(children: [
                        Icon(req ? Icons.check_circle : Icons.radio_button_unchecked, color: req ? Pal.cyan : Pal.textDim, size: 24),
                        const SizedBox(width: 8),
                        Expanded(child: Text(tx('Mikrofonda olmak için istekte bulunmanız gerekiyor.'), style: const TextStyle(color: Pal.text, fontSize: 14))),
                      ]),
                    ),
                  ),
                ]),
                if (busy)
                  const Positioned.fill(
                    child: ColoredBox(
                      color: Color(0x55000000),
                      child: Center(child: CircleAvatar(radius: 28, backgroundColor: Pal.surfaceHi, child: SizedBox(width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 3, color: Pal.cyan)))),
                    ),
                  ),
              ]),
            ),
          ),
        );
      },
    ),
  );
}

Widget _pill(String text, Color bg, Color fg) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Text(text, maxLines: 1, style: TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.w800)),
    );

/// Büyük sayıları kısaltır (12500 → 12,5K) — fiyat rozetleri için.
String _compact(Object? v) {
  final n = num.tryParse('${v ?? ''}') ?? 0;
  String trim(double x) => x.toStringAsFixed(x >= 10 ? 0 : 1).replaceAll(RegExp(r'\.0$'), '');
  if (n >= 1000000) return '${trim(n / 1000000)}M';
  if (n >= 1000) return '${trim(n / 1000)}K';
  return n.toStringAsFixed(0);
}
