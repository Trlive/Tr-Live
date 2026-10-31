import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'background_service.dart';

class RoomRequest {
  final String roomId;
  final String name;
  final bool locked;
  final String? code;
  const RoomRequest({required this.roomId, this.name = 'Oda', this.locked = false, this.code});
}

/// Açık oda uygulama boyunca tek yerde yaşar; küçültülünce ses/görüntü kesilmeden arka planda kalır.
class RoomDock {
  RoomDock._();

  static final request = ValueNotifier<RoomRequest?>(null);
  static final minimized = ValueNotifier<bool>(false);

  /// Açık odanın fotoğrafı (küçültülmüş oda balonunda döner). Oda ekranı yükleyince/değişince yazar.
  static final cover = ValueNotifier<String?>(null);

  /// Açık odadaki rolüm (oda sahibi başka odaya geçerken uyarmak için).
  static String myRole = 'user';

  /// RoomScreen'in kayıt ettiği "odadan ayrıl" işlemi (küçültülmüş çubuktaki X bunu çağırır).
  static VoidCallback? exitHandler;

  static int _serial = 0;
  static int get serial => _serial;

  static bool get isOpen => request.value != null;

  // ---------- Ekranı açık tutma (yalnızca oda ekranı açıkken) ----------
  // Eskiden uygulamanın her sayfasında ekran hiç kararmıyordu (pil). Artık yalnızca oda tam ekran açıkken açık kalır;
  // oda küçültülünce / kapanınca telefonun kendi ekran zaman aşımı geçerli olur.
  static bool _hooked = false;
  static bool? _awake;

  static void _hookAwake() {
    if (_hooked) return;
    _hooked = true;
    request.addListener(_syncAwake);
    minimized.addListener(_syncAwake);
  }

  static void _syncAwake() {
    final on = request.value != null && !minimized.value;
    if (_awake == on) return;
    _awake = on;
    if (defaultTargetPlatform != TargetPlatform.android) return;
    const MethodChannel('trlive/device').invokeMethod<void>('keepScreenOn', on).catchError((_) {});
  }

  static void open(RoomRequest r) {
    _hookAwake();
    if (request.value?.roomId == r.roomId) {
      minimized.value = false;
      return;
    }
    _serial++;
    request.value = r;
    minimized.value = false;
    _syncAwake();
    BackgroundService.instance.roomOpened(r.name);
  }

  static void minimize() {
    if (isOpen) minimized.value = true;
  }

  static void expand() {
    if (isOpen) minimized.value = false;
  }

  static void close() {
    request.value = null;
    cover.value = null;
    minimized.value = false;
    myRole = 'user';
    BackgroundService.instance.roomClosed();
    exitHandler = null;
  }
}
