import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'api.dart';
import 'local_music.dart';
import 'music_service.dart';

/// Çalma düzeni (şimdi çalıyor ekranındaki düğmeler).
enum PlayMode { all, one, shuffle }

/// Oda yetkilisinin telefonundaki "Müziklerim" listesini odaya sırayla çalar (Yoho akışı):
/// listeden bir şarkıya dokununca o çalar; bitince bu telefon sıradakini kendisi yükleyip çalar
/// (Tümü: sırayla, Tek: aynı şarkı, Karıştır: rastgele). Önceki / sonraki de buradan.
/// Listeyi çalan telefon odadan çıkarsa sunucudaki son şarkı biter ve müzik durur.
class RoomPlaylist {
  RoomPlaylist._() {
    MusicService.instance.state.addListener(_onState);
    mode.addListener(_prefetchNext); // çalma düzeni değişince sıradaki yeniden seçilir
  }
  static final RoomPlaylist instance = RoomPlaylist._();

  final ValueNotifier<PlayMode> mode = ValueNotifier<PlayMode>(PlayMode.all);
  /// Bu telefonun çaldığı (Müziklerim'deki) şarkının dosya yolu; null: liste bu telefondan çalınmıyor.
  final ValueNotifier<String?> currentPath = ValueNotifier<String?>(null);
  /// Şarkı yükleniyor (düğmeler kısa süre beklesin).
  final ValueNotifier<bool> busy = ValueNotifier<bool>(false);
  /// Odaya gönderilmekte olan şarkının yolu (listede küçük yükleniyor simgesi).
  final ValueNotifier<String?> loadingPath = ValueNotifier<String?>(null);

  String? _roomId;
  String? _remoteId; // sunucudaki şarkı kimliği (bu telefonun yüklediği)
  String? _lastTrackId;
  String? _lastStatus;
  final _rnd = Random();

  List<LocalTrack> get _list => LocalMusic.instance.tracks.value;

  int get _index => _list.indexWhere((t) => t.path == currentPath.value);

  /// Odaya girince / çıkınca.
  void bind(String? roomId) {
    if (roomId == _roomId) return;
    _roomId = roomId;
    currentPath.value = null;
    _remoteId = null;
    _plannedPath = null;
  }

  int _playGen = 0; // her şarkı seçimi artırır: eski (geç biten) yükleme sonucu yeni seçimi ezmesin
  bool get _starting => loadingPath.value != null;

  /// Şarkıyı odada çalar. DJ yükleme beklemez: şarkı telefondaki dosyadan hemen başlar; yükleme bitince odadakiler
  /// DJ'nin o anki konumundan dinlemeye başlar. Daha önce yüklenen şarkı yeniden yüklenmez.
  /// Yükleme sürerken başka şarkıya dokunulabilir (eskiden "yükleniyor" bitene kadar düğmeler kilitliydi → ağır hissediliyordu):
  /// yeni seçim eskisini geçersiz kılar, eski yükleme bitince sonucu yok sayılır.
  Future<void> playTrack(LocalTrack t) async {
    final room = _roomId;
    if (room == null || busy.value) return;
    final gen = ++_playGen;
    bool stale() => gen != _playGen || _roomId != room;
    busy.value = true; // yalnızca yerel başlatma sırasında (kısa)
    loadingPath.value = t.path;
    final prevPath = currentPath.value;
    final prevRemote = _remoteId;
    final ms = MusicService.instance;
    final cached = LocalMusic.instance.isUploaded(room, t);
    final previewing = !cached && await ms.startLocalPreview(t.path);
    busy.value = false;
    // Odadakiler DJ'nin o anki yerinden başlar; yükleme çok uzun sürdüyse (25 sn+) herkes şarkının başından başlar.
    int startPos() {
      final p = previewing ? ms.localPositionMs : 0;
      return p > 25000 ? 0 : p;
    }

    try {
      var id = await LocalMusic.instance.uploadToRoom(room, t);
      if (stale()) return; // bu arada başka şarkı seçildi: bu yüklemenin sonucu odaya yansıtılmaz
      var pos = startPos();
      ms.registerLocalFile(id, t.path);
      // Sunucu yanıtından önce soketten gelen yeni durum "başkası başka şarkı açtı" sanılmasın.
      _remoteId = id;
      currentPath.value = t.path;
      try {
        await Api.post('/api/rooms/$room/music/play', {'trackId': id, if (pos > 0) 'positionMs': pos});
      } on ApiException catch (e) {
        if (e.statusCode != 404) rethrow;
        // Sunucudaki kayıt silinmiş: bir kez yeniden yüklenir.
        LocalMusic.instance.forgetUpload(room, t);
        id = await LocalMusic.instance.uploadToRoom(room, t);
        if (stale()) return;
        pos = startPos();
        ms.registerLocalFile(id, t.path);
        _remoteId = id;
        currentPath.value = t.path;
        await Api.post('/api/rooms/$room/music/play', {'trackId': id, if (pos > 0) 'positionMs': pos});
      }
      if (stale()) return;
      ms.finishLocalPreview(t.path, id, restart: previewing && pos == 0);
      _remoteId = id;
      currentPath.value = t.path;
    } catch (e) {
      if (stale()) return;
      // Oda şarkıya geçmedi: önceki durum geri gelir, DJ telefonundaki önizleme durur.
      _remoteId = prevRemote;
      currentPath.value = prevPath;
      await ms.cancelLocalPreview(t.path);
      rethrow;
    } finally {
      busy.value = false;
      if (gen == _playGen) {
        loadingPath.value = null;
        _prefetchNext();
      }
    }
  }

