part of '../room_screen.dart';

/// Sohbet: geçmiş, gönderme, temizleme, mesaj kartları, giriş satırı, yazı çubuğu, mesaj işlemleri.
extension _RoomChat on _RoomScreenState {
  /// Yeni gelen kişiye "Hoş geldin" (sohbete yazılır ve odada uçan yazı olarak geçer).
  Future<void> _sendWelcome(Map<String, dynamic> u) async {
    final id = u['id']?.toString();
    if (id == null || _welcomed.contains(id)) return;
    if (!_chatOpen) {
      toast(context, tx('Bu odada yazılı sohbet kapalı.'), error: true);
      return;
    }
    _set(() => _welcomed.add(id));
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/messages', {'text': tx('Hoş geldin {displayName}', {'displayName': u['displayName'] ?? ''}), 'welcome': id}));
    if (r == null && mounted) _set(() => _welcomed.remove(id));
  }

  /// Sohbet geçmişini sunucudan yükler. [initial]: odaya ilk girişte (sohbet en alta indirilir).
  /// Arka plandan / küçültmeden dönünce de çağrılır: yerel satırlar ("odaya girdi", takip kartı, sistem) yerinde kalır ve
  /// okunan yer korunur. (Önceden yerel satırların hepsi listenin sonuna ekleniyordu: dönünce eski "odaya girdi"
  /// satırları sohbetin en altına iniyordu.)
  Future<void> _loadMessages({bool initial = false}) async {
    final epoch = _chatEpoch;
    try {
      final r = await Api.get('/api/rooms/${widget.roomId}/messages');
      // Bu yükleme sürerken sohbet temizlendiyse dönen liste eskidir: temizlenen mesajları geri getirmesin.
      if (!mounted || epoch != _chatEpoch) return;
      _set(() {
        final ids = <String>{};
        final server = listOf(r['messages']).where((m) => ids.add('${m['id']}') && !_beforeClear(m['createdAt'])).toList();
        _messages
          ..replaceRange(0, _messages.length, mergeChatHistory(_messages, server));
      });
      if (initial) _scrollChatToEnd(force: true);
    } catch (_) {/* sohbet yüklenemese de oda çalışır */}
  }

