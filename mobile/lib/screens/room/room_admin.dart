part of '../room_screen.dart';

/// Oda yönetimi: bilgi, düzenleme, şifre, tema, gizlilik, araçlar, ayarlar, efekt/ses ayarları, paylaşım, kapatma.
extension _RoomAdmin on _RoomScreenState {
  bool _canModerate(String targetRole) =>
      (_roleLevel[_myRole] ?? 0) >= 2 && (_roleLevel[_myRole] ?? 0) > (_roleLevel[targetRole] ?? 0) && targetRole != 'owner';

  Future<void> _moderate(String userId, String action, {Map<String, dynamic>? body}) async {
    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/members/$userId/$action', body));
  }

  Future<void> _closeRoom() async {
    if (!await confirm(context, tx('Oda kapatılsın mı? Herkes odadan çıkarılır.'), action: tx('Kapat'))) return;
    if (!mounted) return;
    await guard(context, () => Api.post('/api/rooms/${widget.roomId}/close'));
  }

  /// Oda adına dokununca: ad ve etiketler (oda sahibi / yardımcı sahip düzenler) ve oda yöneticileri.
  Future<void> _roomInfo() async {
    final canEdit = _myRole == 'owner' || _myRole == 'cohost';
    final res = await guard(context, () => Api.get('/api/rooms/${widget.roomId}/managers'));
    if (!mounted) return;
    final managers = listOf(res?['managers']);
    final owner = _members.where((m) => m['role'] == 'owner');
    // Oda sahibi şu an odada değilse bilgisi yönetici listesinden alınır (oda kartı arka planı için).
    final ownerUser = owner.isNotEmpty ? mapOf(owner.first['user']) : mapOf(managers.where((x) => x['role'] == 'owner').firstOrNull?['user']);
    showRoomCard(
      context,
      room: _room ?? const {},
      owner: ownerUser,
      managers: managers,
      canEdit: canEdit,
      onEdit: () => _roomEdit(managers),
      onSettings: _roomSettings,
    );
  }

  Future<void> _roomEdit(List<Map<String, dynamic>> managers) async {
    final room = await Navigator.push<Map<String, dynamic>?>(
      context,
      MaterialPageRoute(builder: (_) => RoomEditScreen(roomId: widget.roomId, room: _room ?? const {}, managers: managers, isOwner: _myRole == 'owner')),
    );
    if (room != null && mounted) _set(() => _room = {...?_room, ...room});
  }

  Future<bool> _patchRoom(Map<String, dynamic> body) async {
    final r = await guard(context, () => Api.patch('/api/rooms/${widget.roomId}', body));
    final room = mapOf(r?['room']);
    if (room != null && mounted) _set(() => _room = {...?_room, ...room});
    return room != null;
  }

  Future<void> _shareRoom() async {
    final code = _room?['joinCode']?.toString();
    final name = (_room?['name'] ?? widget.initialName).toString();
    await Clipboard.setData(ClipboardData(text: tx('🎙 TR Live — "{name}" odasına gel!{v1}', {'name': name, 'v1': code != null ? '\n${tx('Oda kodu: {code}', {'code': code})}' : ''})));
    if (mounted) toast(context, tx('Oda daveti kopyalandı. İstediğin yere yapıştırıp paylaş.'));
  }

