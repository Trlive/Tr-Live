import 'package:flutter/painting.dart';

/// Koltuk üstü hediye efekti (SVGA/PNG) için konum ve boyut bilgisi.
///
/// room_screen.dart'tan ayrıldı: 5357 satırlık bir dosyada bu küçük veri sınıfını
/// bulmak da, değiştirirken yanındaki 5000 satırı gözden geçirmek de zordu.
/// Veri sınıfı olduğu için en yalıtık parça: hiçbir ekran durumuna bağlı değil.

class SeatFx {
  final int id;
  final String url;
  final String format;
  final Offset center;
  final double diameter;
  final bool sound;
  SeatFx(this.id, this.url, this.format, this.center, this.diameter, {this.sound = false});
}
