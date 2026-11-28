part of '../room_screen.dart';

/// Üst başlık ve alt çubuk: başlık satırları, menüler, oda sesi, mikrofon emojisi, hediye/şanslı kazanç efektleri, sayı tahtası.
extension _RoomBars on _RoomScreenState {
  /// Hediye atılınca hediyenin ikonu (png) gönderenden alıcıların koltuğuna uçar; ardından tam ekran animasyon oynar (Yoho).
  void _flyGift(Map<String, dynamic> e) {
    // Oda küçültülmüşken / uygulama arka plandayken animasyonlar donar; birikip açılışta yüzlercesi birden oynamasın.
    final ls = WidgetsBinding.instance.lifecycleState;
    if (RoomDock.minimized.value || (ls != null && ls != AppLifecycleState.resumed)) return;
    // Yük koruması: ekranda yeterince uçan ikon varsa ya da bellek sıkışıksa yeni süsleme eklenmez.
    final room = FxLoad.maxFlights - _flights.length;
    if (room <= 0 || !FxLoad.canDecorate) return;
    final gift = mapOf(e['gift']);
    final icon = Api.absoluteUrl(gift?['iconUrl'] as String?);
    final stage = _stageKey.currentContext?.findRenderObject();
    if (icon == null || stage is! RenderBox || !stage.attached) return;
    Offset? centerOfBox(GlobalKey? key) {
      final box = key?.currentContext?.findRenderObject();
      if (box is! RenderBox || !box.attached) return null;
      return stage.globalToLocal(box.localToGlobal(box.size.center(Offset.zero)));
    }

    Offset? centerOf(String? userId) => userId == null ? null : centerOfBox(_seatKeys[userId]);

    // Koltuktaki avatarın çapı (koltuk kutusu − kenar boşluğu).
    double? seatDiameter(String? userId) {
      final box = userId == null ? null : _seatKeys[userId]?.currentContext?.findRenderObject();
      if (box is! RenderBox || !box.attached) return null;
      return math.max(24.0, box.size.shortestSide - 8);
    }

    final from = centerOf(mapOf(e['sender'])?['id']?.toString()) ?? Offset(stage.size.width / 2, stage.size.height * 0.86);
    final receivers = e['receivers'] is List ? (e['receivers'] as List) : const [];
    final fresh = <GiftFlightData>[];
    final seatFx = <SeatFx>[];
    final anim = Api.absoluteUrl(gift?['animationUrl'] as String?);
    final animFormat = (gift?['animationFormat'] ?? '').toString();
    final onSeat = gift?['playMode'] == 'seat' && EffectPrefs.giftAnim;
    // Kalabalıkta ikonlar sadeleşir (parıltısız, daha az kopya).
    final lite = _flights.length >= 4 || receivers.length > 4;
    for (final r in receivers.take(math.min(20, room))) {
      final rid = mapOf(r is Map ? r['user'] : null)?['id']?.toString();
      // Mikrofonda değilse (odadaysa) seyirci sayısı rozetine uçar.
      final to = centerOf(rid) ?? (rid == null ? null : centerOfBox(_viewersKey));
      final qty = _asInt(r is Map ? r['quantity'] : null) ?? _asInt(e['quantity']) ?? 1;
      if (to != null) fresh.add(GiftFlightData(++_flightSeq, icon, from, to, qty < 1 ? 1 : qty, lite));
      // Yalnızca mikteki alıcının dairesinde oynar (seyirci rozetinde oynamaz).
      final seatAt = centerOf(rid);
      if (onSeat && anim != null && seatAt != null && _seatFx.length + seatFx.length < FxLoad.maxSeatFx) {
        seatFx.add(SeatFx(++_flightSeq, anim, animFormat, seatAt, seatDiameter(rid) ?? 56, sound: seatFx.isEmpty));
      }
    }
    if (fresh.isEmpty) return;
    _flights.addAll(fresh);
    _fxChanged();
    if (seatFx.isNotEmpty) {
      // İkon koltuğa varınca hediye o dairenin içinde oynar.
      Future.delayed(const Duration(milliseconds: 1300), () {
        if (!mounted || !EffectPrefs.giftAnim || !FxLoad.canDecorate) return;
        _seatFx.addAll(seatFx);
        final max = FxLoad.maxSeatFx;
        if (_seatFx.length > max) _seatFx.removeRange(0, _seatFx.length - max);
        _fxChanged();
        // Oynatıcı bitişi bildirmese de daire boş kalsın.
        final ids = {for (final f in seatFx) f.id};
        Future.delayed(const Duration(seconds: 15), () {
          if (!mounted) return;
          final before = _seatFx.length;
          _seatFx.removeWhere((x) => ids.contains(x.id));
          if (_seatFx.length != before) _fxChanged();
        });
      });
    }
  }

