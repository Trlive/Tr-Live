part of '../room_screen.dart';

/// Mikrofon ve koltuk işlemleri: mikrofona çık/in, istekler, konuk daveti, boş koltuk, koltuk kilitleme/susturma.
extension _RoomMic on _RoomScreenState {
  Future<void> _lockSeat(int index, bool locked) async {
    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/seats/$index/lock', {'locked': locked}));
  }

  Future<void> _muteSeat(int index, bool muted) async {
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/seats/$index/mute', {'muted': muted}));
    if (r != null && mounted) toast(context, muted ? tx('Koltuk susturuldu.') : tx('Koltuğun sesi açıldı.'));
  }

  Future<void> _takeMic([int? seat, bool invited = false]) async {
    // İstek modu: yetkili olmayan kullanıcı koltuğa dokununca istek gönderir (davetle gelirse doğrudan çıkar).
    if (_isLive && !invited && !_onSeat && !_canSeatManage) {
      _guestTap(); // canlı yayında konukluk yalnızca istekle
      return;
    }
    if (_micRequest && !invited && !_onSeat && !_canSeatManage) {
      if (_inQueue) {
        toast(context, tx('İsteğin zaten gönderildi; yetkili onayını bekle.'));
      } else {
        await _toggleQueue();
      }
      return;
    }
    if (_takingMic) return; // aynı anda ikinci istek gitmesin (ör. iki kez gelen kabul)
    // Mikten mike geçiş: yeni koltuk hemen gösterilir (sunucu yanıtı beklenmez); olmazsa eski koltuğa döner.
    final prevSeat = _mySeatIndex;
    final switching = _onSeat && seat != null && prevSeat != null && seat != prevSeat;
    if (switching) _set(() => _applySeat(Session.id, seat, true));
    _takingMic = true;
    final Future<Map<String, dynamic>?> call = guard(context, () => Api.post('/api/rooms/${widget.roomId}/mic/take', {if (seat != null) 'seatIndex': seat}));
    final Map<String, dynamic>? res = await call.whenComplete(() => _takingMic = false);
    if (!mounted) return;
    if (res == null) {
      if (switching) _set(() => _applySeat(Session.id, prevSeat, true));
      return;
    }
    final seatIndex = (res['seatIndex'] as num?)?.toInt();
    _set(() => _applySeat(Session.id, seatIndex, true));
  }

  Future<void> _leaveMic() async {
    // Koltuktan iniş anında görünür ve mikrofon hemen kapanır (sunucu yanıtı beklenmez); olmazsa koltuğa geri dönülür.
    final prev = _mySeatIndex;
    final prevMic = _me['microphone'] == true;
    _set(() => _applySeat(Session.id, null, false));
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/mic/leave'));
    if (!mounted) return;
    if (r == null && prev != null && _mySeatIndex == null) _set(() => _applySeat(Session.id, prev, prevMic));
  }

