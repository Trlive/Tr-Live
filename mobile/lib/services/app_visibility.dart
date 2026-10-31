import 'package:flutter/widgets.dart';

/// Uygulama şu an ekranda mı (ön planda mı). Arka plandayken gereksiz yoklamalar (periyodik sunucu sorguları)
/// yapılmasın diye servisler buna bakar → daha az internet ve pil.
/// "inactive" (bildirim perdesi çekildi, izin penceresi açık) ön plan sayılır.
class AppVisibility with WidgetsBindingObserver {
  AppVisibility._();
  static final AppVisibility instance = AppVisibility._();

  /// true: uygulama ekranda. Değişince dinleyenler haber alır.
  static final ValueNotifier<bool> foreground = ValueNotifier<bool>(true);

  static bool get isForeground => foreground.value;

  bool _inited = false;

  /// Uygulama açılırken bir kez çağrılır (main.dart).
  void init() {
    if (_inited) return;
    _inited = true;
    WidgetsBinding.instance.addObserver(this);
    final s = WidgetsBinding.instance.lifecycleState;
    if (s != null) foreground.value = _isFg(s);
  }

  static bool _isFg(AppLifecycleState s) => s == AppLifecycleState.resumed || s == AppLifecycleState.inactive;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    foreground.value = _isFg(state);
  }
}
