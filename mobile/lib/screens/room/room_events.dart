part of '../room_screen.dart';

/// Soket olayları: oda olaylarının ekrana uygulanması (koltuk, rol, sohbet, hediye, PK, müzik...).
extension _RoomEvents on _RoomScreenState {
  // ---------- Gerçek zamanlı olaylar ----------
  void _onEvent(Map<String, dynamic> e) {
    final type = e['type'];
    if (type == 'connected') {
      // Soket yeniden bağlandı: arada kaçan olaylar telafi edilir. Durum, oda aboneliği onaylandıktan SONRA (room_subscribed) alınır:
      // önce REST, sonra abonelik olsaydı ikisi arasında olan olaylar ne anlık görüntüde ne soketten gelirdi.
      // Onay gelmezse 10 sn sonra yine de alınır.
      _resyncAfterSubscribe = true;
      _resyncFallback?.cancel();
      _resyncFallback = Timer(const Duration(seconds: 10), () {
        if (!_resyncAfterSubscribe) return;
        _resyncAfterSubscribe = false;
        _resync();
      });
      return;
    }
    if (type == 'room_subscribed' && e['roomId'] == widget.roomId) {
      final snap = _snapSeq;
      _snapSeq = null; // tek seferlik karşılaştırma
      if (_resyncAfterSubscribe) {
        _resyncAfterSubscribe = false;
        _resyncFallback?.cancel();
        _resync();
      } else if (snap != null && e['seq'] is num && (e['seq'] as num).toInt() > snap) {
        // İlk girişte üye listesi REST ile alındıktan sonra, abonelik onaylanmadan önce oda olayı oldu: bize gelmedi.
        ErrorLog.add('Bağlantı · olay boşluğu', 'abonelik öncesi $snap→${e['seq']}');
        _resyncAfterGap();
      }
      return;
    }
    // Sunucu oda olaylarına sıra numarası verir; araya numara girdiyse bir olay kaçmıştır → oda durumu yeniden alınır.
    if (type == 'room_gap' && e['roomId'] == widget.roomId) {
      ErrorLog.add('Bağlantı · olay boşluğu', '${e['from']}→${e['to']}');
      _resyncAfterGap();
      return;
    }
    if (type == 'socket_closed') {
      // Sessizce ölen bağlantılar tanı kaydına yazılır (ne sıklıkta yaşandığı panelden görülebilsin).
      final why = e['reason']?.toString() ?? '';
      if (why == 'silent' || why == 'connect_timeout' || why == 'probe') ErrorLog.add('Bağlantı · soket', why);
      return;
    }
    if (type == 'error' && e['code'] == 'not_member' && e['roomId'] == widget.roomId) {
      _rejoin();
      return;
    }
    // Tek oda kuralı: başka odaya girdin / kendi odanı açtın (ör. başka cihazdan): bu oda ekranı kapanır, geri katılmaz.
    if (type == 'room_moved' && e['roomId'] == widget.roomId) {
      _exit(tx('Başka bir odaya geçtiğin için bu odadan çıktın.'));
      return;
    }
    if (type == 'mic_request_declined' && e['roomId'] == widget.roomId) {
      if (mounted) toast(context, _isLive ? tx('Yayıncı konuk isteğini şimdilik kabul etmedi.') : tx('Mikrofon isteğin kabul edilmedi.'));
      return;
    }
    // Konuk isteği kabul edildi: sormadan yayına bağlanır (kamera ve mikrofon açılır).
    if (type == 'mic_invite' && e['roomId'] == widget.roomId && e['requested'] == true && _isLive && !_onSeat) {
      if (mounted && !_takingMic) {
        toast(context, tx('Yayıncı konuk isteğini kabul etti, yayına bağlanıyorsun…'));
        _set(() {
          _camOn = true;
          _micOn = true;
        });
        _takeMic((e['seatIndex'] as num?)?.toInt(), true);
      }
      return;
    }
    if (type == 'mic_invite' && e['roomId'] == widget.roomId) {
      if (mounted && !_micInviteOpen && _members.every((m) => m['userId'] != Session.id || m['seatIndex'] == null)) {
        _micInviteOpen = true;
        final seat = (e['seatIndex'] as num?)?.toInt();
        showDialog<bool>(
          context: context,
          builder: (c) => AlertDialog(
            title: Text(tx('Mikrofon daveti')),
            content: Text(seat != null
                ? tx('{name} sizi mikrofona davet ediyor ({n}. koltuk).', {'name': e['fromName'] ?? tx('Oda yetkilisi'), 'n': seat + 1})
                : tx('{name} sizi mikrofona davet ediyor.', {'name': e['fromName'] ?? tx('Oda yetkilisi')})),
            actions: [
              TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tx('Reddet'))),
              FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tx('Mikrofona çık'))),
            ],
          ),
        ).then((ok) {
          _micInviteOpen = false;
          if (ok == true && mounted) _takeMic(seat, true);
        });
      }
      return;
    }
    if (type == 'pk_invite') {
      final pk = mapOf(e['pk']);
      if (pk != null && mounted && !_inviteOpen && mapOf(pk['b'])?['roomId'] == widget.roomId) {
        _inviteOpen = true;
        showPkInviteDialog(context, pk).whenComplete(() => _inviteOpen = false);
      }
      return;
    }
    if (type == 'room_game_state' || type == 'room_tek_state') return; // oyun balonu / penceresi kendisi dinler (RoomTekDock)
    // Sesli oda içi PK: durum (başladı / skor / bitti) ve 2 sn'de bir süre-skor güncellemesi.
    if (type == 'room_pk_state') {
      final pk = mapOf(e['pk']);
      if (pk == null || pk['roomId'] != widget.roomId) return;
      final prev = _roomPk;
      final st = pk['status'];
      // Oda küçültülmüşken (başka ekrandayken) animasyon / sonuç penceresi açılmaz.
      final visible = mounted && !RoomDock.minimized.value;
      if (st == 'preparing' || st == 'active') {
        // Biten turun sonucu sahnede birkaç saniye kalır: hemen ardından gelen yeni "Hazırlanıyor" turu, sonuç süresi
        // dolunca (aşağıdaki yeniden okuma ile) gelir. Tur başlatıldıysa beklemeden geçilir.
        final holding = prev != null && prev['status'] == 'finished' && prev['id'] != pk['id'] && _pkResultUntil != null && DateTime.now().isBefore(_pkResultUntil!);
        if (holding && e['started'] != true) return;
        _set(() => _roomPk = pk);
        // "Başla": herkeste 3-2-1 geri sayım, ardından VS çarpışması.
        if (e['started'] == true && visible) showRoomPkCountdown(context, stillVisible: () => mounted && !RoomDock.minimized.value);
      } else if (st == 'finished' && prev?['id'] == pk['id']) {
        // Sonuç: ~4 sn sahnede kalır, sonra yeni tur gelir; kazananların mikrofonunda gülen, kaybedenlerin
        // mikrofonunda ağlayan emoji oynar.
        _pkResultUntil = DateTime.now().add(const Duration(seconds: 4));
        _set(() => _roomPk = pk);
        _pkResultEmojis(pk);
        if (visible) showRoomPkResult(context, pk);
        Future.delayed(const Duration(seconds: 4), () {
          if (mounted && _roomPk?['id'] == pk['id']) _reloadRoomPk();
        });
      } else if (prev?['id'] == pk['id']) {
        _set(() => _roomPk = null);
      }
      return;
    }
    if (type == 'room_pk_tick') {
      if (_roomPk != null && _roomPk!['id'] == e['pkId']) {
        _set(() {
          _roomPk = {
            ..._roomPk!,
            'remainingSeconds': e['remainingSeconds'],
            'introSeconds': e['introSeconds'] ?? 0,
            'red': {...?mapOf(_roomPk!['red']), 'score': e['red']},
            'blue': {...?mapOf(_roomPk!['blue']), 'score': e['blue']},
          };
        });
      }
      return;
    }
    if (type == 'pk_tick') {
      if (_pk != null && _pk!['id'] == e['pkId']) {
        _set(() {
          final a = {...?mapOf(_pk!['a']), 'score': e['scoreA']};
          final b = {...?mapOf(_pk!['b']), 'score': e['scoreB']};
          _pk = {..._pk!, 'a': a, 'b': b, 'remainingSeconds': e['remainingSeconds']};
        });
      }
      return;
    }
    if (type == 'pk_state') {
      final pk = mapOf(e['pk']);
      if (pk != null && (mapOf(pk['a'])?['roomId'] == widget.roomId || mapOf(pk['b'])?['roomId'] == widget.roomId)) {
        final st = pk['status'];
        final wasActive = _pk?['id'] == pk['id'] && _pk?['status'] == 'active';
        _set(() => _pk = pk);
        // Davet kabul edilip PK başladı: çarpışma animasyonu (oda küçültülmüşken değil).
        if (st == 'active' && !wasActive && mounted && !RoomDock.minimized.value) showRoomPkStart(context, left: tx('BİZ'), right: tx('RAKİP'));
        if (st == 'finished' || st == 'declined' || st == 'cancelled') {
          Future.delayed(const Duration(seconds: 8), () {
            if (mounted && _pk?['id'] == pk['id'] && _pk?['status'] != 'active') _set(() => _pk = null);
          });
        }
      }
      return;
    }
    if (e['roomId'] != widget.roomId) return;
    switch (type) {
      case 'scoreboard_session':
        _onScoreboardSession(e);
        break;
      case 'room_scoreboard':
        _scores.clear();
        for (final x in listOf(e['scoreboard'])) {
          _scores[x['userId'].toString()] = x['coins'].toString();
        }
        _softRefresh();
        break;
      case 'room_chat_cleared':
        _applyChatClear(e['clearedAt']);
        break;
      case 'lucky_bag_new':
        final nb = mapOf(e['bag']);
        if (nb != null && e['roomId']?.toString() == widget.roomId) _set(() => _bags.add(nb));
        break;
      case 'lucky_bag_claimed':
        // Çantadan pay alan, odada uçan yazı gibi sağdan sola kayarak geçer.
        final claimer = mapOf(e['user']);
        if (claimer != null && (e['roomId'] == null || e['roomId']?.toString() == widget.roomId)) {
          _fly.add({'user': claimer, 'text': tx('şanslı çantadan {amount} Coin aldı 🪙', {'amount': fmtNumber(e['amount'])}), 'bagClaim': true});
        }
        _set(() {
          final i = _bags.indexWhere((b) => b['id'] == e['bagId']);
          if (i >= 0) {
            final byMe = mapOf(e['user'])?['id']?.toString() == Session.id;
            _bags[i] = {..._bags[i], 'claimed': e['claimed'], if (byMe) 'mine': (e['amount'] ?? '0').toString()};
            if (e['done'] == true) _bags.removeAt(i);
          }
        });
        break;
      case 'lucky_bag_ended':
        _set(() => _bags.removeWhere((b) => b['id'] == e['bagId']));
        break;
      case 'room_member_joined':
        final u = mapOf(e['user']);
        if (u != null) {
          final i = _members.indexWhere((m) => m['userId']?.toString() == u['id']?.toString());
          if (i < 0) {
            _set(() => _members.add({'userId': u['id'], 'role': 'user', 'microphone': false, 'seatIndex': null, 'user': u}));
          } else if (u['id']?.toString() != Session.id) {
            // Zaten listedeyse (yeniden giriş) görünümü tazelenir: çıkıp girerken değişen çerçeve hemen yansır.
            _set(() => _members[i] = {..._members[i], 'user': u});
          }
        }
        // Hayalet (SWIP) üye mikrofona çıkınca "sessiz" gelir: giriş şeridi gösterilmez.
        if (u != null && e['silent'] != true && u['id']?.toString() != Session.id && EffectPrefs.entranceFx) _entrance.add(u);
        // Sohbete "odaya girdi" satırı.
        if (u != null && e['silent'] != true) {
          _set(() {
            _messages.add({'id': 'join-${DateTime.now().microsecondsSinceEpoch}', 'join': true, 'user': u});
            if (_messages.length > 200) _messages.removeAt(0);
          });
          _scrollChatToEnd();
        }
        break;
      case 'room_member_updated':
        // Görünüm değişti (çerçeve, balon, mikrofon dalgası, fotoğraf): çıkıp girmeden hemen yansır.
        final nu = mapOf(e['user']);
        if (nu != null && nu['id']?.toString() == Session.id) {
          // Kendi görünümüm: gizli kullanıcıysam duyuru maskeli gelir; kendi gerçek hâlim listeden yeniden alınır.
          _loadMembers().catchError((_) {});
        } else if (nu != null) {
          _set(() {
            final i = _members.indexWhere((m) => m['userId']?.toString() == nu['id']?.toString());
            if (i >= 0) _members[i] = {..._members[i], 'user': nu};
            // Oda sahibi: oda kimliği sahibin kimliği olduğundan başlıktaki ID de yenilenir (sahip odada olmasa da).
            final r = _room;
            if (r != null && r['ownerId']?.toString() == nu['id']?.toString()) _room = {...r, 'owner': nu};
          });
        }
        break;
      case 'room_member_left':
        // Hayalet mod: kendi mikrofondan inişimiz başkaları için "ayrıldı" gibi duyurulur; kendi listemizden düşmeyiz.
        if (e['ghost'] == true && e['userId']?.toString() == Session.id) break;
        _set(() => _members.removeWhere((m) => m['userId'] == e['userId']));
        break;
      case 'room_seat_changed':
        _set(() => _applySeat(e['userId'].toString(), (e['seatIndex'] as num?)?.toInt(), e['microphone'] == true));
        // Listede olmayan biri koltuğa çıktıysa (ör. hayalet üye) üyeler yeniden alınır.
        if (e['microphone'] == true && !_members.any((m) => m['userId'] == e['userId'])) _loadMembers().catchError((_) {});
        break;
      case 'room_mic_queue':
        final before = _queue.toSet();
        _set(() => _queue = ((e['queue'] as List?) ?? const []).map((x) => x.toString()).toList());
        _queueTick.value++;
        // Yayıncı / yetkili: yeni konuk isteği geldiğinde kısa bildirim (ilk yüklemeden sonra; kişi başı 30 sn'de bir).
        if (_isLive && _canSeatManage && _queueLoaded) {
          final now = DateTime.now();
          for (final id in _queue.where((x) => !before.contains(x))) {
            final last = _guestToastAt[id];
            if (last != null && now.difference(last).inSeconds < 30) continue;
            _guestToastAt[id] = now;
            final m = _members.where((x) => x['userId']?.toString() == id).firstOrNull;
            final name = mapOf(m?['user'])?['displayName']?.toString();
            toast(context, tx('{v1} konuk olmak istiyor. ∞ düğmesinden kabul edebilirsin.', {'v1': name ?? tx('Bir izleyici')}));
          }
        }
        break;
      case 'room_seats_locked':
        _set(() => _room = {...?_room, 'lockedSeats': e['lockedSeats']});
      case 'room_seats_muted':
        final wasMuted = _seatMuted;
        _set(() => _room = {...?_room, 'mutedSeats': e['mutedSeats']});
        if (_seatMuted != wasMuted) {
          _syncPublish();
          toast(context, _seatMuted ? tx('Mikrofonun yetkili tarafından kapatıldı.') : tx('Mikrofonunun sesi açıldı.'));
        }
        break;
      case 'room_role_changed':
        _set(() {
          final i = _members.indexWhere((m) => m['userId'] == e['userId']);
          if (i >= 0) _members[i] = {..._members[i], 'role': e['role']};
          if (e['userId'] == Session.id) _me = {..._me, 'role': e['role']};
        });
        break;
      case 'room_message':
        // Temizlemeden önce yazılıp olayı geç gelen mesaj gösterilmez.
        if (_beforeClear(e['createdAt'])) break;
        if (!_messages.any((m) => m['id'] == e['id'])) {
          _set(() {
            _messages.add({'id': e['id'], 'user': e['user'], 'text': e['text'], 'createdAt': e['createdAt'], 'fly': e['fly'] == true, 'welcomeTo': e['welcomeTo']});
            if (_messages.length > 200) _messages.removeAt(0);
          });
          if (e['fly'] == true || e['welcomeTo'] != null) _fly.add(e);
          _scrollChatToEnd(force: mapOf(e['user'])?['id']?.toString() == Session.id);
        }
        break;
      case 'room_message_deleted':
        _set(() => _messages.removeWhere((m) => m['id'] == e['messageId']));
        break;
      case 'room_chat_muted':
        _set(() => _chatMuted = (e['minutes'] as num? ?? 0) > 0);
        toast(context, _chatMuted ? tx('Bu odada sohbette susturuldunuz.') : tx('Sohbet yasağınız kaldırıldı.'));
        break;
      case 'room_mic_emoji':
        final emUser = e['userId']?.toString();
        final emNo = (e['emoji'] as num?)?.toInt();
        if (emUser != null && emNo != null && emNo >= 1 && emNo <= kMicEmojiCount && emUser != Session.id) _showMicEmoji(emUser, emNo);
        break;
      case 'room_gift':
        if (e['roomTotal'] != null) {
          _room = {...?_room, 'totalDiamonds': e['roomTotal']};
          _softRefresh();
        }
        _flyGift(e);
        _luckyWin(e);
        break;
      case 'room_settings':
        if (e['seatCount'] != null && e['seatCount'] != _room?['seatCount']) {
          _addSystemMessage(tx('Oda sahibi yeni bir mikrofon moduna geçmiştir. Geçerli mikrofon konumu değiştirilecektir.'));
        }
        _set(() => _room = {
              ...?_room,
              'name': e['name'], 'tags': e['tags'], 'locked': e['locked'], 'chatEnabled': e['chatEnabled'],
              'theme': e['theme'], 'themeImageUrl': e['themeImageUrl'], 'scoreboardEnabled': e['scoreboardEnabled'], 'hidden': e['hidden'],
              if (e['seatCount'] != null) 'seatCount': e['seatCount'],
              if (e['micRequest'] != null) 'micRequest': e['micRequest'],
              if (e['lockedSeats'] != null) 'lockedSeats': e['lockedSeats'],
              if (e['announcement'] != null) 'announcement': e['announcement'],
              if (e.containsKey('coverUrl')) 'coverUrl': e['coverUrl'],
              if (e.containsKey('micSkin')) 'micSkin': e['micSkin'],
              if (e.containsKey('micSkinText')) 'micSkinText': e['micSkinText'],
            });
        break;
      case 'room_music_state':
        final ms = mapOf(e['state']);
        if (ms != null) MusicService.instance.apply(ms);
        break;
      case 'room_closed':
        _exit(tx('Oda kapatıldı.'));
        break;
      case 'room_kicked':
        // Atılan kişi bu odaya 24 saat giremez (süre sunucudan gelir; eski sunucuda süre yoktur).
        final hours = _asInt(e['hours']);
        _exit(hours != null && hours > 0 ? tx('Odadan çıkarıldınız. {h} saat bu odaya giremezsiniz.', {'h': hours}) : tx('Odadan çıkarıldınız.'));
        break;
      case 'room_blocked':
        _exit(tx('Bu odadan engellendiniz.'));
        break;
    }
  }

  void _applySeat(String userId, int? seat, bool mic) {
    final wasMuted = _seatMuted;
    final i = _members.indexWhere((m) => m['userId'] == userId);
    if (i >= 0) _members[i] = {..._members[i], 'seatIndex': seat, 'microphone': mic};
    if (userId == Session.id) {
      final changed = _me['microphone'] != mic;
      _me = {..._me, 'seatIndex': seat, 'microphone': mic};
      BackgroundService.instance.micChanged(mic);
      if (changed || _seatMuted != wasMuted) _syncPublish();
    }
  }
}