  /// Efekt ve ses ayarları (yalnızca bu cihazda; uygulama kapanıp açılınca da hatırlanır).
  Future<void> _effectsAndSound() async {
    var noise = _RoomScreenState.noiseCancel;
    await Denoiser.load();
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF17172A),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
      builder: (c) => StatefulBuilder(
        builder: (c, setS) {
          Widget section(String t) => Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
                child: Align(alignment: Alignment.centerLeft, child: Text(t, style: const TextStyle(color: Colors.white54, fontSize: 14))),
              );
          Widget sw(String title, bool value, ValueChanged<bool> onChanged, {String? note}) => Column(mainAxisSize: MainAxisSize.min, children: [
                SwitchListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20),
                  title: Text(title, style: const TextStyle(fontSize: 15.5, fontWeight: FontWeight.w600)),
                  subtitle: note == null ? null : Text(note, style: const TextStyle(color: Color(0xFFFFB020), fontSize: 12.5)),
                  value: value,
                  activeTrackColor: const Color(0xFF12C84A),
                  onChanged: (v) {
                    setS(() {});
                    onChanged(v);
                  },
                ),
                const Divider(height: 1, indent: 20, endIndent: 20, color: Colors.white10),
              ]);
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(c).height * 0.8),
              child: SingleChildScrollView(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Padding(
                    padding: EdgeInsets.only(top: 16, bottom: 4),
                    child: Text(tx('Efekt ve ses'), style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  ),
                  section(tx('Efekt ayarları')),
                  sw(tx('Hediye görsel efekti'), EffectPrefs.giftAnim, (v) => EffectPrefs.set('fx_gift_anim', v)),
                  sw(tx('Araç ve giriş efektleri'), EffectPrefs.entranceFx, (v) => EffectPrefs.set('fx_entrance', v), note: tx('SWIP araçları gizlenemez.')),
                  sw(tx('Hediye kanalı'), EffectPrefs.giftRibbon, (v) => EffectPrefs.set('fx_gift_ribbon', v)),
                  sw(tx('Global bildirim'), EffectPrefs.globalNotice, (v) => EffectPrefs.set('fx_global_notice', v)),
                  section(tx('Ses ayarları')),
                  sw(tx('Hediye ve araç sesleri'), EffectPrefs.giftSound, (v) => EffectPrefs.set('fx_gift_sound', v)),
                  // Tek anahtar: WebRTC bastırma + yapay zekâ azaltma + telefonun ses işlemesi birlikte açılır/kapanır.
                  sw(tx('Gürültü engelleme'), noise, (v) {
                    noise = v;
                    _setNoiseCancel(v);
                    if (Denoiser.supported) unawaited(Denoiser.setEnabled(v));
                    if (AudioProcessing.supported && AudioProcessing.platform != v) AudioProcessing.setPlatform(v);
                  }, note: tx('Fan, klima, trafik, klavye gibi arka plan seslerini bastırır. Telefondan uzakta konuşuyorsan ya da ses boğuk geliyorsa kapat.')),
                  ListTile(
                    contentPadding: EdgeInsets.symmetric(horizontal: 20),
                    leading: Icon(Icons.phone_in_talk, color: Colors.white70),
                    title: Text(tx('Telefon araması gelince oda sesi ve mikrofon kendiliğinden kapanır, arama bitince açılır.'), style: TextStyle(fontSize: 13.5, color: Colors.white70)),
                  ),
                  Padding(
                    padding: EdgeInsets.fromLTRB(20, 4, 20, 16),
                    child: Text(tx('Görüntüde takılma olursa görsel efektleri kapatmayı deneyin.'), style: TextStyle(color: Colors.white38, fontSize: 12.5)),
                  ),
                ]),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _roomPassword() async {
    final ctl = TextEditingController();
    final locked = _room?['locked'] == true;
    final res = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text(locked ? tx('Oda kilidi (açık)') : tx('Oda kilidi')),
        content: TextField(controller: ctl, obscureText: true, maxLength: 12, decoration: InputDecoration(labelText: locked ? tx('Yeni şifre') : tx('Oda şifresi (4-12 karakter)'))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: Text(tx('Vazgeç'))),
          if (locked) TextButton(onPressed: () => Navigator.pop(c, ''), child: Text(tx('Kilidi kaldır'))),
          FilledButton(onPressed: () => Navigator.pop(c, ctl.text.trim()), child: Text(tx('Kaydet'))),
        ],
      ),
    );
    ctl.dispose();
    if (res == null || !mounted) return;
    if (res.isNotEmpty && res.length < 4) return toast(context, tx('Şifre en az 4 karakter olmalı.'), error: true);
    if (res.isEmpty && !locked) return;
    if (await _patchRoom({'password': res.isEmpty ? null : res}) && mounted) toast(context, res.isEmpty ? tx('Oda kilidi kaldırıldı.') : tx('Oda şifreyle kilitlendi.'));
  }

  /// Tema penceresi (Müsait / Mağaza). Dokunulan tema hemen uygulanır; oda sesi kesilmez.
  Future<void> _roomThemes() => showRoomThemeSheet(
        context,
        roomId: widget.roomId,
        current: (_room?['theme'] ?? 'default').toString(),
        currentImage: _room?['themeImageUrl']?.toString(),
        onApply: (key) => _patchRoom({'theme': key}),
      );

  Future<void> _toggleHidden() async {
    final hide = _room?['hidden'] != true;
    if (!await confirm(context, hide ? tx('Oda listeden gizlensin mi? Yalnızca davet koduyla girilebilir.') : tx('Oda herkese açık listeye geri dönsün mü?'), action: hide ? tx('Gizle') : tx('Göster'))) return;
    if (!mounted) return;
    if (await _patchRoom({'hidden': hide}) && mounted) {
      final code = _room?['joinCode']?.toString();
      toast(context, hide ? tx('Oda gizlendi.{v1}', {'v1': code != null ? ' Kod: $code' : ''}) : tx('Oda herkese açıldı.'));
    }
  }

  void _openTools() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheet) {
        void run(VoidCallback f) {
          Navigator.pop(sheet);
          f();
        }

        void need(bool ok, VoidCallback f) {
          if (ok) return run(f);
          toast(context, tx('Bu aracı kullanma yetkiniz yok.'), error: true);
        }

        // Temel araç: renkli yuvarlak düğme (beyaz simge) + iki satır etiket. [tint]: düğmenin rengi.
        // [active]: açık durumdaki araç (kilitli, gizli, sohbet yasağı, sırada…) etiketin altında küçük çizgiyle gösterilir.
        Widget feature(IconData icon, String label, VoidCallback onTap, {required Color tint, bool active = false}) => InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      // Tüm araçlar uygulamanın sarısında (tint yalnızca "açık" çubuğunu boyar).
                      gradient: const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFFFE082), Color(0xFFF2B92A), Color(0xFFB8860B)]),
                      border: Border.all(color: Colors.white.withValues(alpha: active ? 0.95 : 0.3), width: active ? 1.8 : 0.8),
                      boxShadow: const [BoxShadow(color: Color(0x66F2B92A), blurRadius: 8, offset: Offset(0, 2))],
                    ),
                    child: Icon(icon, size: 21, color: const Color(0xFF1A1405)),
                  ),
                  const SizedBox(height: 5),
                  Text(label, textAlign: TextAlign.center, maxLines: 2, style: const TextStyle(fontSize: 11, color: Color(0xFFDADADF), height: 1.15)),
                  const SizedBox(height: 3),
                  Container(
                    width: 16,
                    height: 3,
                    decoration: BoxDecoration(color: active ? const Color(0xFFF2B92A) : Colors.transparent, borderRadius: BorderRadius.circular(2)),
                  ),
                ]),
              ),
            );
        // Araç renkleri (canlı, koyu zeminde okunur).
        const cPink = Color(0xFFFF4F9A);
        const cGreen = Color(0xFF22C987);
        const cCyan = Color(0xFF14B8E6);
        const cPurple = Color(0xFF7C5CFF);
        const cRed = Color(0xFFEF4444);
        const cBlue = Color(0xFF3B82F6);
        const cOrange = Color(0xFFFF8A3D);
        const cTeal = Color(0xFF14B8A6);

        // İnteraktif özellik: kare görsel kutu + etiket.
        Widget tile(Widget art, String label, VoidCallback onTap, {List<Color> colors = const [Color(0xFF2B2B30), Color(0xFF151518)], bool framed = true}) => InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: onTap,
              child: SizedBox(
                width: 64,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    width: 56,
                    height: 56,
                    clipBehavior: Clip.antiAlias,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(9),
                      gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors),
                      // Ludo / TEK görselindeki altın çerçevenin aynısı tüm özelliklerde.
                      border: framed ? Border.all(color: const Color(0xFFE9B63A), width: 2.2) : null,
                      boxShadow: framed ? const [BoxShadow(color: Color(0x44F2B92A), blurRadius: 6)] : null,
                    ),
                    child: art,
                  ),
                  const SizedBox(height: 5),
                  Text(label, textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11.5, color: Color(0xFFDADADF))),
                ]),
              ),
            );

        final chatOn = _room?['chatEnabled'] != false;
        final hidden = _room?['hidden'] == true;
        final locked = _room?['locked'] == true;
        final pkFree = (_pk == null || !['pending', 'active'].contains(_pk!['status'])) && (_roomPk == null || _roomPk!['status'] == 'finished');
        final queueMode = !_isLive && !_onSeat && !_canSeatManage && (_micRequest || _noFreeSeat);
        final tools = <Widget>[
          // Sıra: Odayı temizle, Sohbet yasağı, Oda kilitleme, Oda gizleme, Ses ve efektler, Müzik, Mikrofon Modu, Tema,
          // Odayı paylaş, Odayı kapat. (Oda sesini kapatma alt çubukta.)
          if (_isManager) feature(Icons.cleaning_services, tx('Odayı\nTemizle'), () => need(_isManager, _clearChat), tint: cPink),
          if (_isOwnerOrCohost) feature(chatOn ? Icons.speaker_notes_off : Icons.chat, chatOn ? tx('Sohbet\nYasağı') : tx('Sohbeti\nAç'), () => need(_isOwnerOrCohost, () => _patchRoom({'chatEnabled': !chatOn})), tint: cCyan, active: !chatOn),
          if (_myRole == 'owner') feature(locked ? Icons.lock : Icons.lock_open, tx('Oda\nKilitleme'), () => need(_myRole == 'owner', _roomPassword), tint: cGreen, active: locked),
          if (_myRole == 'owner') feature(hidden ? Icons.visibility_off : Icons.visibility, tx('Oda\nGizleme'), () => need(_myRole == 'owner', _toggleHidden), tint: cPink, active: hidden),
          feature(Icons.graphic_eq, tx('Ses ve\nEfektler'), () => run(_effectsAndSound), tint: cPurple),
          if (_isManager) feature(Icons.library_music, tx('Müzik'), () => run(_openMusic), tint: cGreen, active: MusicService.instance.state.value?['status'] == 'playing'),
          if (_isOwnerOrCohost && !_isLive) feature(Icons.mic_external_on, _isVideo ? tx('Yayın\nModu') : tx('Mikrofon\nModu'), () {
            Navigator.pop(sheet);
            // Alt pencerenin kapanma animasyonu bitmeden yenisini açmak bazı cihazlarda açılmıyor; kısa bekle.
            Future.delayed(const Duration(milliseconds: 300), () {
              if (mounted) _micMode();
            });
          }, tint: cPurple),
          if (_isOwnerOrCohost) feature(Icons.palette, tx('Tema'), () => need(_isOwnerOrCohost, _roomThemes), tint: cPink),
          // Yönetici kayıtları: süren yasaklar (atılan 24 saat giremez) ve yöneticilerin son işlemleri; yasak buradan kaldırılır.
          if (_isOwnerOrCohost) feature(Icons.fact_check, tx('Yönetici\nKayıtları'), () => need(_isOwnerOrCohost, () => showRoomModeration(context, widget.roomId)), tint: cOrange),
          feature(Icons.share, tx('Odayı\nPaylaş'), () => run(_shareRoom), tint: cBlue),
          if (_myRole == 'owner') feature(Icons.power_settings_new, tx('Odayı\nKapat'), () => run(_closeRoom), tint: cRed),
          // Koltuk / kamera araçları (duruma göre).
          if (_onSeat && _isVideo)
            feature(_camOn ? Icons.videocam : Icons.videocam_off, tx('Kamera'), () => run(() {
                  _set(() => _camOn = !_camOn);
                  _syncPublish();
                }), tint: cOrange, active: _camOn),
          if (_onSeat && _isVideo && _camOn) feature(Icons.cameraswitch, tx('Kamerayı\nÇevir'), () => run(_flipCamera), tint: cTeal),
          if (_onSeat && _isVideo && _camOn) feature(Icons.face_retouching_natural, tx('Güzellik'), () => run(_openBeauty), tint: cPink),
          if (queueMode)
            feature(_inQueue ? Icons.hourglass_bottom : Icons.front_hand, _inQueue ? (_micRequest ? tx('İsteği\nGeri Al') : tx('Sıradan\nÇık')) : (_micRequest ? tx('Mikrofon\nİste') : tx('Sıraya\nGir')), () => run(_toggleQueue), tint: _inQueue ? cOrange : cGreen, active: _inQueue),
          if (_onSeat) feature(Icons.mic_off, tx('Mikrofondan\nİn'), () => run(_leaveMic), tint: cRed),
          if (_canSeatManage && _micRequest && !_isLive) feature(Icons.how_to_reg, tx('Mikrofon\nİstekleri'), () => run(_micRequestsSheet), tint: cGreen),
          if (_canSeatManage && _isLive) feature(Icons.all_inclusive, tx('Konuk\nİstekleri'), () => run(_guestRequestsSheet), tint: cGreen),
          if (_isLive && !_canSeatManage && !_onSeat) feature(Icons.all_inclusive, _inQueue ? tx('İsteği\nGeri Al') : 'Konuk\nOl', () => run(_guestTap), tint: cPink, active: _inQueue),
        ];
        return ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(sheet).height * 0.82),
          child: Container(
            decoration: const BoxDecoration(color: Color(0xFF1C1C1F), borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Expanded(child: Text(tx('İnteraktif Özellikler'), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white))),
                    InkResponse(onTap: () => Navigator.pop(sheet), radius: 18, child: const Icon(Icons.close, size: 22, color: Colors.white)),
                  ]),
                  const SizedBox(height: 10),
                  // Üst sıra: PK · Şanslı Çanta · Sayı tahtası. Alt sıra: Ludo · TEK (Uno) · Etkinlikler.
                  Wrap(spacing: 10, runSpacing: 8, children: [
                    // Sesli oda: oda içi PK (sahip / yardımcı sahip). Görüntülü: rakip yayına PK daveti (sahip).
                    if (_isVideo ? _myRole == 'owner' : _isOwnerOrCohost)
                      tile(
                        const PkLogo(size: 46),
                        'PK',
                        () => !pkFree
                            ? toast(context, _roomPk != null ? tx('PK modu zaten açık. Kapatmak için PK çubuğundaki X\'e dokunun.') : tx('Zaten bir PK sürüyor.'), error: true)
                            : (!_isVideo && _seatCount != kRoomPkSeats)
                                ? toast(context, tx('PK modu yalnızca 9\'lu koltukta açılır. Önce Mikrofon Modu\'ndan 9 koltuğu seçin.'), error: true)
                                : run(() => _isVideo ? showPkChallengeSheet(context, roomId: widget.roomId) : showRoomPkSetup(context, roomId: widget.roomId, seatCount: _seatCount)),
                        colors: const [Color(0xFF1A237E), Color(0xFF0D0D1A), Color(0xFFB71C1C)],
                      ),
                    tile(Image.asset('assets/images/lucky_pouch.webp', width: 48, height: 48), tx('Şanslı Çanta'), () => run(() => showBagSend(context, widget.roomId)), colors: const [Color(0xFF3A1010), Color(0xFF1A0808)]),
                    // Sayı tahtası (Yoho): süreli / elle sayım, sıfırlama kuralları, sonuç ve geçmiş.
                    if (_canSeatManage)
                      tile(const Icon(Icons.leaderboard_rounded, size: 32, color: Color(0xFFFFD54F)), tx('Sayı tahtası'),
                          () => run(() => showScoreboardSetup(context, roomId: widget.roomId, session: _sbSession)),
                          colors: const [Color(0xFF5A3B00), Color(0xFF0B0906)]),
                  ]),
                  const SizedBox(height: 10),
                  Wrap(spacing: 10, runSpacing: 8, children: [
                    tile(const LudoLogo(size: 56), 'Ludo', () => run(() => _tekDockKey.currentState?.openPanel(type: 'ludo')), colors: kGoldDeep, framed: false),
                    // TEK kart oyunu: odanın üstünde açılan oyun penceresi (herkes açabilir; oyunu oda yetkilisi kurar).
                    if (_cardGameOn) tile(const TekLogo(size: 56), 'TEK', () => run(() => _tekDockKey.currentState?.openPanel(type: 'tek')), colors: const [Color(0xFF2A2010), Color(0xFF0B0906)], framed: false),
                    if (_activitiesOn) tile(const Icon(Icons.celebration, size: 30, color: Colors.white), tx('Etkinlikler'), () => run(_openRoomActivities), colors: const [Color(0xFF14506B), Color(0xFF0A1F2B)]),
                  ]),
                  const SizedBox(height: 16),
                  Text(tx('Temel Araçlar'), style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)),
                  const SizedBox(height: 8),
                  LayoutBuilder(builder: (context, box) {
                    final per = (box.maxWidth / 62).floor().clamp(4, 6);
                    final w = box.maxWidth / per;
                    return Wrap(runSpacing: 4, children: [for (final t in tools) SizedBox(width: w, child: t)]);
                  }),
                ]),
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _roomSettings() async {
    final pwCtl = TextEditingController();
    final imgCtl = TextEditingController(text: (_room?['themeImageUrl'] ?? '').toString());
    var chatEnabled = _room?['chatEnabled'] != false;
    var scoreboard = _room?['scoreboardEnabled'] != false;
    var hidden = _room?['hidden'] == true;
    var theme = (_room?['theme'] ?? 'default').toString();
    var removePw = false;
    var regen = false;
    final code = _room?['joinCode']?.toString();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, setS) => AlertDialog(
          title: Text(tx('Oda ayarları')),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Padding(padding: EdgeInsets.only(bottom: 8), child: Text(tx('Oda adı ve etiketleri için oda adına dokunun.'), style: TextStyle(color: Colors.white54, fontSize: 12))),
              if (_myRole == 'owner') ...[
                TextField(controller: pwCtl, obscureText: true, maxLength: 12, enabled: !removePw, decoration: InputDecoration(labelText: _room?['locked'] == true ? tx('Yeni şifre (boş = değişmez)') : tx('Oda şifresi (isteğe bağlı)'))),
                if (_room?['locked'] == true) CheckboxListTile(dense: true, value: removePw, title: Text(tx('Şifreyi kaldır')), onChanged: (v) => setS(() => removePw = v == true)),
                SwitchListTile(dense: true, title: Text(tx('Odayı gizle (yalnızca kodla girilir)')), value: hidden, onChanged: (v) => setS(() => hidden = v)),
                if (hidden && code != null)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text(tx('Davet kodu: {code}', {'code': code}), style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 2)),
                    trailing: IconButton(icon: const Icon(Icons.copy), onPressed: () { Clipboard.setData(ClipboardData(text: code)); toast(context, tx('Kod kopyalandı.')); }),
                  ),
                if (hidden && code != null) CheckboxListTile(dense: true, value: regen, title: Text(tx('Kodu yenile')), onChanged: (v) => setS(() => regen = v == true)),
              ],
              SwitchListTile(dense: true, title: Text(tx('Yazılı sohbet açık')), value: chatEnabled, onChanged: (v) => setS(() => chatEnabled = v)),
              SwitchListTile(dense: true, title: Text(tx('Koltuk hediye sayacı')), value: scoreboard, onChanged: (v) => setS(() => scoreboard = v)),
              const SizedBox(height: 8),
              Text(tx('Oda teması')),
              const SizedBox(height: 6),
              ThemePicker(value: theme, imageUrl: _room?['themeImageUrl']?.toString(), onChanged: (v) => setS(() => theme = v)),
              TextField(controller: imgCtl, decoration: InputDecoration(labelText: tx('Özel arka plan görseli (https, WIP 4+)'))),
              if (scoreboard)
                TextButton.icon(
                  onPressed: () async {
                    if (await confirm(c, tx('Tüm koltuk hediye sayaçları sıfırlansın mı?'), action: tx('Sıfırla')) && mounted) {
                      await guard(context, () => Api.post('/api/rooms/${widget.roomId}/scoreboard/reset'));
                    }
                  },
                  icon: const Icon(Icons.restart_alt),
                  label: Text(tx('Sayaçları sıfırla')),
                ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tx('Vazgeç'))),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tx('Kaydet'))),
          ],
        ),
      ),
    );
    final pw = pwCtl.text.trim();
    final img = imgCtl.text.trim();
    pwCtl.dispose();
    imgCtl.dispose();
    if (ok != true || !mounted) return;
    final prevImg = (_room?['themeImageUrl'] ?? '').toString();
    final r = await guard(context, () => Api.patch('/api/rooms/${widget.roomId}', {
          'chatEnabled': chatEnabled,
          'scoreboardEnabled': scoreboard,
          'theme': theme,
          if (img != prevImg) 'themeImageUrl': img.isEmpty ? null : img,
          if (_myRole == 'owner') 'hidden': hidden,
          if (_myRole == 'owner' && hidden && regen) 'regenerateCode': true,
          if (_myRole == 'owner' && removePw) 'password': null,
          if (_myRole == 'owner' && !removePw && pw.isNotEmpty) 'password': pw,
        }));
    final room = mapOf(r?['room']);
    if (room != null && mounted) _set(() => _room = {...?_room, ...room});
  }

  void _openMusic() => openRoomMusic(context, roomId: widget.roomId, canManage: _isManager);

  /// Oda içi etkinlikler: kendi sunucumuzdaki sabit H5 sayfası, alt %55'lik pencerede. Sesli yayın kesilmez.
  void _openRoomActivities() => showAppWebViewSheet(
        context,
        url: '${Api.baseUrl}/room-activities?roomId=${Uri.encodeQueryComponent(widget.roomId)}',
        title: tx('Etkinlikler'),
      );
}