  /// Sıradaki şarkı (karıştırmada önceden seçilir ki önceden yüklenen şarkı çalınsın).
  String? _plannedPath;

  /// Şarkı çalarken sıradaki arka planda sunucuya yüklenir: şarkı bitince bekleme olmadan hemen başlar.
  void _prefetchNext() {
    final room = _roomId;
    final list = _list;
    _plannedPath = null;
    if (room == null || list.length < 2 || currentPath.value == null || mode.value == PlayMode.one) return;
    final next = list[_nextIndex()];
    _plannedPath = next.path;
    // Önce bu şarkının çalmaya başlaması beklenir (iki yükleme aynı anda bant genişliğini bölmesin).
    Future<void>.delayed(const Duration(seconds: 1), () {
      if (_roomId == room && _plannedPath == next.path && currentPath.value != null) {
        unawaited(LocalMusic.instance.uploadToRoom(room, next).then((_) {}, onError: (_) {}));
      }
    });
  }

  /// Sıradaki: önceden seçilen (ve yüklenen) şarkı hâlâ listedeyse o, değilse çalma düzenine göre yenisi.
  LocalTrack _upcoming() {
    final list = _list;
    final planned = _plannedPath;
    if (planned != null && planned != currentPath.value) {
      for (final t in list) {
        if (t.path == planned) return t;
      }
    }
    return list[_nextIndex()];
  }

  Future<void> next() async {
    final list = _list;
    if (currentPath.value == null || list.isEmpty) {
      // Liste bu telefondan çalınmıyor: sunucudaki sıraya geç.
      if (_roomId != null) await Api.post('/api/rooms/$_roomId/music/next');
      return;
    }
    await playTrack(_upcoming());
  }

  Future<void> previous() async {
    final list = _list;
    if (list.isEmpty) return;
    final i = _index;
    await playTrack(list[i <= 0 ? list.length - 1 : i - 1]);
  }

  Future<void> stop() async {
    currentPath.value = null;
    _remoteId = null;
    _plannedPath = null;
    if (_roomId != null) await Api.post('/api/rooms/$_roomId/music/stop');
  }

  int _nextIndex() {
    final list = _list;
    final i = _index;
    if (mode.value == PlayMode.shuffle && list.length > 1) {
      var j = i;
      while (j == i) {
        j = _rnd.nextInt(list.length);
      }
      return j;
    }
    if (i < 0) return 0;
    return (i + 1) % list.length;
  }

  /// Bu telefonun çaldığı şarkı bitince (sunucu "durdu" der) sıradaki çalınır.
  void _onState() {
    if (_roomId == null || MusicService.instance.roomId != _roomId) {
      _lastTrackId = null;
      _lastStatus = null;
      return;
    }
    final s = MusicService.instance.state.value;
    final track = mapOf(s?['track']);
    final status = s?['status']?.toString();
    final ended = _lastStatus == 'playing' && _lastTrackId != null && _lastTrackId == _remoteId && (track == null || status == 'stopped');
    // Başka biri başka bir şarkı açtıysa liste bu telefondan çalınmıyordur.
    if (track != null && _remoteId != null && track['id'] != _remoteId) {
      currentPath.value = null;
      _remoteId = null;
    }
    _lastTrackId = track?['id']?.toString();
    _lastStatus = status;
    if (!ended || currentPath.value == null || busy.value || _starting) return;
    final list = _list;
    if (list.isEmpty) return;
    if (mode.value == PlayMode.one) {
      final i = _index;
      if (i >= 0) unawaited(playTrack(list[i]).catchError((_) {}));
    } else {
      unawaited(playTrack(_upcoming()).catchError((_) {}));
    }
  }
}
