part of '../room_screen.dart';

/// Ses/görüntü (LiveKit): bağlanma, yeniden deneme, yayın izni, konuşma göstergesi, kamera, gürültü engelleme.
extension _RoomLivekit on _RoomScreenState {
  /// Ses bağlantısı yoksa ve kurulmuyorsa yeniden kurmayı başlatır (her sinyalde ve soket yeniden bağlanınca çağrılır).
  /// Böylece ses, kullanıcı "Tekrar"a dokunmasa da kendiliğinden geri gelir.
  void _ensureAudio() {
    if (!mounted || _closing || !_joined) return;
    if (_lk == null && !_lkConnecting && !(_lkRetryTimer?.isActive ?? false)) _connectLivekit();
  }

  void _pauseVideo() {
    final room = _lk;
    if (_videoPaused || !_isVideo) return;
    _videoPaused = true;
    if (room == null) return;
    _unsubscribeRemoteVideo(room);
    final lp = room.localParticipant;
    if (lp != null && lp.isCameraEnabled()) _quiet(lp.setCameraEnabled(false));
  }

  /// Başkalarının görüntüsü arka planda indirilmez (ekranda görünmüyor; internet ve pil boşa gitmesin).
  void _unsubscribeRemoteVideo(lk.Room room) {
    for (final p in room.remoteParticipants.values.toList()) {
      for (final pub in p.videoTrackPublications.toList()) {
        if (pub.subscribed && _unsubbed.add(pub)) _quiet(pub.unsubscribe());
      }
    }
  }

  void _resumeVideo() {
    if (!_videoPaused) return;
    _videoPaused = false;
    _unsubbed.clear();
    final room = _lk;
    if (room == null) return;
    for (final p in room.remoteParticipants.values.toList()) {
      for (final pub in p.videoTrackPublications.toList()) {
        if (!pub.subscribed) _quiet(pub.subscribe());
      }
    }
    _syncPublish();
  }

  /// Ekranda LiveKit'ten gösterilen her şeyin özeti; değişmediyse oda yeniden çizilmez.
  String _lkSignature() {
    final r = _lk;
    if (r == null) return '-';
    final b = StringBuffer(r.connectionState.name);
    void add(lk.Participant p) {
      b
        ..write('|')
        ..write(p.identity)
        ..write(p.isSpeaking ? '+' : '-');
      for (final pub in p.videoTrackPublications) {
        b
          ..write(pub.sid)
          ..write(pub.muted ? 'm' : '')
          ..write(pub.track != null ? 't${identityHashCode(pub.track)}' : '');
      }
    }

    final local = r.localParticipant;
    if (local != null) add(local);
    for (final p in r.remoteParticipants.values) {
      add(p);
    }
    return b.toString();
  }

  /// Ses bağlantısını yeniden denemeyi planlar (tek zamanlayıcı: üst üste binen denemeler olmaz).
  void _scheduleLkRetry(Duration wait) {
    _lkRetryTimer?.cancel();
    _lkRetryTimer = Timer(wait, () {
      if (mounted && !_closing && _joined && _lk == null) _connectLivekit();
    });
  }

  /// "Tekrar" düğmesi: beklemeden yeniden dener.
  void _retryAudioNow() {
    _lkRetries = 0;
    _lkRetryTimer?.cancel();
    if (mounted) _set(() => _lkError = null);
    _connectLivekit();
  }

  /// Ses bağlantısını sunucudan alınan yeni anahtarla baştan kurar (ör. yayın izni uyuşmazlığında).
  void _refreshLivekit() {
    final r = _lk;
    _lkGen++;
    _lk = null;
    _lkPrevState = null;
    _lkCanPublish = null;
    if (r != null) {
      r.removeListener(_onLkChanged);
      _disposeLkListener();
      r.disconnect().whenComplete(() => r.dispose()).catchError((_) {});
    }
    _scheduleLkRetry(const Duration(milliseconds: 700));
  }

  /// Ses sunucusu bağlantısı koptu: sebebe göre davranılır. (Yeniden bağlanmayı [_onLkChanged] planlar.)
  void _onLkDisconnected(int gen, String? reason) {
    if (gen != _lkGen || !mounted || _closing) return;
    final why = reason ?? 'unknown';
    if (why != 'clientInitiated') ErrorLog.add('Bağlantı · ses sunucusu', 'koptu ($why)');
    if (why == 'duplicateIdentity') {
      // Aynı hesap başka bir cihazda bu odaya bağlandı. İki cihaz birbirini sürekli düşürmesin diye bu ekran kapanır
      // (üyelik diğer cihazda sürdüğü için sunucuya "çıktım" denmez).
      _lkRetryTimer?.cancel();
      _exit(tx('Hesabın başka bir cihazda bu odaya bağlandı.'));
      return;
    }
    // Sunucu bizi çıkardı / oda silindi: 60 sn'lik sinyal beklenmeden üyelik doğrulanır (oda kapandıysa ekran kapanır,
    // üyelik düştüyse yeniden katılınır).
    if (why == 'participantRemoved' || why == 'roomDeleted') _beatOnce(retry: false);
  }

