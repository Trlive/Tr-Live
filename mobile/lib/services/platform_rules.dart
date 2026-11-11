import 'package:flutter/foundation.dart';

/// iPhone sürümü mü. App Store kuralı gereği iPhone'da uygulama dışından Coin satışı / yüklemesi gösterilmez
/// (bayi paneli, yükleme sıralaması). Coin iPhone'da hediye, görev, şanslı çanta gibi yollarla gelir.
bool get isIOS => !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;