  /// Şanslı hediye kazancı odadaki herkese gösterilir (Yoho / Bigo): koltuğun üstünde "x5 +500", büyük çarpanda sahnenin
  /// ortasında patlama; x10 ve üstü sohbete de yazılır.
  void _luckyWin(Map<String, dynamic> e) {
    final l = mapOf(e['lucky']);
    if (l == null) return;
    final win = BigInt.tryParse('${l['win'] ?? 0}') ?? BigInt.zero;
    final best = (l['best'] as num?)?.toInt() ?? 0;
    if (win <= BigInt.zero || best <= 0) return;
    final gift = mapOf(e['gift']);
    final sender = mapOf(e['sender']);
    final name = (sender?['displayName'] ?? sender?['username'] ?? '').toString();
    final emoji = luckyEmojiOf(gift?['name']?.toString());
    if (best >= 10) {
      _addSystemMessage(
        tx('{emoji} {name}, {gift} ile x{best} kazandı: +{v1} Coin', {'emoji': emoji, 'name': name, 'gift': (gift?['name'] ?? '').toString(), 'best': best, 'v1': fmtNumber(win.toString())}),
        color: Pal.gold,
      );
    }
    final ls = WidgetsBinding.instance.lifecycleState;
    if (RoomDock.minimized.value || (ls != null && ls != AppLifecycleState.resumed) || !EffectPrefs.giftAnim || !FxLoad.canDecorate) return;
    final stage = _stageKey.currentContext?.findRenderObject();
    if (stage is! RenderBox || !stage.attached) return;
    final box = _seatKeys[sender?['id']?.toString()]?.currentContext?.findRenderObject();
    final at = (box is RenderBox && box.attached)
        ? stage.globalToLocal(box.localToGlobal(box.size.center(Offset.zero)))
        : Offset(stage.size.width / 2, stage.size.height * 0.62);
    // Aynı anda en fazla 6 efekt (düşük bellekli telefonda 3); büyük patlamalardan yalnızca biri (üst üste binmesin).
    final fx = LuckyWinFxData(++_flightSeq, at, best, win.toString(), name, emoji);
    if (fx.big) _luckyFx.removeWhere((x) => x.big);
    _luckyFx.add(fx);
    final maxLucky = FxLoad.tier == 0 ? 3 : 6;
    if (_luckyFx.length > maxLucky) _luckyFx.removeRange(0, _luckyFx.length - maxLucky);
    _fxChanged();
  }

  // ---------- Sayı tahtası (Yoho) ----------
  void _onScoreboardSession(Map<String, dynamic> e) {
    final sess = mapOf(e['session']);
    if (sess == null || !mounted) return;
    _sbKnown = true;
    if (e['action'] == 'start') {
      final by = mapOf(sess['startedBy']);
      final minutes = (e['minutes'] as num?)?.toInt() ?? 0;
      final rules = [
        if (sess['resetOnSeatLeave'] == true) tx('Kullanıcı Koltuktan Ayrıldığında'),
        if (sess['resetOnRoomLeave'] == true) tx('Kullanıcı Odadan Ayrıldığında'),
      ];
      _set(() {
        _sbSession = sess;
        _scores.clear();
      });
      _addSystemMessage(tx('{name}, {mode} için puan tablosunu etkinleştirdi.', {'name': by?['displayName'] ?? '', 'mode': scoreboardModeText(minutes)}) +
          (rules.isEmpty ? '' : ' ${tx('Sıfırlama kuralı')}: ${rules.join(', ')}.'));
    } else {
      final by = mapOf(e['by']);
      _set(() => _sbSession = null);
      _addSystemMessage(by == null ? tx('Sayım süresi doldu, puan tablosu kapandı.') : tx('{name} puan tablosunu kapattı!', {'name': by['displayName'] ?? ''}));
      showScoreboardResult(context, sess);
    }
  }

  Future<void> _stopScoreboard() async {
    if (!await confirmScoreboardStop(context) || !mounted) return;
    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/scoreboard/stop'));
  }