  Future<void> _connectLivekit() async {
    if (_lk != null || _lkConnecting || _closing) return;
    _lkConnecting = true;
    _lkRetryTimer?.cancel();
    final gen = ++_lkGen;
    lk.Room? room;
    try {
      final t = await Api.post('/api/rooms/${widget.roomId}/livekit-token');
      final url = t['url'] as String?;
      final token = t['token'] as String?;
      if (url == null || url.isEmpty || token == null) throw ApiException(tx('Ses sunucusu yapılandırılmamış.'));
      await _loadNoisePref();
      await HeadsetAudio.instance.start(); // kulaklık izlenir; ses her zaman görüşme modunda, kulaklığa otomatik yönlenir
      // Uygulamanın kendi sesleri de (oda müziği, hediye sesleri) görüşme yoluna alınır: tek Bluetooth
      // bağlantısı kullanılır ve bu sesler yankı gidericinin referansına girer.
      await RoomAudio.enter();
      final saver = EffectPrefs.powerSave.value;
      room = lk.Room(roomOptions: lk.RoomOptions(
        adaptiveStream: true,
        dynacast: true,
        defaultAudioCaptureOptions: _RoomScreenState._audioOptions,
        // Ses: 64 kbps (LiveKit'in konuşma için önerdiği üst sınır; şarkı ve tiz sesler belirgin şekilde daha net.
        // 48'den 64'e çıkış yayıncı başına 16 kbps ek yük getirir — DTX sayesinde yalnızca konuşurken).
        // Şarj tüketimi modunda 32 kbps.
        // Sessizken neredeyse hiç veri gitmez (DTX).
        // "red" (yedekli ses) bilerek BELİRTİLMEDİ: bu SDK'nın eski sürümlerinde ayar ters çalışıyor (red: true yedekli
        // sesi kapatıyor; LiveKit Flutter hata kaydı #1271). Düzeltmeyi içeren sürümde varsayılan değer yedekli sesi
        // kendiliğinden açar; burada elle verilirse o sürümde tersine döner.
        defaultAudioPublishOptions: lk.AudioPublishOptions(encoding: lk.AudioEncoding(maxBitrate: saver ? 32000 : 64000), dtx: true),
        // Kamera 540p (varsayılan 720p): güzellik filtresi her kareyi telefonda işlediği için 720p orta sınıf telefonda
        // kare düşürür; 540p'de görüntü akıcı kalır. Şarj tüketimi modunda 360p (daha az ısınma ve şarj).
        defaultCameraCaptureOptions: lk.CameraCaptureOptions(
          params: saver ? lk.VideoParametersPresets.h360_169 : lk.VideoParametersPresets.h540_169,
        ),
        // Canlı (tek yayıncı, tam ekran) yayında aynı çözünürlükte daha yüksek bit hızı: hareketli görüntüde bulanıklık
        // ve kareleşme azalır. İzleyicinin interneti zayıfsa sunucu düşük katmanı gönderir (simulcast + dynacast).
        defaultVideoPublishOptions: _isLive && !saver
            ? lk.VideoPublishOptions(videoEncoding: lk.VideoEncoding(maxBitrate: 1300 * 1000, maxFramerate: 25))
            : lk.VideoPublishOptions(),
      ));
      final created = room;
      created.addListener(_onLkChanged);
      _disposeLkListener(); // önceki denemeden kalan dinleyici varsa bırakılır
      // Kopma sebebi (tanı kaydı; aynı hesap başka cihazda / sunucudan çıkarılma durumlarına özel davranış).
      final listener = created.createListener();
      listener.on<lk.RoomDisconnectedEvent>((e) => _onLkDisconnected(gen, e.reason?.name));
      // Oda sesi kapalıyken odaya giren biri mikrofona oturduğunda sesi bir an duyuluyordu: yeni iz
      // sunucudan geldiği anda çalmaya başlıyor, susturma ise Room'un genel "değişti" bildirimiyle
      // (iz hazır olduktan sonra) uygulanıyordu. Aradaki boşluk kadar ses sızıyordu.
      // Abonelik olayı izin kendisini verir: susturma artık ilk örnek çalmadan uygulanır.
      listener.on<lk.TrackSubscribedEvent>((e) {
        if (e.track is! lk.AudioTrack) return;
        if (!_roomMuted && !CallGuard.instance.inCall.value && !RoomAudio.systemSilent.value) return;
        try {
          e.track.mediaStreamTrack.enabled = false;
        } catch (_) {/* iz o anda kapanmış */}
      });
      _lkListener = listener;
      await created.connect(url, token);
      if (!mounted || _closing || gen != _lkGen) {
        created.removeListener(_onLkChanged);
        _disposeLkListener();
        await created.disconnect();
        await created.dispose();
        // Bağlanırken bağlantı yenileme istendi: yeni deneme hemen planlanır (yoksa ses bir sonraki sinyale kadar gelmezdi).
        if (mounted && !_closing && gen != _lkGen) _scheduleLkRetry(const Duration(milliseconds: 300));
        return;
      }
      _lk = created;
      _lkRetries = 0;
      _lkPrevState = created.connectionState;
      _lkCanPublish = created.localParticipant?.permissions.canPublish;
      if (_lkError != null) _set(() => _lkError = null);
      await _syncPublish();
      // Yapay zekâ gürültü azaltma: ses altyapısı artık hazır (bkz. Denoiser). Bu ekran için bir kez.
      if (!_denoiseStarted) {
        _denoiseStarted = true;
        unawaited(Denoiser.roomStarted());
      }
    } catch (e) {
      final failed = room;
      if (failed != null) {
        failed.removeListener(_onLkChanged);
        _disposeLkListener();
        failed.disconnect().whenComplete(() => failed.dispose()).catchError((_) {});
      }
      if (!mounted || _closing || gen != _lkGen) return;
      final code = e is ApiException ? e.statusCode : null;
      if (code == 404) {
        _exit(tx('Oda kapandı.')); // ses anahtarı istenirken oda kapanmış
        return;
      }
      // Sunucu bizi odanın üyesi saymıyor (üyelik düşmüş): yeniden katılınır; ses ardından yeniden denenir.
      if (code == 403) _rejoin();
      // İlk denemeler sessizdir: 2, 4, 8 sn sonra yeniden denenir. Üçü de olmazsa uyarı çıkar ("Tekrar" ile elle denenir)
      // ama arka planda 15 sn'de bir denemeye devam edilir: bağlantı gelince ses kendiliğinden döner. (Eskiden üç
      // denemeden sonra vazgeçiliyor, kullanıcı "Tekrar"a dokunana kadar ses gelmiyordu.)
      final n = _lkRetries++;
      if (n >= 2) {
        final raw = errorText(e);
        final msg = raw.contains('Timeout') ? tx('Ses sunucusuna ulaşılamadı. İnternetinizi kontrol edip Tekrar\'a dokunun.') : raw;
        if (_lkError != msg) _set(() => _lkError = msg);
        if (n == 2) ErrorLog.add('Bağlantı · ses sunucusu', 'bağlanılamadı: $raw');
      }
      _scheduleLkRetry(Duration(seconds: n < 3 ? (2 << n) : 15));
    } finally {
      _lkConnecting = false;
      if (mounted) _set(() {});
    }
  }

