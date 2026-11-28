part of '../room_screen.dart';

/// Sahne: koltuk ızgarası, koltuk kutusu, görüntülü hücreler, canlı yayın sahnesi, boyut hesapları.
extension _RoomStage on _RoomScreenState {
  /// Başlık, koltuk adları ve alt bar telefonun yazı boyutu ayarından etkilenmez (Yoho gibi): ölçüler hiç kaymaz.
  Widget _fixedText(Widget child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling), child: child);

  // Bir koltuğun avatar alanı (slot) boyutu satıra göre değişir: üst (oda sahibi) satırı daha büyüktür.
  double _cellH(double slot) => slot + 2 + _seatNameH + (_scoreOn ? _seatScoreH + 2 : 0);

  Widget _seatFrame({required double slotSize, required Widget slot, required Widget name, Widget? score, VoidCallback? onTap, bool muted = false}) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: SizedBox(
        height: _cellH(slotSize),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          SizedBox(
            width: slotSize,
            height: slotSize,
            child: muted || (_sbActive && score != null)
                ? Stack(clipBehavior: Clip.none, children: [
                    Positioned.fill(child: slot),
                    if (muted) Positioned(right: slotSize * 0.04, bottom: slotSize * 0.04, child: IgnorePointer(child: mutedBadge(slotSize * 0.36))),
                    // Sayı tahtası puanı: avatarın alt kenarına binen altın rozet (her mikrofon modunda).
                    if (_sbActive && score != null)
                      Positioned(left: 0, right: 0, bottom: 0, child: IgnorePointer(child: Center(child: score))),
                  ])
                : slot,
          ),
          const SizedBox(height: 2),
          SizedBox(height: _seatNameH, child: Center(child: name)),
          if (_scoreOn) ...[const SizedBox(height: 2), SizedBox(height: _seatScoreH, child: Center(child: score ?? const SizedBox.shrink()))],
        ]),
      ),
    );
  }

  /// 1.250 → 1,2K · 3.400.000 → 3,4M (dar koltukta sığsın).
  static String _short(String v) => shortAmount(v);

  /// Sayı tahtası rozeti: siyah-altın kapsül, Elmas simgesi + puan; büyüklüğü koltuğa göre (sık modlarda küçülür).
  Widget _scoreBadge(String userId, double slotSize) {
    final v = _scores[userId] ?? '0';
    final fs = (slotSize * 0.17).clamp(8.5, 12.5);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: fs * 0.55, vertical: fs * 0.12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(fs),
        gradient: const LinearGradient(colors: [Color(0xFF2A1F08), Color(0xFF0B0906)]),
        border: Border.all(color: const Color(0xFFF2B92A), width: 1),
        boxShadow: const [BoxShadow(color: Color(0x66F2B92A), blurRadius: 5)],
      ),
      child: Text('💎${_short(v)}', maxLines: 1, style: TextStyle(fontSize: fs, height: 1.1, fontWeight: FontWeight.w900, color: const Color(0xFFFFD54F))),
    );
  }

  /// Doğum günü tasarımının fiyatı ve kişinin hakkı (mikrofon modu penceresindeki kart için). Alınamazsa null.
  Future<Map<String, dynamic>?> _birthdaySkin() async {
    try {
      final r = await Api.get('/api/mic-skins');
      return listOf(r['skins']).where((x) => x['key'] == kBirthdaySkin).firstOrNull;
    } catch (_) {
      return null;
    }
  }

  void _openBirthday() => showBirthdaySheet(
        context,
        currentName: _room?['micSkinText']?.toString(),
        active: _birthday,
        patchRoom: _patchRoom,
      );

  Widget _seatTile(int index, Map<String, dynamic>? m, double slotSize, {double? plusSize}) {
    final seatR = (slotSize - 8) / 2;
    if (m == null) {
      final reserved = index == 0 && _myRole != 'owner';
      final locked = _lockedSeats.contains(index);
      return _seatFrame(
        slotSize: slotSize,
        muted: _mutedSeats.contains(index),
        onTap: () => _emptySeatTap(index, reserved, locked),
        slot: Center(
          child: Container(
            width: seatR * 2,
            height: seatR * 2,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: pkTeamOfSeat(_roomPk, index) == null ? Colors.white.withValues(alpha: 0.16) : pkTeamColor(pkTeamOfSeat(_roomPk, index)!).withValues(alpha: 0.28),
              border: Border.all(color: pkTeamOfSeat(_roomPk, index) == null ? Colors.white.withValues(alpha: 0.28) : pkTeamColor(pkTeamOfSeat(_roomPk, index)!), width: pkTeamOfSeat(_roomPk, index) == null ? 1 : 2),
            ),
            child: Icon(reserved ? Icons.star_border : (locked ? Icons.lock : Icons.add), size: plusSize ?? seatR * 0.95, color: locked ? Colors.orangeAccent : Colors.white),
          ),
        ),
        name: Text(_pkStage && index > 0 ? 'No.${pkSeatNo(index)}' : '${index + 1}', style: TextStyle(color: Colors.white, fontSize: _seatCompact ? 11 : 12.5, fontWeight: FontWeight.w600)),
      );
    }
    final userId = m['userId'].toString();
    final user = mapOf(m['user']);
    final video = _isVideo ? _videoFor(userId) : null;
    final speaking = _isSpeaking(userId);
    final isMe = userId == Session.id;
    final frameUrl = Api.absoluteUrl(user?['frameUrl'] as String?);
    final waveUrl = video == null ? Api.absoluteUrl(user?['micWaveUrl'] as String?) : null;
    final nameColor = parseColor(user?['nameColor'] as String?);
    return _seatFrame(
      slotSize: slotSize,
      muted: _mutedSeats.contains(index),
      onTap: () => isMe ? _selfSeatSheet(m, index) : _memberSheet(m),
      slot: KeyedSubtree(
        key: _seatKeys.putIfAbsent(userId, () => GlobalKey()),
        child: Stack(alignment: Alignment.center, clipBehavior: Clip.none, children: [
        // Mağazadan alınan mikrofon dalgası: konuşurken avatarın çevresinde (yeşil halkanın yerine) oynar (avatarın arkasında).
        if (speaking && waveUrl != null)
          Positioned(
            left: (slotSize - seatR * 2 * 1.5) / 2,
            top: (slotSize - seatR * 2 * 1.5) / 2,
            width: seatR * 2 * 1.5,
            height: seatR * 2 * 1.5,
            child: MicWave(url: waveUrl),
          ),
        if (video != null)
          SizedBox(width: seatR * 2, height: seatR * 2, child: ClipRRect(borderRadius: BorderRadius.circular(12), child: video))
        else
          UserAvatar(user: user, radius: seatR),
        // Konuşma halkası: sabit boyutlu bindirme; konuşmasa da yer kaplar (saydam), düzeni değiştirmez.
        Positioned.fill(
          child: IgnorePointer(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              decoration: BoxDecoration(
                shape: video != null ? BoxShape.rectangle : BoxShape.circle,
                borderRadius: video != null ? BorderRadius.circular(14) : null,
                border: Border.all(color: speaking && waveUrl == null ? Colors.greenAccent : Colors.transparent, width: 2.5),
              ),
            ),
          ),
        ),
        // Oda içi PK: takım halkası (Kırmızı / Mavi) ve rozet.
        if (pkTeamOfSeat(_roomPk, index, userId: userId) != null) PkSeatRing(team: pkTeamOfSeat(_roomPk, index, userId: userId)!, size: seatR * 2 + 6),
        // Takılı çerçeve yoksa WIP kademesinin çerçevesi (kodla çizilir, düzeni değiştirmez).
        if (frameUrl == null && video == null) WipFrame.around(wipLevelOf(user?['wipFrame'] ?? user?['wipLevel']), seatR),
        // Takılı avatar çerçevesi: avatar çapının ×kFrameScale'i (profil ile aynı oran), avatarla aynı merkezde ve koltuk
        // kutusunun DIŞINA taşar. Kutuya sığdırılmaz: sığdırılınca çerçevenin içi avatarı örtüp oturan kişi küçük görünüyordu.
        if (frameUrl != null && video == null)
          Positioned(
            left: (slotSize - seatR * 2 * kFrameScale) / 2,
            top: (slotSize - seatR * 2 * kFrameScale) / 2,
            width: seatR * 2 * kFrameScale,
            height: seatR * 2 * kFrameScale,
            child: FrameBox(url: frameUrl, avatarRadius: seatR),
          ),
        // Mikrofon emojisi: avatarın üstünde birkaç saniye oynar.
        if (_micEmoji[userId] == _RoomScreenState.kCryEmoji)
          Positioned.fill(child: PkCryEmoji(key: ValueKey('emo-$userId-${_micEmojiSeq[userId]}')))
        else if (_micEmoji[userId] != null)
          // Emoji koltuk dairesini tamamen kaplar: altta daireyi örten koyu zemin, üstte daireden biraz büyük emoji.
          Positioned.fill(
            child: IgnorePointer(
              child: Center(
                child: SizedBox(
                  width: seatR * 2,
                  height: seatR * 2,
                  child: Stack(clipBehavior: Clip.none, alignment: Alignment.center, children: [
                    Container(
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(colors: [Color(0xFF3A2F5C), Color(0xFF1C1630)]),
                      ),
                    ),
                    OverflowBox(
                      maxWidth: seatR * 2 * micEmojiScale(_micEmoji[userId]!),
                      maxHeight: seatR * 2 * micEmojiScale(_micEmoji[userId]!),
                      child: MicEmojiImage(key: ValueKey('emo-$userId-${_micEmojiSeq[userId]}'), id: _micEmoji[userId]!),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ]),
      ),
      name: Row(mainAxisSize: MainAxisSize.min, children: [
        if (m['role'] == 'owner') const Icon(Icons.star, size: 12, color: Colors.amber),
        Flexible(
          child: WipNameText(
            (user?['displayName'] ?? '').toString(),
            level: (user?['wipLevel'] as num?)?.toInt(),
            color: nameColor ?? Colors.white,
            style: TextStyle(fontSize: _seatCompact ? 10 : 11, height: 1.1, fontWeight: nameColor != null ? FontWeight.w800 : FontWeight.normal),
          ),
        ),
      ]),
      score: _scoreBadge(userId, slotSize),
    );
  }

  // Koltuk + sohbet bölgesi (Yoho): koltuklar başlığın altından sabit ölçüyle başlar, sohbet koltukların bittiği yerden akar.
  // Klavye açılınca koltuklar küçülmez/yer değiştirmez; oda kararır, mesajlar karartının üstünde görünür.
  Widget _stageBody() {
    final kb = MediaQuery.viewInsetsOf(context).bottom;
    if (_inputOpen && kb > 0) _kbSeen = true;
    if (_inputOpen && _kbSeen && kb == 0) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _inputOpen && MediaQuery.viewInsetsOf(context).bottom == 0) _closeInput();
      });
    }
    return LayoutBuilder(builder: (context, box) {
      final w = box.maxWidth;
      if (_isLive) return _liveStage(w, box.maxHeight);
      final double seatH;
      final Widget seats;
      if (_isGrid) {
        // Çoklu yayın: görüntü ızgarası tam genişlikte. Yüksekliği yalnızca cihaz ölçüsüne bağlı (klavye, PK şeridi
        // değiştirmez); çok kısa ekranlarda sohbete en az ~110 dp kalacak kadar küçülür ve ortalanır.
        final spec = videoGridFor(_seatCount);
        final g = RoomGeom(w);
        final avail = _bodyH > 0 ? _bodyH - MediaQuery.paddingOf(context).top - g.headerH - g.barH - 110 : w * spec.aspect;
        seatH = math.max(0.0, math.min(w * spec.aspect, avail));
        final gw = seatH / spec.aspect;
        seats = Align(alignment: Alignment.topCenter, child: SizedBox(width: gw, height: seatH, child: _videoGrid(gw, spec)));
      } else {
        // Ölçek yalnızca cihaz ölçüsüne bağlı (oturmak, izleyici, klavye, PK şeridi değiştirmez).
        final sc = _seatScaleFor(w);
        const scoreRow = false;
        seatH = _seatAreaHeight(w, sc, score: scoreRow);
        seats = _seatGrid(w, sc);
      }
      // PK sahnesi: koltukların arkasında kırmızı | mavi zemin, altında PK çubuğu (sohbet onun altından başlar).
      final pkStage = _pkStage && !_isGrid;
      final pkH = pkStage ? RoomPkPanel.height : 0.0;
      final chatTop = seatH + pkH;
      return Stack(clipBehavior: Clip.hardEdge, children: [
        if (pkStage) Positioned(left: 0, right: 0, top: 0, height: chatTop, child: const PkStageBackdrop()),
        if (pkStage)
          Positioned(
            left: 0,
            right: 0,
            top: seatH,
            height: pkH,
            child: _fixedText(RoomPkPanel(
              key: ValueKey('pkp-${_roomPk!['id']}'),
              pk: _roomPk!,
              canManage: _isOwnerOrCohost,
              onStale: _reloadRoomPk,
              onUpdate: (pk) {
                if (mounted && _roomPk?['id'] == pk['id'] && _roomPk?['status'] == 'preparing') _set(() => _roomPk = pk);
              },
            )),
          ),
        Positioned(
          left: 0,
          right: 0,
          top: 0,
          height: seatH,
          // Koltuklar sabit; yalnızca hızlı dikey kaydırma (fling) odayı değiştirir.
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onVerticalDragEnd: (d) {
              final v = d.primaryVelocity ?? 0;
              if (v < -1400) _switchRoom(1);
              if (v > 1400) _switchRoom(-1);
            },
            child: _fixedText(seats),
          ),
        ),
        if (!_inputOpen && !(_isVideo && _chatHidden)) Positioned(left: 0, right: 0, top: chatTop, bottom: 0, child: _chatPanel(w)),
        // Süren sayım çubuğu (herkes görür; yönetici ✕ ile durdurur, dokununca pencere açılır).
        if (_sbSession != null && !_inputOpen)
          Positioned(
            left: 0,
            right: 0,
            top: chatTop + 4,
            child: Center(
              child: ScoreboardPill(
                key: ValueKey('sb-${_sbSession!['id']}'),
                session: _sbSession!,
                canStop: _canSeatManage,
                onStop: _stopScoreboard,
                onTap: _canSeatManage ? () => showScoreboardSetup(context, roomId: widget.roomId, session: _sbSession) : null,
              ),
            ),
          ),
        if (!_inputOpen && _isVideo) Positioned(left: 8, bottom: _chatHidden ? 8 : null, top: _chatHidden ? null : chatTop - 30, child: _chatToggle()),
        if (_inputOpen) ...[
          Positioned.fill(child: GestureDetector(onTap: _closeInput, child: const ColoredBox(color: Color(0xB8000000)))),
          Positioned.fill(child: _chatPanel(w, overlay: true)),
        ],
        if (_canSeatManage && _micRequest && _queue.isNotEmpty && !_inputOpen)
          Positioned(
            right: 8,
            top: pkStage ? chatTop + 4 : seatH - 34,
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: _micRequestsSheet,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: const Color(0xFF22C55E), borderRadius: BorderRadius.circular(16), boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 6)]),
                child: Text(tx('Mikrofon istekleri ({n})', {'n': _queue.length}), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
              ),
            ),
          ),
      ]);
    });
  }

  /// Çoklu yayın ızgarası (Figma): hücreler kenar boşluksuz, ince açık çizgilerle ayrılır.
  Widget _videoGrid(double gw, VideoGridSpec spec) {
    final by = _bySeat;
    final n = math.min(spec.cells.length, _seatCount);
    return Stack(children: [
      for (var i = 0; i < n; i++)
        Positioned(
          left: spec.cells[i].left * gw,
          top: spec.cells[i].top * gw,
          width: spec.cells[i].width * gw,
          height: spec.cells[i].height * gw,
          child: _videoCell(i, by[i], Size(spec.cells[i].width * gw, spec.cells[i].height * gw)),
        ),
    ]);
  }

  /// Bir görüntü hücresi: kamera (kapalıysa avatar), altta ad ve elmas. Boş hücrede koltuk simgesi; dokununca oturulur.
  /// [pip]: canlı yayında sağdaki küçük konuk penceresi (yuvarlak köşeli, çizgisiz).
  Widget _videoCell(int index, Map<String, dynamic>? m, Size size, {bool pip = false}) {
    final side = math.min(size.width, size.height);
    final radius = pip ? BorderRadius.circular(8) : null;
    final border = pip ? Border.all(color: Colors.white24, width: 0.8) : Border.all(color: kGridLine, width: 0.5);
    if (m == null) {
      final reserved = index == 0 && _myRole != 'owner';
      final locked = _lockedSeats.contains(index);
      return GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _emptySeatTap(index, reserved, locked),
        child: Container(
          decoration: BoxDecoration(color: index == 0 ? kGridHostFill : kGridEmptyFill, border: border, borderRadius: radius),
          child: Stack(alignment: Alignment.center, children: [
            Icon(
              reserved ? Icons.videocam_off_outlined : (locked ? Icons.lock : kEmptySeatIcon),
              size: side * 0.32,
              color: locked ? Colors.orangeAccent : Colors.white.withValues(alpha: 0.8),
            ),
            if (_mutedSeats.contains(index)) Positioned(top: 4, right: 4, child: mutedBadge(side * 0.2)),
          ]),
        ),
      );
    }
    final userId = m['userId'].toString();
    final user = mapOf(m['user']);
    final video = _videoFor(userId, cover: true);
    final speaking = _isSpeaking(userId);
    final isMe = userId == Session.id;
    final nameColor = parseColor(user?['nameColor'] as String?);
    final fs = (side * 0.11).clamp(9.0, 12.0).toDouble();
    const shadow = [Shadow(color: Colors.black87, blurRadius: 3)];
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => isMe ? _selfSeatSheet(m, index) : _memberSheet(m),
      child: Container(
        clipBehavior: Clip.hardEdge,
        decoration: BoxDecoration(color: kGridHostFill, border: border, borderRadius: radius),
        child: Stack(fit: StackFit.expand, children: [
          KeyedSubtree(
            key: _seatKeys.putIfAbsent(userId, () => GlobalKey()),
            child: video ?? Center(child: UserAvatar(user: user, radius: side * 0.26)),
          ),
          if (_mutedSeats.contains(index)) Positioned(top: 4, right: 4, child: IgnorePointer(child: mutedBadge(side * 0.2))),
          // Konuşma göstergesi: hücrenin kenarında yeşil çerçeve (düzeni değiştirmez).
          IgnorePointer(
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              decoration: BoxDecoration(borderRadius: radius, border: Border.all(color: speaking ? Colors.greenAccent : Colors.transparent, width: 2)),
            ),
          ),
          Positioned(
            left: 4,
            right: 4,
            bottom: 3,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Row(mainAxisSize: MainAxisSize.min, children: [
                if (m['role'] == 'owner') Icon(Icons.star, size: fs + 1, color: Colors.amber),
                Flexible(
                  child: WipNameText(
                    (user?['displayName'] ?? '').toString(),
                    level: (user?['wipLevel'] as num?)?.toInt(),
                    color: nameColor ?? Colors.white,
                    style: TextStyle(fontSize: fs, height: 1.15, fontWeight: FontWeight.w700, shadows: shadow),
                  ),
                ),
              ]),
              if (_sbActive)
                Text('💎 ${fmtNumber(_scores[userId] ?? 0)}', maxLines: 1, style: TextStyle(fontSize: fs * 0.95, height: 1.15, color: Colors.amberAccent, shadows: shadow)),
            ]),
          ),
        ]),
      ),
    );
  }

  /// Canlı yayın zemini: yayıncının (0. koltuk) kamerası tam ekran. Kamera kapalıysa büyük avatar, yayıncı koltukta
  /// değilse tema zemini üstünde bilgi yazısı. Dokunma alanı değildir (dokunmalar sahne katmanında).
  /// Görüntülü PK'da bölünmüş ekranın sol yarısı: bizim yayıncı (hediye animasyonları için aynı koltuk anahtarıyla).
  Widget? _pkHostVideo() {
    final host = _bySeat[0];
    if (host == null) return null;
    final uid = host['userId'].toString();
    final v = _videoFor(uid, cover: true);
    return KeyedSubtree(key: _seatKeys.putIfAbsent(uid, () => GlobalKey()), child: v ?? Center(child: UserAvatar(user: mapOf(host['user']), radius: 34)));
  }

  Widget _liveBackdrop() {
    final host = _bySeat[0];
    final t = themeOf(_room?['theme']?.toString());
    final Widget content;
    if (_pkLive) {
      content = const SizedBox.shrink(); // yayıncı PK bölünmüş ekranında görünür
    } else if (host == null) {
      content = Center(child: Text(tx('Yayıncı şu an kamerada değil'), style: TextStyle(color: Colors.white70, fontSize: 15)));
    } else {
      final uid = host['userId'].toString();
      content = KeyedSubtree(
        key: _seatKeys.putIfAbsent(uid, () => GlobalKey()),
        child: _videoFor(uid, cover: true) ??
            Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                UserAvatar(user: mapOf(host['user']), radius: 56),
                const SizedBox(height: 10),
                Text(tx('Kamera kapalı'), style: TextStyle(color: Colors.white60)),
              ]),
            ),
      );
    }
    return IgnorePointer(
      child: Stack(fit: StackFit.expand, children: [
        DecoratedBox(
          decoration: BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: t.colors.length < 2 ? [t.colors.first, t.colors.first] : t.colors),
          ),
        ),
        content,
        // Başlık ve sohbet okunaklı kalsın diye üstte ve altta hafif karartı.
        const Align(
          alignment: Alignment.topCenter,
          child: SizedBox(height: 180, width: double.infinity, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0x73000000), Color(0x00000000)])))),
        ),
        const Align(
          alignment: Alignment.bottomCenter,
          child: SizedBox(height: 300, width: double.infinity, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0x00000000), Color(0x8C000000)])))),
        ),
      ]),
    );
  }

  void _hostTap() {
    final host = _bySeat[0];
    if (host == null) return;
    if (host['userId']?.toString() == Session.id) {
      _selfSeatSheet(host, 0);
    } else {
      _memberSheet(host);
    }
  }

  /// Canlı yayın sahnesi (başlık ile alt bar arası): sağda konuk pencereleri, solda alttan akan sohbet.
  /// Görüntülü odada sohbeti gizle / göster düğmesi (yalnızca görüntüyü izlemek isteyenler için).
  Widget _chatToggle() => Material(
        color: Colors.black54,
        shape: const StadiumBorder(side: BorderSide(color: Color(0x99F2B92A))),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: () => _set(() => _chatHidden = !_chatHidden),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(_chatHidden ? Icons.chat_bubble_outline : Icons.visibility_off_outlined, size: 16, color: const Color(0xFFF2B92A)),
              const SizedBox(width: 4),
              Text(_chatHidden ? tx('Sohbeti göster') : tx('Sohbeti gizle'), style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
            ]),
          ),
        ),
      );

  Widget _liveStage(double w, double h) {
    final by = _bySeat;
    final guests = [for (var i = 1; i < _seatCount; i++) if (by[i] != null) i];
    final pw = (w * 0.27).clamp(88.0, 132.0).toDouble();
    final ph = pw * 4 / 3;
    return Stack(clipBehavior: Clip.hardEdge, children: [
      // Yayıncıya dokununca kartı açılır; hızlı dikey kaydırma odayı değiştirir.
      Positioned.fill(
        child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: _hostTap,
          onVerticalDragEnd: (d) {
            final v = d.primaryVelocity ?? 0;
            if (v < -1400) _switchRoom(1);
            if (v > 1400) _switchRoom(-1);
          },
        ),
      ),
      // Konuk pencereleri (Figma): sağda, sohbetin hizasında alttan yukarı dizilir.
      Positioned(
        right: 8,
        bottom: h * 0.12,
        width: pw,
        child: _fixedText(Column(mainAxisSize: MainAxisSize.min, children: [
          for (final i in guests)
            Padding(padding: const EdgeInsets.only(bottom: 6), child: SizedBox(width: pw, height: ph, child: _videoCell(i, by[i], Size(pw, ph), pip: true))),
        ])),
      ),
      if (!_inputOpen && !_chatHidden) Positioned(left: 0, right: pw + 12, bottom: 0, height: h * 0.46, child: _chatPanel(w, rightPad: 8)),
      if (!_inputOpen) Positioned(left: 8, bottom: _chatHidden ? 8 : h * 0.46 + 4, child: _chatToggle()),
      if (_inputOpen) ...[
        Positioned.fill(child: GestureDetector(onTap: _closeInput, child: const ColoredBox(color: Color(0xB8000000)))),
        Positioned.fill(child: _chatPanel(w, overlay: true)),
      ],
      if (_canSeatManage && _queue.isNotEmpty && !_inputOpen)
        Positioned(
          left: 8,
          top: 4,
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: _guestRequestsSheet,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: const Color(0xFF22C55E), borderRadius: BorderRadius.circular(16), boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 6)]),
              child: Text(tx('Konuk istekleri ({n})', {'n': _queue.length}), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800)),
            ),
          ),
        ),
    ]);
  }

  /// Koltuk alanının yüksekliği: son satırın merkezi + yarıçap + ad (ve sığıyorsa puan) satırları.
  /// Puan satırının yeri, oda sahibi puanı kapatsa da ayrılır: sohbetin başladığı yer hiç oynamaz.
  double _seatAreaHeight(double w, double sc, {required bool score}) {
    final spec = seatLayoutFor(_seatCount, skin: _micSkin);
    // topGap: başlığın altından ilk satırdaki DAİRENİN üst kenarına (Yoho ölçümü); +8 dp dokunma payı merkeze katılmaz.
    var cy = spec.topGap * w * sc + (spec.rows.first.dia * w * sc) / 2;
    for (var r = 0; r < spec.pitch.length; r++) {
      cy += _rowStep(spec, r, w, sc);
    }
    final labels = 2 + _seatNameH + (score ? _seatScoreH + 2 : 0);
    return cy + ((spec.rows.last.dia + seatCircleBoost) * w * sc + 8) / 2 + labels + 8;
  }

  /// [r]. satırın merkezinden bir sonrakine uzaklık (piksel). Doğum günü tasarımında satırlar en az
  /// "yarım koltuk + ad satırı + yarım koltuk + 4 dp" aralıklıdır: ad yazısı sabit boyutta olduğu için ölçek küçülse de
  /// koltuk numarası / ad alttaki koltuğun altında kalmaz. Diğer modlar Yoho ölçüsündedir (değişmedi).
  double _rowStep(SeatLayoutSpec spec, int r, double w, double sc) {
    final base = spec.pitch[r] * w * sc;
    if (!identical(spec, birthdayLayout)) return base;
    final a = (spec.rows[r].dia + seatCircleBoost) * w * sc + 8;
    final b = (spec.rows[r + 1].dia + seatCircleBoost) * w * sc + 8;
    return math.max(base, a / 2 + 2 + _seatNameH + b / 2 + 4);
  }

  /// Koltuk ölçeği: koltuklar normalde tam Yoho ölçüsündedir (1). Yalnızca çok kısa ekranlarda, sohbete en az ~110 dp
  /// kalacak kadar küçültülür. Hesap yalnızca oda gövdesinin (klavyeden etkilenmeyen) yüksekliğine ve ekran
  /// genişliğine dayanır; bu yüzden koltuğa oturmak, izleyici gelmesi, klavye ya da başlıktaki rozetler boyutu değiştirmez.
  double _seatScaleFor(double w) {
    final bodyH = _bodyH;
    if (bodyH <= 0) return 1.0;
    final g = RoomGeom(w);
    final avail = bodyH - MediaQuery.paddingOf(context).top - g.headerH - g.barH - 110 - (_pkStage ? RoomPkPanel.height : 0);
    final need = _seatAreaHeight(w, 1, score: false);
    if (need <= avail) return 1.0;
    if (avail <= 0) return 0.72;
    return (avail / need).clamp(0.72, 1.0).toDouble();
  }

  Widget _seatGrid(double w, double sc) {
    final bySeat = <int, Map<String, dynamic>>{
      for (final m in _members)
        if (m['seatIndex'] != null) (m['seatIndex'] as num).toInt(): m,
    };
    final spec = seatLayoutFor(_seatCount, skin: _micSkin);
    final pkStage = _pkStage && spec.rows.length == 3;
    final tiles = <Widget>[];
    final centers = <int, (Offset, double, int)>{}; // koltuk → (avatar merkezi, yarıçap, satır)
    if (pkStage) {
      // MVP tahtları: oda sahibinin iki yanında; takımın o anki en çok destekleyeni oturur.
      final cy0 = spec.topGap * w * sc + (spec.rows.first.dia * w * sc) / 2;
      final tw = 0.17 * w * sc;
      final th = tw * 1.18;
      for (final (team, x) in const [('red', 0.15), ('blue', 0.85)]) {
        final top = mapOf(listOf(mapOf(_roomPk![team])?['supporters']).firstOrNull);
        final user = mapOf(top?['user']);
        tiles.add(Positioned(
          left: x * w - tw / 2,
          top: math.max(0.0, cy0 - th / 2 - 4),
          width: tw,
          height: th + _seatNameH,
          child: Column(children: [
            PkThrone(team: team, user: user, width: tw, onTap: user?['id'] == null || user?['isHidden'] == true ? null : () => Navigator.push(context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: user!['id'].toString())))),
            SizedBox(
              height: _seatNameH,
              child: Center(
                child: Text(user == null ? (team == 'red' ? tx('Kırmızı MVP') : tx('Mavi MVP')) : (user['displayName'] ?? '').toString(),
                    maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: _seatCompact ? 9.5 : 10.5, color: Colors.white, fontWeight: FontWeight.w700)),
              ),
            ),
          ]),
        ));
      }
    }
    var i = 0;
    // topGap: başlığın altından ilk satırdaki DAİRENİN üst kenarına (Yoho ölçümü); +8 dp dokunma payı merkeze katılmaz.
    var cy = spec.topGap * w * sc + (spec.rows.first.dia * w * sc) / 2;
    final rowCy = <double>[];
    for (var r = 0; r < spec.rows.length; r++) {
      rowCy.add(cy);
      final row = spec.rows[r];
      // Daire %1 büyür (seatCircleBoost); artı simgesi eski daire ölçüsüne göre kalır.
      final slot = (row.dia + seatCircleBoost) * w * sc + 8;
      final plus = (row.dia * w * sc) / 2 * 0.95;
      // Hücre genişliği: komşu koltuklar arası mesafe (ad yazısı için), en az koltuk kadar.
      var minDx = 1.0;
      for (var k = 1; k < row.xs.length; k++) {
        final dx = row.xs[k] - row.xs[k - 1];
        if (dx < minDx) minDx = dx;
      }
      final tileW = (row.xs.length == 1 ? slot * 1.9 : minDx * w - 2).clamp(slot, slot * 2.2).toDouble();
      for (var k = 0; k < row.xs.length; k++) {
        final x = row.xs[k];
        if (i >= _seatCount) break;
        // PK sahnesi: solda Kırmızı 2×2, sağda Mavi 2×2 (konum → koltuk eşlemesi).
        final idx = pkStage ? kPkSeatOrder[i++] : i++;
        // Satırda koltuk başına farklı çap olabilir (doğum günü: ortadaki büyük koltuk).
        final sd = row.dias?[k];
        final sSlot = sd == null ? slot : (sd + seatCircleBoost) * w * sc + 8;
        final sPlus = sd == null ? plus : (sd * w * sc) / 2 * 0.95;
        final sTileW = sd == null ? tileW : math.max(tileW, sSlot * 1.3);
        centers[idx] = (Offset(x * w, cy), (sSlot - 8) / 2, r);
        tiles.add(Positioned(
          left: x * w - sTileW / 2,
          top: cy - sSlot / 2,
          width: sTileW,
          child: Center(child: _seatTile(idx, bySeat[idx], sSlot, plusSize: sPlus)),
        ));
        // Doğum günü tasarımı: koltuk halkası; ortadaki doğum günü koltuğu taçlı altın.
        if (_birthday) {
          final d = sSlot;
          final crown = idx == kBirthdaySeat;
          tiles.add(Positioned(
            left: x * w - d / 2,
            top: cy - d / 2 - (crown ? d * 0.22 : 0) - 1,
            width: d,
            height: d * (crown ? 1.22 : 1),
            child: BirthdaySeatRing(diameter: d, host: crown),
          ));
        }
      }
      if (r < spec.pitch.length) cy += _rowStep(spec, r, w, sc);
    }
    if (_birthday && rowCy.length >= 4) {
      // Üstte kutlama şeridi (sahibin yazdığı isimle), ortada pasta.
      // Şerit taçlı koltuğun tacının üstünde biter; pasta taçlı koltuğun ad satırının altından başlar, iki yandaki
      // koltukların ad yazılarına değmeyecek genişlikte (yan koltuklar 0,27 / 0,73'te).
      final bw = 0.70 * w * sc;
      tiles.insert(0, Positioned(left: (w - bw) / 2, top: 0.006 * w * sc, width: bw, height: bw * 0.2, child: BirthdayBanner(name: _room?['micSkinText']?.toString(), width: bw)));
      final cakeTop = rowCy[1] - 0.03 * w * sc;
      final cakeH = (rowCy[3] - rowCy[1]) + 0.10 * w * sc;
      final cakeW = 0.30 * w * sc;
      tiles.insert(0, Positioned(left: (w - cakeW) / 2, top: cakeTop, width: cakeW, height: cakeH, child: BirthdayCake(width: cakeW, height: cakeH)));
    }
    // CP (5. kademe): aynı odada mikrofonda oturan CP'ler. Yan yana (aynı sıra, bitişik koltuk) olanlarda aralarında kalp atışı
    // + avatar çevresinde uçuşan kalpler; yan yana OLMAYAN ama mikrofonlarda oturan CP'lerde yalnızca avatarların
    // çevresinde kalpler uçuşur (aradaki kalp yok).
    for (final e in centers.entries) {
      final ua = mapOf(bySeat[e.key]?['user']);
      if (ua == null) continue;
      final ida = ua['id']?.toString();
      final pid = ua['cpPartnerId']?.toString();
      final la = (ua['cpLevel'] as num?)?.toInt() ?? 0;
      if (ida == null || pid == null || la < kCpEffectLevel) continue;
      // Eşin koltuğu.
      int? partnerSeat;
      for (final x in centers.keys) {
        if (x == e.key) continue;
        final ub = mapOf(bySeat[x]?['user']);
        if (ub != null && ub['id']?.toString() == pid && ub['cpPartnerId']?.toString() == ida) {
          partnerSeat = x;
          break;
        }
      }
      if (partnerSeat == null) continue;
      final next = centers[e.key + 1];
      final prev = centers[e.key - 1];
      // Yan yana çiftin sağdaki yarısı: çift soldaki koltukta tek parça çizildi.
      if (partnerSeat == e.key - 1 && prev != null && prev.$3 == e.value.$3) continue;
      final adjacent = partnerSeat == e.key + 1 && next != null && next.$3 == e.value.$3;
      final a = e.value.$1, rr = e.value.$2;
      final pad = rr * 1.0;
      if (adjacent) {
        final b = next.$1;
        final box = Rect.fromLTRB(math.min(a.dx, b.dx) - rr - pad, math.min(a.dy, b.dy) - rr - pad, math.max(a.dx, b.dx) + rr + pad, math.max(a.dy, b.dy) + rr + pad);
        tiles.add(Positioned.fromRect(rect: box, child: CpSeatHearts(a: a - box.topLeft, b: b - box.topLeft, r: rr)));
      } else {
        // Yan yana değil: her iki avatarın çevresinde ayrı kalp bulutu (aradaki kalp yok). İki taraf için ayrı çizilir.
        final box = Rect.fromLTRB(a.dx - rr - pad, a.dy - rr - pad * 1.6, a.dx + rr + pad, a.dy + rr + pad);
        tiles.add(Positioned.fromRect(rect: box, child: CpSeatHearts(a: a - box.topLeft, b: a - box.topLeft, r: rr, solo: true)));
      }
    }
    return Stack(clipBehavior: Clip.none, children: tiles);
  }
}