  /// Sohbetin sonuna kaydırır. Kullanıcı yukarı kaydırıp eski mesajları okuyorsa ([force] yoksa) yerinden oynatmaz.
  /// Sohbet ters sıralı listedir (Yoho gibi): en yeni mesaj en altta, liste konumu 0 = en alt. Kullanıcı en alttayken yeni
  /// mesaj kendiliğinden görünür; yukarıda eski mesajları okuyorsa yerinden oynatılmaz, "yeni mesaj" düğmesi çıkar.
  void _scrollChatToEnd({bool force = false}) {
    final reading = _chatScroll.hasClients && _chatScroll.position.pixels > 60;
    if (reading && !force) {
      if (_unseen < 99) _set(() => _unseen++);
      // Ters listede yeni mesaj alta eklenince okunan kısım yukarı kayar; aynı yerde kalsın diye fark kadar kaydırılır.
      final before = _chatScroll.position.maxScrollExtent;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_chatScroll.hasClients) return;
        final d = _chatScroll.position.maxScrollExtent - before;
        if (d > 0) _chatScroll.jumpTo(_chatScroll.position.pixels + d);
      });
      return;
    }
    if (_unseen != 0) _set(() => _unseen = 0);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScroll.hasClients && _chatScroll.position.pixels != 0) _chatScroll.jumpTo(0);
    });
  }

  /// Mesajın ilk harfi büyük (Türkçe: i → İ, ı → I).
  static String _capFirst(String t) => capitalizeFirst(t);

  Future<void> _sendChat() async {
    final text = _capFirst(_chatCtl.text.trim());
    if (text.isEmpty || _sending) return;
    // Diğer uygulamalardaki gibi yazı kutusu HEMEN boşalır (sunucu yanıtı beklenmez); mesaj odaya soketten düşer.
    // Gönderilemezse yazı geri konur (kutuya bu arada yeni bir şey yazılmadıysa), hata gösterilir.
    _set(() => _sending = true);
    final fly = _flyMode;
    _chatCtl.clear();
    final r = await guard(context, () => Api.post('/api/rooms/${widget.roomId}/messages', {'text': text, if (fly) 'fly': true}));
    if (!mounted) return;
    _set(() => _sending = false);
    if (r != null) {
      if (r['balance'] != null) Session.setCoins(r['balance'].toString());
    } else if (_chatCtl.text.isEmpty) {
      _chatCtl.text = text;
      _chatCtl.selection = TextSelection.collapsed(offset: text.length);
    }
  }

  Future<void> _clearChat() async {
    if (!await confirm(context, tx('Odadaki tüm sohbet mesajları herkes için silinsin mi?'), action: tx('Temizle'))) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.delete('/api/rooms/${widget.roomId}/messages'));
    // Soket olayı gecikse / kaçsa da temizleyenin ekranı hemen temizlenir (olay gelince aynı temizleme tekrar yapılmaz).
    if (r != null && mounted) _applyChatClear(r['clearedAt']);
  }

  /// Mesaj temizleme anından önce mi yazılmış (sunucu saatine göre)?
  bool _beforeClear(dynamic createdAt) {
    final c = _chatClearedAt;
    if (c == null || createdAt == null) return false;
    final t = DateTime.tryParse('$createdAt');
    return t != null && !t.isAfter(c);
  }

  /// Sohbeti temizler: tüm mesajlar (yerel satırlar dahil) kalkar, sıradaki uçan yazılar iptal edilir, tek bir
  /// "Sohbetler temizlendi" satırı kalır. Aynı temizleme (aynı an) ikinci kez gelirse yok sayılır.
  void _applyChatClear(dynamic clearedAt) {
    final at = DateTime.tryParse('${clearedAt ?? ''}');
    if (at != null && _chatClearedAt != null && !at.isAfter(_chatClearedAt!)) return;
    _chatEpoch++;
    _chatClearedAt = at ?? DateTime.now().toUtc();
    _fly.clear();
    _set(() {
      _messages.clear();
      _unseen = 0;
    });
    _addSystemMessage(tx('Sohbetler temizlendi.'), color: const Color(0xFF34D399));
  }

  /// Renkli saydam sohbet balonu: kullanıcı seviyesine göre renk (Yoho tarzı lacivert taban).
  Color _bubbleColor(Map<String, dynamic>? u) => bubbleColorOf(u);

  void _addSystemMessage(String text, {Color color = const Color(0xFFFFE27A)}) {
    _set(() {
      _messages.add({'id': 'sys-${DateTime.now().microsecondsSinceEpoch}', 'system': true, 'text': text, 'color': color.toARGB32()});
      if (_messages.length > 200) _messages.removeAt(0);
    });
    _scrollChatToEnd();
  }

  /// Uygulama uyarı duyurusu: odaya girince sohbetin en başında (yönetim panelinden değiştirilir).
  Widget _noticeCard(double maxW) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: maxW),
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(10, 8, 10, 9),
          decoration: BoxDecoration(
            color: const Color(0x99101828),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0x55FFD54F)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.shield_rounded, size: 16, color: Color(0xFFFFD54F)),
              SizedBox(width: 5),
              Text(tx('TR Live Sistem Duyurusu'), style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: Color(0xFFFFD54F))),
            ]),
            const SizedBox(height: 4),
            Text(_appNotice, style: const TextStyle(fontSize: 13, height: 1.35, color: Color(0xFFE5E7EB))),
          ]),
        ),
      );

  /// "Bu yayıncıyı takip edin" kartı (dokununca yayıncı favorilere eklenir).
  Widget _followCard(double maxW) {
    final owner = _members.where((m) => m['role'] == 'owner');
    final ou = (owner.isEmpty ? null : mapOf(owner.first['user'])) ?? mapOf(_room?['owner']);
    return Align(
      alignment: Alignment.centerLeft,
      child: GestureDetector(
        onTap: () async {
          if (!_fav) await _toggleFavorite();
          if (mounted && _fav) _set(() => _messages.removeWhere((m) => m['follow'] == true));
        },
        child: Container(
          constraints: BoxConstraints(maxWidth: maxW),
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          decoration: BoxDecoration(color: const Color(0xFF22D37E), borderRadius: BorderRadius.circular(22)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.add, color: Colors.white, size: 24),
            const SizedBox(width: 8),
            Flexible(child: Text(tx('Bu yayıncıyı takip edin, eğlenceyi kaçırmayın!'), style: TextStyle(color: Colors.white, fontSize: 14, height: 1.25, fontWeight: FontWeight.w600))),
            const SizedBox(width: 8),
            Container(padding: const EdgeInsets.all(1.5), decoration: const BoxDecoration(shape: BoxShape.circle, color: Colors.white), child: UserAvatar(user: ou, radius: 15)),
          ]),
        ),
      ),
    );
  }

  /// Girdi satırı. Son 3 günde kayıt olanlar için "yakın zamanda kayıt oldu" kartı ve "Hoş geldiniz" düğmesi.
  Widget _joinLine(Map<String, dynamic>? ju, double maxW) {
    final id = ju?['id']?.toString();
    final isNew = ju?['isNew'] == true && id != Session.id;
    final head = Wrap(spacing: 4, runSpacing: 2, crossAxisAlignment: WrapCrossAlignment.center, children: [
      badgeRow(ju, h: 15),
      nameText(ju),
      Text(tx('odaya girdi'), style: TextStyle(fontSize: 13, color: Colors.white70)),
    ]);
    final hiddenJoin = ju?['isHidden'] == true;
    if (!isNew) {
      return Align(
        alignment: Alignment.centerLeft,
        child: Container(
          constraints: BoxConstraints(maxWidth: maxW),
          margin: const EdgeInsets.symmetric(vertical: 3),
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          // Gizli kullanıcının girişi siyah-altın şeritle (mor değil).
          decoration: hiddenJoin
              ? BoxDecoration(
                  gradient: const LinearGradient(colors: [Color(0xE60B0906), Color(0xCC2A1F08)]),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: const Color(0x99F2B92A)),
                )
              : BoxDecoration(color: const Color(0x6613285A), borderRadius: BorderRadius.circular(14)),
          child: head,
        ),
      );
    }
    final done = _welcomed.contains(id);
    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(maxWidth: maxW),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
        decoration: BoxDecoration(color: const Color(0x8C13285A), borderRadius: BorderRadius.circular(14)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              margin: const EdgeInsets.only(right: 6),
              decoration: BoxDecoration(color: const Color(0xFFFF3D71), borderRadius: BorderRadius.circular(6)),
              child: Text(tx('YENİ'), style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Colors.white)),
            ),
            Flexible(child: head),
          ]),
          const SizedBox(height: 5),
          Text(tx('Bu kullanıcı yakın zamanda kayıt oldu.'), style: TextStyle(fontSize: 14, color: Color(0xFFFFE27A), fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: done
                ? null
                : () {
                    if (ju != null) _sendWelcome(ju);
                  },
            child: Opacity(
              opacity: done ? 0.55 : 1,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: const LinearGradient(colors: [Color(0xFF7C3AED), Color(0xFF2563EB)]),
                  border: Border.all(color: const Color(0xFFFDE047), width: 1.5),
                ),
                child: Text(done ? tx('👏 Selam gönderildi') : tx('👏 Hoş geldiniz'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  /// Sohbet akışı (Yoho): koltukların altından alt bara kadar, saydam renkli balonlar.
  /// [overlay]: klavye açıkken karartının üstünde balonsuz düz yazı.
  /// Sohbet bölümü: en üstte uçan yazı şeridi (yazı geçerken yer açılır), altında mesajlar.
  Widget _chatPanel(double w, {bool overlay = false, double? rightPad}) {
    if (overlay) return _chatList(w, overlay: true, rightPad: rightPad);
    return Column(children: [
      AnimatedBuilder(
        animation: _fly,
        builder: (context, _) => AnimatedSize(
          duration: const Duration(milliseconds: 200),
          child: _fly.active ? ClipRect(child: Padding(padding: const EdgeInsets.only(top: 2), child: FlyTextLayer(queue: _fly))) : const SizedBox(width: double.infinity),
        ),
      ),
      Expanded(
        child: Stack(children: [
          Positioned.fill(child: _chatList(w, rightPad: rightPad)),
          // Eski mesajlar okunurken yeni mesaj gelirse: dokununca en alta iner.
          if (_unseen > 0)
            Positioned(
              left: 8,
              bottom: 6,
              child: GestureDetector(
                onTap: () {
                  _set(() => _unseen = 0);
                  if (_chatScroll.hasClients) _chatScroll.animateTo(0, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(color: const Color(0xFFF2B92A), borderRadius: BorderRadius.circular(14), boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 4)]),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.keyboard_double_arrow_down, size: 16, color: Colors.black),
                    const SizedBox(width: 3),
                    Text(tx('{n} yeni mesaj', {'n': _unseen}), style: const TextStyle(color: Colors.black, fontWeight: FontWeight.w800, fontSize: 12)),
                  ]),
                ),
              ),
            ),
        ]),
      ),
    ]);
  }

  Widget _chatList(double w, {bool overlay = false, double? rightPad}) {
    // Sabit başlık kartları: uygulama uyarı duyurusu ve oda duyurusu.
    final ann = (_room?['announcement'] ?? '').toString().trim();
    final maxW = w * 0.78;
    // Duyurular: odaya ilk girişte kısa süre, ayrıca sohbette kimsenin yazısı yokken (ör. sohbet temizlenince) görünür;
    // biri yazınca kalkar.
    final noText = !_messages.any((m) => m['join'] != true && m['follow'] != true && m['system'] != true);
    final showHeads = _showHeads || noText;
    final heads = <Widget>[
      if (showHeads && _appNotice.isNotEmpty && !overlay) _noticeCard(maxW),
      if (showHeads && ann.isNotEmpty) announcementCard(ann, maxW),
    ];
    const head = 0; // duyurular artık listenin içinde değil, sohbetin en üstünde (aşağıda) durur
    if (_messages.isEmpty && heads.isEmpty) return const SizedBox.shrink();
    final total = _messages.length + head;
    // Ters liste: en yeni mesaj en altta; ekran dolunca da son yazılan hep görünür.
    final list = ListView.builder(
      controller: _chatScroll,
      reverse: true,
      padding: EdgeInsets.fromLTRB(8, overlay ? 10 : 2, rightPad ?? w * 0.2, 8),
      itemCount: total,
      itemBuilder: (_, rIdx) {
        final idx = total - 1 - rIdx;
        if (idx < head) return heads[idx];
        final i = idx - head;
        final m = _messages[i];
        if (m['follow'] == true) return overlay ? const SizedBox.shrink() : _followCard(maxW);
        if (m['join'] == true) return _joinLine(mapOf(m['user']), maxW);
        if (m['system'] == true) {
          return Align(
            alignment: Alignment.centerLeft,
            child: Container(
              constraints: BoxConstraints(maxWidth: maxW),
              margin: const EdgeInsets.symmetric(vertical: 4),
              padding: overlay ? const EdgeInsets.symmetric(horizontal: 4, vertical: 2) : const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: overlay ? null : BoxDecoration(color: const Color(0x8C13285A), borderRadius: BorderRadius.circular(12)),
              child: Text((m['text'] ?? '').toString(), style: TextStyle(fontSize: 14.5, height: 1.3, color: Color((m['color'] as int?) ?? 0xFFFFE27A))),
            ),
          );
        }
        final u = mapOf(m['user']);
        final text = Text((m['text'] ?? '').toString(), style: const TextStyle(fontSize: 15, height: 1.25, shadows: [Shadow(color: Colors.black38, blurRadius: 2)]));
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onLongPress: () => _messageActions(m),
          onTap: () {
            final uid = u?['id']?.toString();
            final mem = _members.where((x) => x['userId'] == uid);
            if (mem.isNotEmpty) _memberSheet(mem.first);
          },
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              UserAvatar(user: u, radius: 18),
              const SizedBox(width: 8),
              Flexible(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  // Ad, altında rozet sırası, altında mesaj balonu.
                  nameText(u, size: 13.5, fallback: Colors.white),
                  const SizedBox(height: 3),
                  badgeRow(u),
                  const SizedBox(height: 5),
                  if (overlay)
                    Container(constraints: BoxConstraints(maxWidth: maxW - 44), child: text)
                  else if (Api.absoluteUrl(u?['chatBubbleUrl'] as String?) != null)
                    // Mağazadan alınıp takılan sohbet balonu.
                    StoreBubble(
                      url: Api.absoluteUrl(u?['chatBubbleUrl'] as String?)!,
                      constraints: BoxConstraints(maxWidth: maxW - 44),
                      child: m['fly'] == true
                          ? Row(mainAxisSize: MainAxisSize.min, children: [
                              const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.send_rounded, size: 14, color: Color(0xFFFF80AB))),
                              Flexible(child: text),
                            ])
                          : text,
                    )
                  else
                    // WIP sohbet balonu (kademeye göre renk, ışık ve köşe süsü); WIP yoksa seviye rengi.
                    WipBubble(
                      level: wipLevelOf(u?['wipBubble'] ?? u?['wipLevel']),
                      fallback: _bubbleColor(u),
                      constraints: BoxConstraints(maxWidth: maxW - 44),
                      child: m['fly'] == true
                          ? Row(mainAxisSize: MainAxisSize.min, children: [
                              const Padding(padding: EdgeInsets.only(right: 4), child: Icon(Icons.send_rounded, size: 14, color: Color(0xFFFF80AB))),
                              Flexible(child: text),
                            ])
                          : text,
                    ),
                ]),
              ),
            ]),
          ),
        );
      },
    );
    if (heads.isEmpty) return list;
    // Duyurular (uygulama + oda) sohbetin EN ÜSTÜNDE sabit durur; mesajlar altında akar.
    return Column(children: [
      ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.3),
        child: SingleChildScrollView(padding: EdgeInsets.fromLTRB(8, overlay ? 10 : 2, rightPad ?? w * 0.2, 0), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: heads)),
      ),
      Expanded(child: list),
    ]);
  }

  void _closeInput() {
    _kbSeen = false;
    FocusManager.instance.primaryFocus?.unfocus();
    if (_inputOpen) _set(() => _inputOpen = false);
  }

  void _openInput() {
    if (!_chatOpen) {
      toast(context, tx('Bu odada yazılı sohbet kapalı.'), error: true);
      return;
    }
    _kbSeen = false;
    _set(() => _inputOpen = true);
    _scrollChatToEnd(force: true);
  }

  /// Yazı alanı: klavyenin hemen üstünde koyu şerit (uygulama renkleri); boşluğa dokununca kapanır.
  /// Solda "Uçan yazı" anahtarı, ortada yuvarlak yazı kutusu (emoji düğmesi içinde), sağda renkli gönder düğmesi.
  Widget _inputBar() {
    final canSend = !_sending && !_chatMuted;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
      decoration: const BoxDecoration(
        color: Color(0xF2111827),
        border: Border(top: BorderSide(color: Color(0x33FFFFFF), width: 0.6)),
      ),
      child: Row(children: [
        // Uçan yazı anahtarı: açıkken mesaj odanın üstünden uçarak geçer (ücretli).
        GestureDetector(
          onTap: () {
            _set(() => _flyMode = !_flyMode);
            if (_flyMode) toast(context, _flyCost > 0 ? tx('Uçan yazı açık: her mesaj {flyCost} Coin.', {'flyCost': _flyCost}) : tx('Uçan yazı açık.'));
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 40,
            height: 40,
            margin: const EdgeInsets.only(right: 8),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: _flyMode ? const LinearGradient(colors: kGoldDeep) : null,
              color: _flyMode ? null : const Color(0x1FFFFFFF),
              border: Border.all(color: _flyMode ? Colors.white54 : Colors.white24),
            ),
            child: Icon(Icons.flight_takeoff_rounded, size: 19, color: _flyMode ? Colors.white : Colors.white70),
          ),
        ),
        Expanded(
          child: TextField(
            controller: _chatCtl,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            maxLength: _flyMode ? 80 : 300,
            enabled: !_chatMuted,
            minLines: 1,
            maxLines: 3,
            textInputAction: TextInputAction.send,
            onSubmitted: (_) => _sendChat(),
            cursorColor: Pal.cyan,
            style: const TextStyle(color: Colors.white, fontSize: 15),
            decoration: InputDecoration(
              isDense: true,
              counterText: '',
              hintText: _chatMuted ? tx('Sohbette susturuldunuz') : (_flyMode ? (_flyCost > 0 ? tx('Uçan yazı · {flyCost} Coin', {'flyCost': _flyCost}) : tx('Uçan yazı')) : tx('Bir şeyler yaz...')),
              hintStyle: const TextStyle(color: Colors.white38),
              filled: true,
              fillColor: const Color(0x1AFFFFFF),
              contentPadding: const EdgeInsets.fromLTRB(16, 11, 4, 11),
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Color(0x26FFFFFF))),
              disabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Color(0x14FFFFFF))),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Color(0x991FD6F5))),
              suffixIcon: IconButton(onPressed: _chatOpen ? _emojiSheet : null, icon: const Icon(Icons.emoji_emotions_outlined, color: Colors.white70)),
            ),
          ),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: canSend ? _sendChat : null,
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: canSend ? const LinearGradient(colors: kGoldDeep) : null,
              color: canSend ? null : Colors.white12,
              boxShadow: canSend ? const [BoxShadow(color: Color(0x55E6B13A), blurRadius: 10)] : null,
            ),
            child: _sending
                ? const Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.send_rounded, color: Colors.white, size: 20),
          ),
        ),
      ]),
    );
  }

  void _messageActions(Map<String, dynamic> m) {
    final u = mapOf(m['user']);
    final mine = u?['id'] == Session.id;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (mine || _isManager)
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: Text(tx('Mesajı sil')),
              onTap: () {
                Navigator.pop(c);
                guard(context, () => Api.delete('/api/rooms/${widget.roomId}/messages/${m['id']}'));
              },
            ),
          if (!mine)
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: Text(tx('Mesajı şikâyet et')),
              onTap: () {
                Navigator.pop(c);
                reportDialog(context, kind: 'room_message', targetUserId: u?['id'] as String?, roomId: widget.roomId, messageId: m['id'] as String?);
              },
            ),
        ]),
      ),
    );
  }
}