  void _openGifts([String? recipientId]) {
    // Görüntülü odada kendine hediye gönderilemez (sunucu reddeder): yayıncı kendini alıcı listesinde görmez ve
    // varsayılan alıcı olmaz. Sesli odada kendine hediye serbesttir, liste olduğu gibi kalır.
    final members = _isVideo ? _members.where((m) => m['userId'] != Session.id).toList() : _members;
    var target = recipientId ??
        (members.firstWhere((m) => m['role'] == 'owner', orElse: () => members.isNotEmpty ? members.first : <String, dynamic>{})['userId'] as String?);
    if (_isVideo && target == Session.id) target = null;
    showGiftSheet(context, roomId: widget.roomId, members: members, recipientId: target);
  }

  Widget _roomHeader(double w) {
    final g = RoomGeom(w);
    final top = MediaQuery.paddingOf(context).top;
    return SizedBox(
      height: top + g.headerH,
      child: Stack(clipBehavior: Clip.none, children: [
        Positioned(left: 10, right: 8, top: top, height: g.row1H, child: _headerRow1(g)),
        Positioned(left: 10, right: 8, top: top + g.row2Top, height: g.row2H, child: _headerRow2(g)),
      ]),
    );
  }

  /// Küçültülmüş oda balonunda dönen fotoğraf (oda fotoğrafı, yoksa sahibin fotoğrafı). Çizim bittikten sonra yazılır.
  void _syncDockCover(String? url) {
    if (RoomDock.cover.value == url) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) RoomDock.cover.value = url;
    });
  }

  Widget _headerRow1(RoomGeom g) {
    final h = g.row1H;
    final owner = _members.where((m) => m['role'] == 'owner');
    // Sahip odadan çıksa da (oda yardımcıyla açık kalır) fotoğraf ve kimlik odanın kayıtlı sahibinden gelir.
    final ownerUser = (owner.isEmpty ? null : mapOf(owner.first['user'])) ?? mapOf(_room?['owner']);
    final idUser = ownerUser;
    final name = (_room?['name'] ?? widget.initialName).toString();
    final cover = Api.absoluteUrl(_room?['coverUrl'] as String?);
    _syncDockCover(cover ?? Api.absoluteUrl(ownerUser?['avatarUrl'] as String?));
    final pic = h - 6;
    final pillH = (g.w * 0.0553).clamp(20.0, 26.0).toDouble();
    return Row(children: [
      Expanded(
        child: Align(
          alignment: Alignment.centerLeft,
          child: Material(
            color: Colors.black38,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: _roomInfo,
              child: SizedBox(
                height: h,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(3, 3, 10, 3),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: SizedBox(
                        width: pic,
                        height: pic,
                        child: cover != null
                            ? NetImg(cover, fit: BoxFit.cover, errorBuilder: (_, __, ___) => UserAvatar(user: ownerUser, radius: pic / 2))
                            : FittedBox(child: UserAvatar(user: ownerUser, radius: pic / 2)),
                      ),
                    ),
                    const SizedBox(width: 7),
                    Flexible(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, mainAxisSize: MainAxisSize.min, children: [
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          if (_room?['hidden'] == true) Padding(padding: const EdgeInsets.only(right: 3), child: Icon(Icons.visibility_off, size: h * 0.3)),
                          if (_room?['locked'] == true) Padding(padding: const EdgeInsets.only(right: 3), child: Icon(Icons.lock, size: h * 0.3, color: Colors.orangeAccent)),
                          // Oda adı alanı en fazla ekranın ~%36'sı; ad sığmazsa sürekli kayar (dışarıdaki kartta değişmez).
                          Flexible(
                            child: ConstrainedBox(
                              constraints: BoxConstraints(maxWidth: g.w * 0.36),
                              child: Marquee(
                              height: h * 0.36 * 1.3,
                              speed: 28,
                              shrinkWrap: true,
                              child: Text(name, maxLines: 1, softWrap: false, style: TextStyle(fontWeight: FontWeight.w800, fontSize: h * 0.36, height: 1.15)),
                              ),
                            ),
                          ),
                        ]),
                        // Oda kimliği = sahibinin güncel kimliği (özel ID varsa o, yoksa normal ID); renkli/özel olsa da burada
                        // düz yazı (ID:2147). Sahip kimliğini değiştirince başlık da hemen değişir (room_member_updated).
                        Text(
                          'ID:${roomIdOf(_room, idUser)}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: h * 0.27, height: 1.15, color: Colors.white70),
                        ),
                      ]),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
      const SizedBox(width: 6),
      _viewerClub(h * 0.62),
      // İzleyici sayısı; dokununca "İzleyiciler" listesi.
      glass(
        key: _viewersKey,
        onTap: _membersSheet,
        radius: pillH / 2,
        padding: EdgeInsets.symmetric(horizontal: pillH * 0.4),
        child: SizedBox(
          height: pillH,
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.person, size: pillH * 0.62),
            const SizedBox(width: 2),
            Text('${_members.length}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: pillH * 0.52)),
          ]),
        ),
      ),
      InkWell(
        customBorder: const CircleBorder(),
        onTap: _moreMenu,
        child: SizedBox(width: h * 0.95, height: h, child: Icon(Icons.more_horiz, size: h * 0.62)),
      ),
      InkWell(
        customBorder: const CircleBorder(),
        onTap: _exitMenu,
        child: SizedBox(width: h * 0.95, height: h, child: Icon(Icons.power_settings_new, size: h * 0.62)),
      ),
    ]);
  }

  Widget _headerRow2(RoomGeom g) {
    final h = g.row2H;
    // Oda elması: odaya gelen tüm hediyeler (oda kapatılıp açılınca sıfırlanmaz). Eski sunucuda koltuk sayaçlarının toplamı.
    var total = BigInt.tryParse('${_room?['totalDiamonds'] ?? ''}') ?? BigInt.zero;
    if (_room?['totalDiamonds'] == null) {
      for (final v in _scores.values) {
        total += BigInt.tryParse(v) ?? BigInt.zero;
      }
    }
    final isOwnerHere = _room?['ownerId']?.toString() == Session.id;
    final fs = h * 0.6;
    // Oda sahibinin ailesi (sunucu: room.ownerFamily). Sahibin ailesi yoksa çip görünmez.
    final ownerFamily = mapOf(_room?['ownerFamily']);
    final logo = Api.absoluteUrl(ownerFamily?['logoUrl'] as String?);
    // shrink: yalnızca Flexible içindeki çipte (aile adı daralabilsin); sınırsız genişlikte Flexible kullanılamaz.
    Widget chip(Widget child, {VoidCallback? onTap, Color? color, BoxBorder? border, bool shrink = false}) => InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(h / 2),
          child: Container(
            height: h,
            padding: EdgeInsets.symmetric(horizontal: h * 0.45),
            decoration: BoxDecoration(color: color ?? Colors.black38, borderRadius: BorderRadius.circular(h / 2), border: border),
            child: Row(mainAxisSize: MainAxisSize.min, children: [if (shrink) Flexible(child: child) else child]),
          ),
        );
    return Row(children: [
      chip(Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.diamond, size: h * 0.7, color: Colors.lightBlueAccent),
        const SizedBox(width: 3),
        Text(fmtNumber(total.toString()), style: TextStyle(fontSize: fs, fontWeight: FontWeight.w700, height: 1.0)),
      ])),
      // Hayalet mod etkinken kendime görünen işaret (mikrofona çıkınca herkes görür, işaret kalkar).
      if (Session.me.value?['ghostActive'] == true && !_onSeat) ...[
        const SizedBox(width: 6),
        chip(
          Text(tx('👻 Hayalet'), style: TextStyle(fontSize: fs, fontWeight: FontWeight.w800, color: const Color(0xFFC9B8FF), height: 1.0)),
          color: const Color(0xFF2A1A4A),
          onTap: () => toast(context, tx('Hayalet moddasın: odadakiler seni görmüyor. Mikrofona çıkarsan görünürsün.')),
        ),
      ],
      if (!isOwnerHere) ...[
        const SizedBox(width: 6),
        chip(
          Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(_fav ? Icons.star : Icons.star_border, size: h * 0.7, color: Colors.white),
            const SizedBox(width: 3),
            Text(_fav ? tx('Favoride') : tx('Favori'), style: TextStyle(fontSize: fs, fontWeight: FontWeight.w800, color: Colors.white, height: 1.0)),
          ]),
          onTap: _toggleFavorite,
          color: _fav ? Colors.orange.shade800 : Colors.orange,
        ),
      ],
      // Oda sahibinin ailesi; dokununca o ailenin sayfası açılır. Taç her durumda sağ kenarda kalır.
      if (ownerFamily != null && ownerFamily['id'] != null)
        Expanded(
          child: Align(
          alignment: Alignment.centerRight,
          child: chip(
            Row(mainAxisSize: MainAxisSize.min, children: [
              CircleAvatar(
                radius: h * 0.36,
                backgroundColor: Colors.amber,
                backgroundImage: logo != null ? NetImage(logo, targetW: NetImage.px(h * 0.72, MediaQuery.devicePixelRatioOf(context)), targetH: NetImage.px(h * 0.72, MediaQuery.devicePixelRatioOf(context))) : null,
                child: logo == null ? Icon(Icons.favorite, size: h * 0.45, color: Colors.black87) : null,
              ),
              const SizedBox(width: 4),
              Flexible(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: g.w * 0.2),
                  child: Text((ownerFamily['name'] ?? '').toString(), maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: fs, fontWeight: FontWeight.w800, fontStyle: FontStyle.italic, height: 1.0)),
                ),
              ),
            ]),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => FamilyPage(familyId: ownerFamily['id'].toString()))),
            border: Border.all(color: Colors.amber.withValues(alpha: 0.6)),
            shrink: true,
          ),
          ),
        )
      else
        const Spacer(),
      const SizedBox(width: 4),
      // Taç = Katkı Listesi (Yoho'daki "Haftalık" rozetinin yeri).
      InkWell(
        onTap: () => showContributions(context, widget.roomId),
        child: CrownIcon(size: h * 1.25),
      ),
    ]);
  }

  /// ••• : paylaş, oda bilgisi, şikâyet, küçült.
  void _moreMenu() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.share), title: Text(tx('Odayı paylaş')), onTap: () { Navigator.pop(c); _shareRoom(); }),
          ListTile(leading: const Icon(Icons.info_outline), title: Text(tx('Oda bilgisi')), onTap: () { Navigator.pop(c); _roomInfo(); }),
          if (_room?['ownerId']?.toString() != Session.id)
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: Text(tx('Odayı şikâyet et')),
              onTap: () { Navigator.pop(c); reportDialog(context, kind: 'room', roomId: widget.roomId); },
            ),
          ListTile(leading: const Icon(Icons.close_fullscreen), title: Text(tx('Küçült')), onTap: () { Navigator.pop(c); RoomDock.minimize(); }),
        ]),
      ),
    );
  }

  /// İzleyici kulübesi: odadaki en yüksek seviyeli ilk 3 kullanıcı, üst üste binen yuvarlak ikonlar (1. satırda, sabit boy).
  Widget _viewerClub(double size) {
    final ownerId = _room?['ownerId']?.toString();
    final list = _members.where((m) => m['userId']?.toString() != ownerId).toList()
      ..sort((a, b) => (((mapOf(b['user'])?['coinLevel']) as num?) ?? 0).compareTo(((mapOf(a['user'])?['coinLevel']) as num?) ?? 0));
    final top = list.take(3).toList();
    if (top.isEmpty) return const SizedBox.shrink();
    final step = size * 0.62;
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: InkWell(
        onTap: _membersSheet,
        borderRadius: BorderRadius.circular(size),
        child: SizedBox(
          width: step * (top.length - 1) + size,
          height: size,
          child: Stack(children: [
            for (var i = top.length - 1; i >= 0; i--)
              Positioned(
                left: step * i,
                top: 0,
                width: size,
                height: size,
                child: Container(
                  padding: const EdgeInsets.all(1.2),
                  decoration: const BoxDecoration(color: Colors.amber, shape: BoxShape.circle),
                  child: FittedBox(child: UserAvatar(user: mapOf(top[i]['user']), radius: size / 2)),
                ),
              ),
          ]),
        ),
      ),
    );
  }

  /// X düğmesi: Küçült / Çıkış (Figma).
  void _exitMenu() {
    showGeneralDialog<void>(
      context: context,
      barrierDismissible: true,
      barrierLabel: tx('Kapat'),
      barrierColor: Colors.black87,
      pageBuilder: (c, _, __) {
        Widget big(IconData icon, String label, VoidCallback onTap) => InkWell(
              onTap: onTap,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Container(width: 76, height: 76, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle), child: Icon(icon, size: 40, color: Colors.black)),
                const SizedBox(height: 8),
                Text(label, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Colors.white, decoration: TextDecoration.none)),
              ]),
            );
        // Material şart: InkWell / IconButton dokunma efektini en yakın Material'a çizer. showGeneralDialog kendisi
        // Material koymaz; eksikken her dokunuşta "Null check operator used on a null value" hatası atılıyordu
        // (hata kayıtlarındaki en sık hata: haftada 195 kez).
        return Material(
          type: MaterialType.transparency,
          child: SafeArea(
            child: Stack(children: [
              Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  big(Icons.close_fullscreen, tx('Küçült'), () {
                    Navigator.pop(c);
                    RoomDock.minimize();
                  }),
                  const SizedBox(height: 56),
                  big(Icons.power_settings_new, tx('Çıkış'), () {
                    Navigator.pop(c);
                    _onBack();
                  }),
                ]),
              ),
              Positioned(top: 10, right: 14, child: IconButton(onPressed: () => Navigator.pop(c), icon: const CircleAvatar(backgroundColor: Colors.white24, child: Icon(Icons.close, color: Colors.white)))),
            ]),
          ),
        );
      },
    );
  }

  // ---------- Alt satır: 6 yuvarlak düğme (Figma) ----------
  void _toggleRoomSound() {
    _set(() => _roomMuted = !_roomMuted);
    // Oda sesi kapalıyken oda müziği ve hediye / araç sesleri de susar.
    EffectPrefs.roomMuted.value = _roomMuted;
    _applyRoomSound();
    toast(context, _roomMuted ? tx('Oda sesi kapatıldı (yalnızca sizde).') : tx('Oda sesi açıldı.'));
  }

  /// Uzaktaki konuşmacıların sesini bu cihazda kapatır / açar.
  /// Oda sesi: kullanıcı kapattıysa ya da telefon araması sürüyorsa diğerlerinin sesi kapalı.
  void _applyRoomSound() {
    final room = _lk;
    if (room == null) return;
    // Telefonun sesi sonuna kadar kısıldıysa da (RoomAudio.systemSilent) konuşmalar tamamen susar.
    final on = !_roomMuted && !CallGuard.instance.inCall.value && !RoomAudio.systemSilent.value;
    for (final p in room.remoteParticipants.values) {
      for (final pub in p.audioTrackPublications) {
        // Aboneliği bitmiş yayının izi bırakılmıştır; ona dokunmak "MediaStreamTrack has been disposed" hatası verir.
        if (!pub.subscribed) continue;
        try {
          pub.track?.mediaStreamTrack.enabled = on && !_localMuted.contains(p.identity);
        } catch (_) {/* iz henüz hazır değil */}
      }
    }
  }

  /// Bir kişinin sesini yalnızca bu telefonda kapatır / açar.
  void _toggleLocalMute(String userId) {
    final muted = !_localMuted.remove(userId);
    if (muted) _localMuted.add(userId);
    _applyRoomSound();
    _set(() {});
    toast(context, muted ? tx('Bu kişinin sesi kapatıldı (yalnızca sizde).') : tx('Bu kişinin sesi açıldı.'));
  }

  /// PK sonucu: koltuktaki kazananlara gülen (1), kaybedenlere ağlayan emoji ~6 sn (beraberlikte yok).
  void _pkResultEmojis(Map<String, dynamic> pk) {
    final winner = pk['winner']?.toString();
    if (winner != 'red' && winner != 'blue') return;
    for (final m in _members) {
      final seat = (m['seatIndex'] as num?)?.toInt();
      if (seat == null) continue;
      final uid = m['userId'].toString();
      final team = pkTeamOfSeat(pk, seat, userId: uid);
      if (team == null) continue;
      _showMicEmoji(uid, team == winner ? 1 : _RoomScreenState.kCryEmoji, ms: 6000);
    }
  }

  void _showMicEmoji(String userId, int emoji, {int ms = 3200}) {
    _micEmojiTimers[userId]?.cancel();
    _set(() {
      _micEmoji[userId] = emoji;
      _micEmojiSeq[userId] = (_micEmojiSeq[userId] ?? 0) + 1;
    });
    _micEmojiTimers[userId] = Timer(Duration(milliseconds: ms), () {
      _micEmojiTimers.remove(userId);
      if (mounted) _set(() => _micEmoji.remove(userId));
    });
  }

  /// Koltuktayken alt bardaki emoji: hareketli emojiler (koltuğunda oynar). Altta sohbete yazı emojisi seçeneği.
  void _micEmojiSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: const Color(0xFF1E1B2E),
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(tx('Mikrofon emojisi'), style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 12),
            Flexible(
              child: GridView.count(
              shrinkWrap: true,
              crossAxisCount: 5,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: [
              for (var i = 1; i <= kMicEmojiCount; i++)
                InkWell(
                  borderRadius: BorderRadius.circular(16),
                  onTap: () async {
                    Navigator.pop(c);
                    _showMicEmoji(Session.id, i);
                    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/mic-emoji', {'emoji': i}));
                  },
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(color: Colors.white10, borderRadius: BorderRadius.circular(14)),
                    child: MicEmojiImage(id: i),
                  ),
                ),
            ]),
            ),
            const SizedBox(height: 10),
            if (_chatOpen)
              TextButton.icon(
                onPressed: () {
                  Navigator.pop(c);
                  _emojiSheet();
                },
                icon: const Icon(Icons.chat_bubble_outline, size: 18),
                label: Text(tx('Sohbete emoji yaz')),
              ),
          ]),
        ),
      ),
    );
  }

  void _emojiSheet() {
    const emojis = ['😀', '😂', '🥰', '😍', '😎', '🤩', '😘', '😭', '😡', '👍', '👏', '🙏', '🔥', '💯', '🎉', '❤️', '💎', '🌹', '🎁', '👑', '🎤', '🎶', '😴', '🤔', '😅', '🥳', '😇', '🤗', '😜', '🙌', '💪', '✨'];
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: GridView.count(
            shrinkWrap: true,
            crossAxisCount: 8,
            children: [
              for (final e in emojis)
                InkWell(
                  onTap: () {
                    Navigator.pop(c);
                    _set(() {
                      _inputOpen = true;
                      _chatCtl.text += e;
                      _chatCtl.selection = TextSelection.collapsed(offset: _chatCtl.text.length);
                    });
                  },
                  child: Center(child: Text(e, style: const TextStyle(fontSize: 26))),
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// Alt bar (Yoho ölçüleri): düğmeler ekran genişliğinin %14,35'i aralıkla, merkezleri sabit.
  /// Mikrofonda değilken: "Selam..." yazı kutusu + hediye, mesajlar, oyun, menü.
  /// Mikrofondayken: sohbet, mikrofon, emoji, hediye, mesajlar, oyun, menü.
  Widget _bottomBar() {
    return LayoutBuilder(builder: (context, box) {
      final w = box.maxWidth;
      // Yoho ölçüleri: düğme çapı genişliğin %8,4'ü (hediye %9,4), merkezler barın ortasında.
      final g = RoomGeom(w);
      final d = g.btn;
      final barH = g.barH;
      Widget at(double cx, Widget child, {double? size}) {
        final sz = size ?? d;
        return Positioned(left: cx * w - sz / 2, top: (barH - sz) / 2, width: sz, height: sz, child: child);
      }

      Widget circle(IconData icon, String tip, VoidCallback? onTap, {Color? color}) => Tooltip(
            message: tip,
            child: Material(
              color: Colors.black.withValues(alpha: 0.32),
              shape: CircleBorder(side: BorderSide(color: Colors.white.withValues(alpha: 0.10))),
              child: InkWell(customBorder: const CircleBorder(), onTap: onTap, child: Icon(icon, color: color ?? Colors.white, size: d * 0.52)),
            ),
          );

      final gift = Tooltip(
        message: tx('Hediye gönder'),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: _members.isEmpty ? null : () => _openGifts(),
          child: Container(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF8B5CF6), Color(0xFF6366F1), Color(0xFF38BDF8)]),
              boxShadow: [BoxShadow(color: Color(0x667C3AED), blurRadius: 10)],
            ),
            child: Icon(Icons.redeem, color: Colors.white, size: g.giftBtn * 0.54),
          ),
        ),
      );
      final mail = ValueListenableBuilder<int>(
        valueListenable: Inbox.unread,
        builder: (_, n, __) => Badge(
          isLabelVisible: n > 0,
          label: Text('$n'),
          offset: const Offset(-2, 2),
          // Yoho: alttan açılan "Sohbet" penceresi; oda arkada çalışmaya devam eder.
          child: circle(Icons.mail_outline, tx('Mesajlar'), () => showInboxSheet(context)),
        ),
      );
      // Oda sesi (yalnızca bu cihazda): konuşanlar, müzik ve hediye sesleri. Oyunlar araçlar menüsünde.
      final sound = circle(_roomMuted ? Icons.volume_off : Icons.volume_up, _roomMuted ? tx('Oda sesini aç') : tx('Oda sesini kapat'), _toggleRoomSound,
          color: _roomMuted ? Colors.redAccent : null);
      final menu = circle(Icons.grid_view_rounded, tx('Oda araçları'), _openTools);
      final micBtn = GestureDetector(
        // Canlı yayında yayıncı uzun basarak yanlışlıkla yayın koltuğundan inmesin.
        onLongPress: _isLive && _myRole == 'owner' ? null : _leaveMic,
        child: circle(_micOn && !_seatMuted ? Icons.mic : Icons.mic_off, tx('Mikrofon (uzun bas: mikrofondan in)'), () {
          if (_seatMuted) {
            toast(context, tx('Koltuğun yetkili tarafından susturuldu; mikrofonu açamazsın.'), error: true);
            return;
          }
          _set(() => _micOn = !_micOn);
          _syncPublish();
        }, color: _micOn && !_seatMuted ? Colors.white : Colors.redAccent),
      );

      // Canlı (tekli) görüntülü yayın alt barı (Figma): sohbet · PK · mikrofon · ∞ konuk · hediye · menü.
      if (_isLive) {
        final pkFree = _pk == null || !['pending', 'active'].contains(_pk!['status']);
        final guestBtn = Badge(
          isLabelVisible: _canSeatManage && _queue.isNotEmpty,
          label: Text('${_queue.length}'),
          offset: const Offset(-2, 2),
          child: circle(
            Icons.all_inclusive,
            _canSeatManage ? tx('Konuk istekleri') : (_onSeat ? tx('Konukluktan ayrıl') : (_inQueue ? tx('Konuk isteğin gönderildi') : tx('Konuk ol'))),
            _guestTap,
            color: _inQueue || (_onSeat && !_canSeatManage) ? const Color(0xFFFF4F9A) : null,
          ),
        );
        final pkBtn = Tooltip(
          message: 'PK',
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: () => pkFree ? showPkChallengeSheet(context, roomId: widget.roomId) : toast(context, tx('Zaten bir PK sürüyor.'), error: true),
            child: PkLogo(size: d * 1.3),
          ),
        );
        final chat = circle(Icons.chat_bubble_outline, tx('Sohbet'), _openInput);
        final List<Widget> items;
        if (_myRole == 'owner') {
          items = [chat, pkBtn, micBtn, guestBtn, gift, menu];
        } else if (_onSeat) {
          items = [chat, micBtn, circle(Icons.sentiment_satisfied_alt, 'Emoji', _micEmojiSheet), guestBtn, gift, menu];
        } else {
          items = [chat, guestBtn, gift, mail, sound, menu];
        }
        return SizedBox(
          height: barH,
          child: Stack(clipBehavior: Clip.none, children: [
            for (var i = 0; i < items.length; i++)
              at((i + 0.5) / items.length, items[i], size: identical(items[i], gift) ? g.giftBtn : (identical(items[i], pkBtn) ? d * 1.3 : null)),
          ]),
        );
      }

      const step = 0.1435;
      final right = <Widget>[
        at(0.5, gift, size: g.giftBtn),
        at(0.5 + step, mail),
        at(0.5 + step * 2, sound),
        at(0.5 + step * 3, menu),
      ];
      final List<Widget> left;
      if (_onSeat) {
        left = [
          at(0.5 - step * 3, circle(Icons.chat_bubble_outline, tx('Sohbet'), _openInput)),
          at(0.5 - step * 2, micBtn),
          at(0.5 - step, circle(Icons.sentiment_satisfied_alt, 'Emoji', _micEmojiSheet)),
        ];
      } else {
        final pillH = (w * 0.087).clamp(32.0, 42.0).toDouble();
        left = [
          Positioned(
            left: w * 0.025,
            width: w * 0.394,
            top: (barH - pillH) / 2,
            height: pillH,
            child: Material(
              color: Colors.black.withValues(alpha: 0.32),
              shape: const StadiumBorder(),
              child: InkWell(
                customBorder: const StadiumBorder(),
                onTap: _openInput,
                child: Row(children: [
                  const SizedBox(width: 10),
                  const Icon(Icons.chat_bubble_outline, size: 22),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_chatOpen ? 'Selam...' : tx('Sohbet kapalı'), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                ]),
              ),
            ),
          ),
        ];
      }
      return SizedBox(height: barH, child: Stack(clipBehavior: Clip.none, children: [...left, ...right]));
    });
  }
}