  /// Sonucu beklenmeyen ses işlemi: hata verse de sessizce geçilir.
  void _quiet(Future<Object?> f) => f.then((_) {}, onError: (_) {});

  /// Koltuktaysak mikrofonu (görüntülü odada kamerayı) yayına aç, değilsek kapat.
  /// Aynı anda tek eşitleme çalışır: üst üste gelen istekler (koltuk değişimi + izin + yeniden bağlanma) birbirini
  /// ezmez; süren eşitleme bitince son durum bir kez daha uygulanır.
  Future<void> _syncPublish() async {
    if (_syncing) {
      _syncAgain = true;
      return;
    }
    _syncing = true;
    try {
      do {
        _syncAgain = false;
        await _syncPublishOnce();
      } while (_syncAgain && mounted && !_closing);
    } finally {
      _syncing = false;
    }
  }

  Future<void> _syncPublishOnce() async {
    final room = _lk;
    if (room == null) return;
    for (var attempt = 0; attempt < 3; attempt++) {
      if (!identical(room, _lk)) return; // bağlantı bu arada yenilendi: yeni bağlantı kendi eşitlemesini yapar
      try {
        await room.localParticipant?.setMicrophoneEnabled(_onSeat && _micOn && !_seatMuted && !CallGuard.instance.inCall.value);
        if (_isVideo) {
          await room.localParticipant?.setCameraEnabled(_onSeat && _camOn && !_videoPaused);
          // Kayıtlı güzellik ayarları yayındaki kameraya uygulanır (kamera her açıldığında yeni takip gelir).
          if (_onSeat && _camOn && !_videoPaused) unawaited(Beauty.attachParticipant(room.localParticipant));
        }
        BackgroundService.instance.micChanged(_onSeat); // izin verildikten sonra servis "mikrofon" türüne geçer
        return;
      } catch (_) {
        // Yayın izni sunucudan birkaç yüz ms içinde gelir; kısa süre bekleyip tekrar dene.
        await Future.delayed(const Duration(milliseconds: 800));
      }
    }
    if (!mounted || _closing || !_onSeat || !identical(room, _lk)) return;
    // Koltuktayız ama ses sunucusu yayın izni vermiyor (izin güncellemesi bağlantı kopukken gitmiş olabilir): güncel
    // izni taşıyan yeni anahtarla bağlantı bir kez yenilenir (30 sn'de en fazla bir). Eskiden yalnızca hata gösteriliyor,
    // kullanıcı odadan çıkıp girene kadar mikrofonu açılmıyordu.
    final lp = room.localParticipant;
    final last = _lkPermFixAt;
    final now = DateTime.now();
    if (lp != null && !lp.permissions.canPublish && (last == null || now.difference(last) > const Duration(seconds: 30))) {
      _lkPermFixAt = now;
      ErrorLog.add('Bağlantı · ses sunucusu', 'yayın izni yok; bağlantı yeni anahtarla yenileniyor');
      _refreshLivekit();
      return;
    }
    toast(context, tx('Mikrofon açılamadı. Mikrofon/kamera iznini kontrol edin.'), error: true);
  }

