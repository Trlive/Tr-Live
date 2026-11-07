import 'package:flutter/material.dart';

import '../services/api.dart';
import 'net_image.dart';

/// Mikrofon (koltuk) emojisi: ilk üçü uygulamanın kendi hareketli görselleri; diğerleri Google'ın hareketli Noto
/// emojileri (CC BY 4.0), sunucu üzerinden bir kez indirilip telefonda saklanır. [mirror]: aynalanmış (ör. sağa öpücük).
class MicEmojiDef {
  final String? asset;
  final String? noto;
  final String char;
  final bool mirror;
  const MicEmojiDef.asset(this.asset, this.char)
      : noto = null,
        mirror = false;
  const MicEmojiDef.noto(this.noto, this.char, {this.mirror = false}) : asset = null;
}

/// Sıra önemli: numara (1'den başlar) sunucuya gönderilir; sunucudaki MIC_EMOJI_COUNT bu listenin uzunluğudur.
const List<MicEmojiDef> kMicEmojis = [
  MicEmojiDef.asset('assets/images/mic_emoji_1.webp', '😄'),
  MicEmojiDef.asset('assets/images/mic_emoji_2.webp', '😆'),
  MicEmojiDef.asset('assets/images/mic_emoji_3.webp', '😏'),
  MicEmojiDef.noto('1f618', '😘'),
  MicEmojiDef.noto('1f618', '😘', mirror: true), // öbür yöne öpücük
  MicEmojiDef.noto('1f60d', '😍'),
  MicEmojiDef.noto('1f970', '🥰'),
  MicEmojiDef.noto('1f602', '😂'),
  MicEmojiDef.noto('1f923', '🤣'),
  MicEmojiDef.noto('1f60e', '😎'),
  MicEmojiDef.noto('1f929', '🤩'),
  MicEmojiDef.noto('1f973', '🥳'),
  MicEmojiDef.noto('1f61c', '😜'),
  MicEmojiDef.noto('1f914', '🤔'),
  MicEmojiDef.noto('1f62d', '😭'),
  MicEmojiDef.noto('1f621', '😡'),
  MicEmojiDef.noto('1f631', '😱'),
  MicEmojiDef.noto('1f634', '😴'),
  MicEmojiDef.noto('1f44f', '👏'),
  MicEmojiDef.noto('1f64f', '🙏'),
  MicEmojiDef.noto('1f44b', '👋'),
  MicEmojiDef.noto('2764_fe0f', '❤️'),
  MicEmojiDef.noto('1f525', '🔥'),
  MicEmojiDef.noto('1f4af', '💯'),
];

int get kMicEmojiCount => kMicEmojis.length;

/// Görselin kenar boşluğu: koltuk dairesini tam kaplaması için çizim boyutu bu oranla büyütülür.
double micEmojiScale(int id) => id >= 1 && id <= kMicEmojis.length && kMicEmojis[id - 1].asset != null ? 1.06 : 1.14;

/// Emojinin hareketli görseli (bulunamazsa düz emoji karakteri).
class MicEmojiImage extends StatelessWidget {
  final int id;
  const MicEmojiImage({super.key, required this.id});

  @override
  Widget build(BuildContext context) {
    if (id < 1 || id > kMicEmojis.length) return const SizedBox.shrink();
    final d = kMicEmojis[id - 1];
    Widget fallback(BuildContext _, Object __, StackTrace? ___) => FittedBox(child: Text(d.char, style: const TextStyle(fontSize: 64)));
    Widget img;
    if (d.asset != null) {
      img = Image.asset(d.asset!, fit: BoxFit.contain, gaplessPlayback: false, errorBuilder: fallback);
    } else {
      final url = Api.absoluteUrl('/api/emoji/noto/${d.noto}');
      img = url == null ? fallback(context, '', null) : NetImg(url, fit: BoxFit.contain, box: const Size(160, 160), errorBuilder: fallback);
    }
    return d.mirror ? Transform.flip(flipX: true, child: img) : img;
  }
}