  /// Yetkili: mikrofon isteklerini onayla (davet gönder) veya reddet.
  void _micRequestsSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => StatefulBuilder(
        builder: (c, setS) {
          final list = [for (final id in _queue) _members.where((m) => m['userId'] == id).firstOrNull].whereType<Map<String, dynamic>>().toList();
          return SafeArea(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Padding(padding: EdgeInsets.only(bottom: 6), child: Text(tx('Mikrofon istekleri'), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800))),
              if (list.isEmpty) Padding(padding: EdgeInsets.all(24), child: Text(tx('Bekleyen istek yok.'), style: TextStyle(color: Colors.white54))),
              Flexible(
                child: ListView(shrinkWrap: true, children: [
                  for (final m in list)
                    ListTile(
                      leading: UserAvatar(user: mapOf(m['user']), radius: 20),
                      title: UserName(user: mapOf(m['user'])),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(
                          tooltip: tx('Reddet'),
                          icon: const Icon(Icons.close, color: Colors.redAccent),
                          onPressed: () async {
                            final r = await guard(context, () => Api.delete('/api/rooms/${widget.roomId}/mic/queue/${m['userId']}'));
                            if (r != null && mounted) _set(() => _queue = ((r['queue'] as List?) ?? const []).map((x) => x.toString()).toList());
                            if (c.mounted) setS(() {});
                          },
                        ),
                        FilledButton(
                          onPressed: () async {
                            final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/members/${m['userId']}/mic-invite', {}));
                            if (r != null && mounted) toast(context, tx('Mikrofona davet gönderildi.'));
                          },
                          child: Text(tx('Onayla')),
                        ),
                      ]),
                    ),
                ]),
              ),
              const SizedBox(height: 8),
            ]),
          );
        },
      ),
    );
  }

  // ---------- Canlı yayın: konuk (misafir) istekleri ----------
  /// Alt bardaki ∞: izleyici istek gönderir / geri alır, konuk ayrılır, yayıncı istekleri yönetir.
  void _guestTap() {
    if (_canSeatManage) {
      _guestRequestsSheet();
      return;
    }
    if (_onSeat) {
      confirm(context, tx('Konukluktan ayrılıp izleyiciye dönülsün mü?'), action: tx('Ayrıl')).then((ok) {
        if (ok && mounted) _leaveMic();
      });
      return;
    }
    final host = mapOf(_bySeat[0]?['user']);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1C1C1F),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              UserAvatar(user: mapOf(_members.where((m) => m['userId']?.toString() == Session.id).firstOrNull?['user']), radius: 28),
              const Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Icon(Icons.all_inclusive, color: Color(0xFFFF4F9A), size: 30)),
              UserAvatar(user: host, radius: 28),
            ]),
            const SizedBox(height: 12),
            Text(_inQueue ? tx('İsteğin yayıncıya iletildi') : tx('Konuk olarak katıl'),
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: Colors.white)),
            const SizedBox(height: 6),
            Text(
              _inQueue
                  ? tx('Yayıncı kabul edince kameran ve mikrofonun açılarak yayına bağlanacaksın.')
                  : tx('Yayıncıya konuk olma isteği gönder. Kabul ederse kameran ve mikrofonun açılarak yayında sağdaki pencerede görünürsün.') +
                      '${_noFreeSeat ? tx('\nŞu an konuk yerleri dolu; yer açılınca kabul edebilir.') : ''}',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: Colors.white70),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: FilledButton(
                style: FilledButton.styleFrom(backgroundColor: _inQueue ? Colors.white12 : const Color(0xFFFF4F9A), shape: const StadiumBorder()),
                onPressed: () {
                  Navigator.pop(c);
                  _toggleQueue();
                },
                child: Text(_inQueue ? tx('İsteği geri al') : tx('İstek gönder'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            ),
          ]),
        ),
      ),
    );
  }

  /// Yayıncı / yetkili: konuk istekleri (kabul / reddet) ve yayındaki konuklar (çıkar).
  void _guestRequestsSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: const Color(0xFF1C1C1F),
      builder: (c) => ValueListenableBuilder<int>(
        valueListenable: _queueTick,
        builder: (c, _, __) => StatefulBuilder(
        builder: (c, setS) {
          final requests = [for (final id in _queue) _members.where((m) => m['userId'] == id).firstOrNull].whereType<Map<String, dynamic>>().toList();
          final guests = [for (var i = 1; i < _seatCount; i++) if (_bySeat[i] != null) _bySeat[i]!];
          final free = _freeGuestSeats;
          return SafeArea(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(tx('Konuk istekleri ({n})', {'n': requests.length}), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 2),
              Text(free > 0 ? tx('{free} konuk yeri boş', {'free': free}) : tx('Konuk yerleri dolu'), style: TextStyle(fontSize: 12, color: free > 0 ? Colors.white54 : Colors.orangeAccent)),
              if (requests.isEmpty) Padding(padding: EdgeInsets.all(20), child: Text(tx('Bekleyen istek yok. İzleyiciler alttaki ∞ düğmesinden istek gönderir.'), textAlign: TextAlign.center, style: TextStyle(color: Colors.white54))),
              Flexible(
                child: ListView(shrinkWrap: true, children: [
                  for (final m in requests)
                    ListTile(
                      leading: UserAvatar(user: mapOf(m['user']), radius: 20),
                      title: UserName(user: mapOf(m['user'])),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(
                          tooltip: tx('Reddet'),
                          icon: const Icon(Icons.close, color: Colors.redAccent),
                          onPressed: () async {
                            final r = await guard(context, () => Api.delete('/api/rooms/${widget.roomId}/mic/queue/${m['userId']}'));
                            if (r != null && mounted) _set(() => _queue = ((r['queue'] as List?) ?? const []).map((x) => x.toString()).toList());
                            if (c.mounted) setS(() {});
                          },
                        ),
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFFF4F9A)),
                          onPressed: _accepting.contains(m['userId'])
                              ? null
                              : () async {
                                  if (_noFreeSeat) {
                                    toast(context, tx('Konuk yerleri dolu. Önce bir konuğu çıkarın.'), error: true);
                                    return;
                                  }
                                  final id = m['userId'].toString();
                                  setS(() => _accepting.add(id));
                                  final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/members/$id/mic-invite', {}));
                                  // Konuk oturana (ya da 20 sn) kadar ikinci kez kabul gönderilmez.
                                  Future.delayed(const Duration(seconds: 20), () => _accepting.remove(id));
                                  if (r == null) _accepting.remove(id);
                                  if (r != null && mounted) toast(context, tx('Kabul edildi; konuk yayına bağlanıyor.'));
                                  if (c.mounted) setS(() {});
                                },
                          child: Text(_accepting.contains(m['userId']) ? tx('Bağlanıyor') : tx('Kabul et')),
                        ),
                      ]),
                    ),
                  if (guests.isNotEmpty) Padding(padding: EdgeInsets.fromLTRB(16, 10, 16, 2), child: Text(tx('Yayındaki konuklar'), style: TextStyle(fontWeight: FontWeight.w800, color: Colors.white70))),
                  for (final g in guests)
                    ListTile(
                      leading: UserAvatar(user: mapOf(g['user']), radius: 20),
                      title: UserName(user: mapOf(g['user'])),
                      trailing: TextButton(
                        onPressed: () async {
                          Navigator.pop(c);
                          await _moderate(g['userId'].toString(), 'mic-off');
                        },
                        child: Text(tx('Konukluktan çıkar'), style: TextStyle(color: Colors.redAccent)),
                      ),
                    ),
                ]),
              ),
              const SizedBox(height: 8),
            ]),
          );
        },
        ),
      ),
    );
  }

  /// Mikrofon modu (Yoho): pencere açık kalır; seçim anında uygulanır, istek modu alttaki seçenekle açılıp kapanır.
  Future<void> _micMode() async {
    try {
      final theme = (_room?['theme'] ?? 'default').toString();
      final canBirthday = _myRole == 'owner' && !_isLive && !_isVideo;
      await showMicModeSheet(
        context,
        current: _seatCount,
        requestMode: _micRequest,
        video: _isVideo,
        colors: theme == 'default' ? null : themeOf(theme).colors,
        // Doğum günü modu mikrofon modlarının içinde: yalnızca sesli odada oda sahibine (satın alma / uygulama).
        birthday: canBirthday ? _birthdaySkin() : null,
        birthdayActive: _birthday,
        onBirthday: canBirthday ? _openBirthday : null,
        onSelect: (n) async {
          final old = _seatCount;
          try {
            final r = await Api.patch('/api/rooms/${widget.roomId}', {'seatCount': n});
            final room = mapOf(r['room']);
            if (!mounted) return false;
            if (n != old && _room?['seatCount'] == old) {
              _addSystemMessage(tx('Oda sahibi yeni bir mikrofon moduna geçmiştir. Geçerli mikrofon konumu değiştirilecektir.'));
            }
            _set(() => _room = {...?_room, ...?room, 'seatCount': n});
            await _loadMembers(); // taşan koltuktakiler dinleyiciye inmiş olabilir
            return true;
          } catch (e) {
            if (mounted) toast(context, tx('Mikrofon modu değişmedi: {v1}', {'v1': errorText(e)}), error: true);
            return false;
          }
        },
        onRequestMode: (on) => _patchRoom({'micRequest': on}),
      );
    } catch (e) {
      if (mounted) toast(context, tx('Mikrofon modu penceresi açılamadı: {e}', {'e': e}), error: true);
    }
  }

  /// Oda içi kullanıcı kartı (Figma): büyük avatar, rozetler, Yakın Arkadaşlarım, Madalyalar, yetkiye göre işlem düğmeleri.
  /// Yönetim düğmeleri yalnızca yetkisi olana görünür; normal kullanıcı yalnızca Etiketle / Hediye / Takip görür.
  /// Kendi koltuğuma dokununca (Zula gibi): koltuğu sessize al / koltuktan kalk / iptal.
  void _selfSeatSheet(Map<String, dynamic> m, int index) {
    final user = mapOf(m['user']);
    final roleName = {'owner': tx('Oda Sahibi'), 'cohost': tx('Yardımcı'), 'admin': tx('Yönetici')}[(m['role'] ?? '').toString()] ?? tx('Üye');
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(
            leading: UserAvatar(user: user, radius: 22),
            title: Text((user?['displayName'] ?? '').toString(), style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('${tx('Koltuk')} #${index + 1} • $roleName'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.pop(c);
              Navigator.push(context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: Session.id)));
            },
          ),
          const Divider(height: 1),
          ListTile(
            leading: Icon(_micOn && !_seatMuted ? Icons.mic_off : Icons.mic),
            title: Text(_seatMuted ? tx('Koltuğun susturuldu') : (_micOn ? tx('Koltuğu sessize al') : tx('Sesi aç'))),
            onTap: () {
              Navigator.pop(c);
              if (_seatMuted) {
                toast(context, tx('Koltuğun yetkili tarafından susturuldu; mikrofonu açamazsın.'), error: true);
                return;
              }
              _set(() => _micOn = !_micOn);
              _syncPublish();
            },
          ),
          if (_isVideo)
            ListTile(
              leading: Icon(_camOn ? Icons.videocam_off : Icons.videocam),
              title: Text(_camOn ? tx('Kamerayı kapat') : tx('Kamerayı aç')),
              onTap: () {
                Navigator.pop(c);
                _set(() => _camOn = !_camOn);
                _syncPublish();
              },
            ),
          if (_isVideo && _camOn)
            ListTile(
              leading: const Icon(Icons.cameraswitch),
              title: Text(tx('Kamerayı çevir')),
              onTap: () {
                Navigator.pop(c);
                _flipCamera();
              },
            ),
          if (_isVideo && _camOn)
            ListTile(
              leading: const Icon(Icons.face_retouching_natural, color: Color(0xFFFF4F9A)),
              title: Text(tx('Güzellik ve filtre')),
              onTap: () {
                Navigator.pop(c);
                _openBeauty();
              },
            ),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.redAccent),
            title: Text(tx('Koltuktan Kalk'), style: TextStyle(color: Colors.redAccent)),
            onTap: () {
              Navigator.pop(c);
              _leaveMic();
            },
          ),
          ListTile(leading: const Icon(Icons.close), title: Text(tx('İptal')), onTap: () => Navigator.pop(c)),
        ]),
      ),
    );
  }

  /// Oyun penceresinin üstündeki şerit: odadaki mikrofon koltukları (oturan, konuşan, susturulmuş) ve mikrofon sırası.
  /// Oyun açıkken koltuklar kapanmasın diye canlı olarak buradan izlenir; avatara dokununca profil açılır.
  Widget _gameSeatStrip(BuildContext context) {
    final bySeat = <int, Map<String, dynamic>>{
      for (final m in _members)
        if (m['seatIndex'] != null) (m['seatIndex'] as num).toInt(): m,
    };
    final muted = _mutedSeats;
    final qn = _queue.length;
    final myPos = _queue.indexOf(Session.id);
    final canAsk = !_onSeat && !_isLive;
    final showQueue = qn > 0 || canAsk;
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0xFF1D160B), Color(0xFF120E07)]),
        border: Border(bottom: BorderSide(color: Color(0x55F2B92A))),
      ),
      child: Row(children: [
        Expanded(
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 6),
            itemCount: _seatCount,
            itemBuilder: (_, i) {
              final m = bySeat[i];
              if (m == null) {
                return SizedBox(
                  width: 44,
                  child: Center(
                    child: Container(
                      width: 32,
                      height: 32,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.06), border: Border.all(color: Colors.white.withValues(alpha: 0.2))),
                      child: Text('${i + 1}', style: const TextStyle(fontSize: 11, color: Colors.white38, fontWeight: FontWeight.w700)),
                    ),
                  ),
                );
              }
              final uid = m['userId'].toString();
              final speaking = _isSpeaking(uid);
              final isMuted = muted.contains(i);
              final user = mapOf(m['user']);
              return GestureDetector(
                onTap: () => _memberSheet(m),
                child: SizedBox(
                  width: 44,
                  child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        padding: const EdgeInsets.all(2),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: speaking ? Colors.greenAccent : Colors.transparent, width: 2),
                          boxShadow: speaking ? const [BoxShadow(color: Color(0x8869F0AE), blurRadius: 8)] : null,
                        ),
                        child: UserAvatar(user: user, radius: 15),
                      ),
                      if (isMuted)
                        const Positioned(right: -2, bottom: -2, child: CircleAvatar(radius: 7, backgroundColor: Colors.black87, child: Icon(Icons.mic_off, size: 9, color: Colors.redAccent))),
                    ]),
                    const SizedBox(height: 2),
                    Text('${i + 1}', style: TextStyle(fontSize: 9, color: speaking ? Colors.greenAccent : Colors.white54, fontWeight: FontWeight.w700)),
                  ]),
                ),
              );
            },
          ),
        ),
        if (showQueue)
          GestureDetector(
            onTap: () {
              if (_canSeatManage && _micRequest) {
                _micRequestsSheet();
              } else if (canAsk) {
                _toggleQueue();
              }
            },
            child: Container(
              margin: const EdgeInsets.only(right: 8, left: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(16),
                color: _inQueue ? const Color(0xFFF2B92A) : Colors.black45,
                border: Border.all(color: const Color(0xFFF2B92A)),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(_inQueue ? Icons.hourglass_bottom : Icons.front_hand, size: 15, color: _inQueue ? const Color(0xFF1C1405) : const Color(0xFFFFD54F)),
                const SizedBox(width: 4),
                Text(_inQueue && myPos >= 0 ? '${myPos + 1}/$qn' : '$qn', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, color: _inQueue ? const Color(0xFF1C1405) : const Color(0xFFFFD54F))),
              ]),
            ),
          ),
      ]),
    );
  }

  /// Boş koltuğa odadaki (mikrofonda olmayan) birini davet eder; kişi kabul edince o koltuğa oturur.
  void _inviteToSeat(int index) {
    final list = _members.where((m) => m['seatIndex'] == null && m['userId']?.toString() != Session.id).toList();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.65),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(tx('Mikrofona davet et'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            if (list.isEmpty) Padding(padding: const EdgeInsets.all(24), child: Text(tx('Davet edilecek kimse yok.'), style: const TextStyle(color: Colors.white54))),
            Flexible(
              child: ListView(shrinkWrap: true, children: [
                for (final m in list)
                  ListTile(
                    leading: UserAvatar(user: mapOf(m['user']), radius: 20),
                    title: UserName(user: mapOf(m['user'])),
                    trailing: const Icon(Icons.mic, color: Color(0xFFF2B92A)),
                    onTap: () async {
                      Navigator.pop(c);
                      final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/members/${m['userId']}/mic-invite', {'seatIndex': index}));
                      if (r != null && mounted) toast(context, tx('Mikrofona davet gönderildi.'));
                    },
                  ),
              ]),
            ),
          ]),
        ),
      ),
    );
  }

  void _emptySeatTap(int index, bool reserved, bool locked) {
    if (reserved) return;
    if (index == 0) {
      _takeMic(0); // oda sahibi kendi koltuğuna geri döner
    } else if (_canSeatManage) {
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (c) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            ListTile(leading: const Icon(Icons.mic), title: Text(tx('Bu koltuğa otur')), onTap: () { Navigator.pop(c); _takeMic(index); }),
            ListTile(leading: const Icon(Icons.person_add_alt_1), title: Text(tx('Mikrofona davet et')), onTap: () { Navigator.pop(c); _inviteToSeat(index); }),
            ListTile(
              leading: Icon(_mutedSeats.contains(index) ? Icons.mic : Icons.mic_off),
              title: Text(_mutedSeats.contains(index) ? tx('Koltuğun sesini aç') : tx('Koltuğu sustur')),
              onTap: () { Navigator.pop(c); _muteSeat(index, !_mutedSeats.contains(index)); },
            ),
            ListTile(
              leading: Icon(locked ? Icons.lock_open : Icons.lock),
              title: Text(locked ? tx('Koltuğun kilidini aç') : tx('Koltuğu kilitle')),
              onTap: () { Navigator.pop(c); _lockSeat(index, !locked); },
            ),
          ]),
        ),
      );
    } else if (locked) {
      toast(context, tx('Bu koltuk kilitli.'), error: true);
    } else {
      _takeMic(index);
    }
  }
}