  bool _isSpeaking(String userId) {
    final room = _lk;
    if (room == null) return false;
    final local = room.localParticipant;
    if (local != null && local.identity == userId) return local.isSpeaking;
    for (final p in room.remoteParticipants.values) {
      if (p.identity == userId) return p.isSpeaking;
    }
    return false;
  }

  Widget? _videoFor(String userId, {bool cover = false}) {
    final room = _lk;
    if (room == null) return null;
    lk.Participant? participant;
    final local = room.localParticipant;
    if (local != null && local.identity == userId) participant = local;
    for (final p in room.remoteParticipants.values) {
      if (p.identity == userId) participant = p;
    }
    if (participant == null) return null;
    for (final pub in participant.videoTrackPublications) {
      final track = pub.track;
      if (track != null && !pub.muted) return lk.VideoTrackRenderer(track as lk.VideoTrack, fit: cover ? lk.VideoViewFit.cover : lk.VideoViewFit.contain);
    }
    return null;
  }

  /// Güzellik / filtre penceresi (kendi kameramız açıkken).
  Future<void> _openBeauty() async {
    await Beauty.attachParticipant(_lk?.localParticipant);
    if (mounted) await showBeautySheet(context);
  }

  /// Görüntülü odada ön/arka kamera geçişi.
  Future<void> _flipCamera() async {
    final local = _lk?.localParticipant;
    if (local == null) return;
    for (final pub in local.videoTrackPublications) {
      final t = pub.track;
      if (t == null) continue;
      final next = _camPos == lk.CameraPosition.front ? lk.CameraPosition.back : lk.CameraPosition.front;
      try {
        await t.setCameraPosition(next);
        _camPos = next;
        unawaited(Beauty.attach(t)); // kamera çevrilince takip yenilenir
      } catch (e) {
        if (mounted) toast(context, tx('Kamera çevrilemedi: {v1}', {'v1': errorText(e)}), error: true);
      }
      return;
    }
  }

  /// Ses sunucusu olay dinleyicisini bırakır (oda her kapandığında / yeniden kurulduğunda).
  void _disposeLkListener() {
    final l = _lkListener;
    _lkListener = null;
    // dispose() bu SDK sürümünde Future döndürüyor olabilir; her iki durumda da derlenmesi için try/catch.
    try {
      l?.dispose();
    } catch (_) {/* zaten bırakılmış */}
  }

  static Future<void> _loadNoisePref() async {
    if (_RoomScreenState._noiseLoaded) return;
    _RoomScreenState._noiseLoaded = true;
    try {
      _RoomScreenState.noiseCancel = (await SharedPreferences.getInstance()).getBool('noise_cancel') ?? true;
    } catch (_) {}
  }

  Future<void> _setNoiseCancel(bool v) async {
    _RoomScreenState.noiseCancel = v;
    try {
      await (await SharedPreferences.getInstance()).setBool('noise_cancel', v);
    } catch (_) {}
    // Mikrofon izi yeni ayarla yeniden başlatılır (ses kısa bir an kesilir).
    final track = _lk?.localParticipant?.getTrackPublicationBySource(lk.TrackSource.microphone)?.track;
    if (track is lk.LocalAudioTrack) {
      try {
        await track.restartTrack(_RoomScreenState._audioOptions);
        if (track.muted) await track.disable(); // kapalı mikrofon yeniden başlatınca açılmasın
      } catch (_) {/* sonraki açılışta yeni ayar geçerli olur */}
    }
  }
}
