part of '../room_screen.dart';

/// Üye kartı ve yönetim işlemleri: rol, susturma, şikâyet, yetkili yaptırımları.
extension _RoomMembers on _RoomScreenState {
  void _memberSheet(Map<String, dynamic> m) {
    final userId = m['userId'].toString();
    final user = mapOf(m['user']);
    final isSelf = userId == Session.id;
    final role = (m['role'] ?? 'user').toString();
    final seat = m['seatIndex'] == null ? null : (m['seatIndex'] as num).toInt();
    // Yetkiler: kendi rolüm hedefin rolünden yüksek olmalı (oda sahibine dokunulamaz).
    final canMod = !isSelf && _canModerate(role);
    final canRole = !isSelf && (_myRole == 'owner' || _myRole == 'cohost') && role != 'owner' && (_myRole == 'owner' || role != 'cohost');
    // Gizli kullanıcı (Yoho gizemli kişi): profili, ilişkileri, seviyesi gösterilmez; dokununca profil açılmaz.
    // Hediye, etiketleme, şikâyet ve oda yönetimi çalışır.
    final hiddenUser = !isSelf && user?['isHidden'] == true;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (c) {
        void close() => Navigator.pop(c);
        Widget action(IconData icon, String label, VoidCallback onTap, {Color color = Pal.amber}) => Expanded(
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: onTap,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    CircleAvatar(radius: 22, backgroundColor: color, child: Icon(icon, color: Colors.black87, size: 24)),
                    const SizedBox(height: 4),
                    FittedBox(fit: BoxFit.scaleDown, child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600))),
                  ]),
                ),
              ),
            );
        Widget bigAction(IconData icon, String label, VoidCallback onTap) => Expanded(
              child: InkWell(
                onTap: onTap,
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(icon, color: Pal.amber, size: 34),
                    const SizedBox(height: 2),
                    FittedBox(fit: BoxFit.scaleDown, child: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
                  ]),
                ),
              ),
            );
        return FutureBuilder<List<Map<String, dynamic>?>>(
          future: hiddenUser
              ? Future.value(const <Map<String, dynamic>?>[null, null, null])
              : Future.wait([
                  Api.get('/api/users/$userId').then<Map<String, dynamic>?>((r) => mapOf(r['profile'])).catchError((_) => null),
                  Api.get('/api/users/$userId/card').then<Map<String, dynamic>?>((r) => r).catchError((_) => null),
                  Api.get('/api/cp/wall/$userId').then<Map<String, dynamic>?>((r) => r).catchError((_) => null),
                ]),
          builder: (context, snap) {
            final profile = snap.data?[0];
            final card = snap.data?[1];
            final wall = snap.data?[2];
            final medals = listOf(card?['medals']);
            // Yakın arkadaşlar: önce CP (pembe kalp), sonra En İyi Arkadaş (mor) ve Kanka (mavi) — profildeki ilişki duvarı.
            final cpUser = mapOf(mapOf(wall?['cp'])?['user']);
            final rels = <(String, Map<String, dynamic>)>[
              for (final it in listOf(mapOf(wall?['friend'])?['items']))
                if (mapOf(it['user']) != null) ('friend', mapOf(it['user'])!),
              for (final it in listOf(mapOf(wall?['kanka'])?['items']))
                if (mapOf(it['user']) != null) ('kanka', mapOf(it['user'])!),
            ];
            void openUser(Map<String, dynamic> u) {
              final id = u['id']?.toString();
              if (id == null || u['isHidden'] == true) return;
              close();
              Navigator.push(this.context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: id)));
            }
            var following = profile?['isFollowing'] == true;
            final family = mapOf(profile?['family']);
            final username = (profile?['publicId'] ?? user?['publicId'] ?? profile?['username'] ?? user?['username'] ?? '').toString();
            return StatefulBuilder(
              builder: (context, setS) => SafeArea(
                child: Padding(
                  padding: const EdgeInsets.only(top: 48),
                  child: Stack(clipBehavior: Clip.none, alignment: Alignment.topCenter, children: [
                    Container(
                      // Kompakt kart (Yoho / Mico ölçüsü): ekranın en fazla %66'sı; fazlası kaydırılır.
                      constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.66),
                      // Takılı profil kartı (mağaza) varsa kartın arka planı olur.
                      clipBehavior: Clip.antiAlias,
                      decoration: const BoxDecoration(
                        color: Color(0xFF26262B),
                        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
                      ),
                      child: Stack(children: [
                        Positioned.fill(child: CardBackdrop(url: Api.absoluteUrl(user?['profileCardUrl'] as String?))),
                        SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(16, 52, 16, 0),
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          Text((user?['displayName'] ?? '').toString(), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 6),
                          Wrap(alignment: WrapAlignment.center, spacing: 6, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                            if (user?['isHidden'] != true) ...[
                              LevelPill(level: user?['coinLevel'] ?? 1, send: true, height: 20),
                              LevelPill(level: user?['giftLevel'] ?? 1, send: false, height: 20),
                            ],
                            if (wipLevelOf(user?['wipBadge'] ?? user?['wipLevel']) != null)
                              WipChip(level: user?['wipBadge'] ?? user?['wipLevel'], colorHex: user?['nameColor'] as String?, height: 20),
                            if (role != 'user') pill(_roleLabels[role] ?? role, Pal.cyan),
                            if (family != null) pill('${family['name']}', Pal.red),
                            if ((profile?['hostBadge'] ?? user?['hostBadge']) != null) HostBadgeChip(badge: (profile?['hostBadge'] ?? user?['hostBadge'])?.toString(), height: 20),
                            if (seat != null) pill('${seat + 1}. koltuk', Colors.white24),
                            // Koruyucu ayrıcalığı: en yüksek puanlı koruyucu mini kartta görünür.
                            if (mapOf(mapOf(profile?['guardian'])?['user']) != null)
                              Container(
                                padding: const EdgeInsets.fromLTRB(2, 2, 8, 2),
                                decoration: BoxDecoration(color: const Color(0xFFFF4FA8), borderRadius: BorderRadius.circular(12)),
                                child: Row(mainAxisSize: MainAxisSize.min, children: [
                                  UserAvatar(user: mapOf(mapOf(profile?['guardian'])?['user']), radius: 9),
                                  const SizedBox(width: 4),
                                  Text('${tx('Koruyucu')}: ${mapOf(mapOf(profile?['guardian'])?['user'])?['displayName'] ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                                ]),
                              ),
                          ]),
                          const SizedBox(height: 8),
                          if (user?['isHidden'] == true) ...[
                            IdBadge(user: user, fontSize: 13),
                            if (hiddenUser)
                              Padding(
                                padding: EdgeInsets.only(top: 8),
                                child: Text(tx('Bu kullanıcı kimliğini gizliyor; profili görüntülenemez.'),
                                    textAlign: TextAlign.center, style: TextStyle(color: Colors.white54, fontSize: 12.5)),
                              ),
                          ] else if ((profile?['specialId'] ?? user?['specialId'] ?? profile?['publicId'] ?? user?['publicId']) != null)
                            IdBadge(
                              user: {
                                'publicId': profile?['publicId'] ?? user?['publicId'],
                                'specialId': profile?['specialId'] ?? user?['specialId'],
                                'idColor': profile?['idColor'] ?? user?['idColor'],
                                'wipLevel': user?['wipLevel'],
                                'nameColor': user?['nameColor'],
                              },
                              fontSize: 13,
                            )
                          else if (username.isNotEmpty)
                            InkWell(
                              onTap: () {
                                Clipboard.setData(ClipboardData(text: username));
                                toast(context, tx('Kimlik kopyalandı.'));
                              },
                              child: Row(mainAxisSize: MainAxisSize.min, children: [
                                Text('ID: $username', style: const TextStyle(color: Colors.white70)),
                                const SizedBox(width: 4),
                                const Icon(Icons.copy, size: 14, color: Colors.white54),
                              ]),
                            ),
                          // Cinsiyet / yaş, konum ve kısa biyografi.
                          if (profile != null) ...[
                            const SizedBox(height: 8),
                            Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
                              if (profile['gender'] == 'male' || profile['gender'] == 'female')
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: profile['gender'] == 'female' ? const Color(0xFFFF4FA8) : const Color(0xFF3B9BFF),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                                    Icon(profile['gender'] == 'female' ? Icons.female : Icons.male, size: 13, color: Colors.white),
                                    if (profile['age'] != null) Text(' ${profile['age']}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.white)),
                                  ]),
                                ),
                              if ('${profile['city'] ?? profile['country'] ?? ''}'.isNotEmpty)
                                Row(mainAxisSize: MainAxisSize.min, children: [
                                  const Icon(Icons.place, size: 14, color: Colors.white60),
                                  Flexible(
                                    child: Text(' ${[profile['city'], profile['country']].where((x) => '${x ?? ''}'.isNotEmpty).join(', ')}',
                                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                                  ),
                                ]),
                            ]),
                            if ('${profile['bio'] ?? ''}'.trim().isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text('${profile['bio']}'.trim(), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(color: Colors.white60, fontSize: 12.5)),
                              ),
                            const SizedBox(height: 10),
                            Row(children: [
                              for (final (label, v) in [(tx('Takipçi'), profile['followers']), (tx('Takip'), profile['following']), (tx('Arkadaş'), profile['friends'])])
                                Expanded(
                                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                                    Text(fmtCompact(v ?? 0), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w900)),
                                    Text(label, style: const TextStyle(color: Colors.white54, fontSize: 11.5)),
                                  ]),
                                ),
                            ]),
                          ],
                          if (snap.connectionState != ConnectionState.done)
                            const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2)))
                          else if (cpUser != null || rels.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Center(
                              child: SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.end, children: [
                                  if (cpUser != null)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 6),
                                      child: GestureDetector(
                                        onTap: () => openUser(cpUser),
                                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                                          HeartAvatar(user: cpUser, size: 62),
                                          const SizedBox(height: 4),
                                          const RelationTag('cp'),
                                        ]),
                                      ),
                                    ),
                                  for (final r in rels)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 6),
                                      child: GestureDetector(
                                        onTap: () => openUser(r.$2),
                                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                                          RelationAvatar(user: r.$2, kind: r.$1, radius: 23),
                                          const SizedBox(height: 4),
                                          RelationTag(r.$1),
                                        ]),
                                      ),
                                    ),
                                ]),
                              ),
                            ),
                          ],
                          // Rozetler: yalnızca varsa (başlıksız).
                          if (medals.isNotEmpty) ...[
                            const SizedBox(height: 12),
                            Center(
                              child: SingleChildScrollView(
                                scrollDirection: Axis.horizontal,
                                child: Row(mainAxisSize: MainAxisSize.min, children: [
                                  for (final md in medals)
                                    Padding(
                                      padding: const EdgeInsets.symmetric(horizontal: 4),
                                      child: Tooltip(
                                        message: (md['name'] ?? '').toString(),
                                        child: Api.absoluteUrl(md['assetUrl'] as String?) != null
                                            ? NetImg(Api.absoluteUrl(md['assetUrl'] as String?)!, width: 52, height: 52, errorBuilder: (_, __, ___) => const Icon(Icons.military_tech, color: Pal.amber, size: 40))
                                            : const Icon(Icons.military_tech, color: Pal.amber, size: 40),
                                      ),
                                    ),
                                ]),
                              ),
                            ),
                          ],
                          const SizedBox(height: 4),
                          // CP / yakınlık: iki kişi arasındaki seviye ve ilişki seçimi (3. kademeden itibaren).
                          // Yalnızca bende sesini kapat (koltuktaki kişi için; karşı taraf bilmez).
                          if (!isSelf && seat != null)
                            TextButton.icon(
                              onPressed: () { close(); _toggleLocalMute(userId); },
                              icon: Icon(_localMuted.contains(userId) ? Icons.volume_up : Icons.volume_off, size: 18, color: Colors.white70),
                              label: Text(_localMuted.contains(userId) ? tx('Sesini aç (bende)') : tx('Sesini kapat (bende)'), style: const TextStyle(color: Colors.white70)),
                            ),
                          if (!isSelf && !hiddenUser) CpPanel(userId: userId, displayName: (user?['displayName'] ?? '').toString(), user: user),
                          // Yönetim düğmeleri: yalnızca yetkili olana görünür.
                          if (canMod || canRole) ...[
                            const SizedBox(height: 10),
                            Row(children: [
                              if (canRole)
                                action(Icons.manage_accounts, tx('Yönetici'), () {
                                  close();
                                  _roleChoice(userId, role);
                                }),
                              if (canMod)
                                seat != null
                                    ? (_mutedSeats.contains(seat)
                                        ? action(Icons.mic, tx('Sesi Aç'), () { close(); _muteSeat(seat, false); })
                                        : action(Icons.mic_off, tx('Sustur'), () { close(); _muteSeat(seat, true); }, color: Colors.white70))
                                    : action(Icons.mic, tx('Mic Aç'), () { close(); _moderate(userId, 'mic-invite', body: {}); }),
                              if (canMod) action(Icons.comments_disabled, tx('Sohbet'), () { close(); _muteChoice(userId); }),
                              if (canMod && seat != null) action(Icons.event_seat, tx('Koltuk'), () { close(); _moderate(userId, 'mic-off'); _lockSeat(seat, true); }),
                              if (canMod) action(Icons.exit_to_app, tx('Odadan At'), () async {
                                close();
                                if (await confirm(this.context, tx('{displayName} odadan atılsın mı?', {'displayName': user?['displayName'] ?? tx('Kullanıcı')}), action: tx('At'))) _moderate(userId, 'kick');
                              }),
                            ]),
                          ],
                          const SizedBox(height: 8),
                          const Divider(height: 1, color: Colors.white12),
                          Row(children: [
                            bigAction(Icons.alternate_email, tx('Etiketle'), () {
                              close();
                              final name = (user?['displayName'] ?? '').toString();
                              _chatCtl.text = '${_chatCtl.text}@$name ';
                              _chatCtl.selection = TextSelection.collapsed(offset: _chatCtl.text.length);
                            }),
                            bigAction(Icons.card_giftcard, tx('Hediye Gönder'), () {
                              close();
                              _openGifts(userId);
                            }),
                            if (hiddenUser)
                              const SizedBox.shrink()
                            else if (!isSelf)
                              bigAction(following ? Icons.check : Icons.add, following ? tx('Takipte') : tx('Takip Et'), () async {
                                final ok = await guard<bool>(this.context, () async {
                                  if (following) {
                                    await Api.delete('/api/users/$userId/follow');
                                  } else {
                                    await Api.post('/api/users/$userId/follow');
                                  }
                                  return true;
                                });
                                if (ok == true) setS(() => following = !following);
                              })
                            else
                              bigAction(Icons.person, tx('Profilim'), () {
                                close();
                                Navigator.push(this.context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: userId)));
                              }),
                          ]),
                        ]),
                        ),
                      ]),
                    ),
                    // Üstte taşan büyük avatar (dokununca tam profil)
                    Positioned(
                      top: -48,
                      child: GestureDetector(
                        onTap: hiddenUser
                            ? null
                            : () {
                                close();
                                Navigator.push(this.context, MaterialPageRoute(builder: (_) => UserProfileScreen(userId: userId)));
                              },
                        child: UserAvatar(user: user, radius: 48),
                      ),
                    ),
                    if (!isSelf)
                      Positioned(
                        top: 10,
                        left: 12,
                        child: IconButton(
                          tooltip: tx('Şikâyet / engelle'),
                          icon: const Icon(Icons.error_outline, color: Pal.amber, size: 30),
                          onPressed: () {
                            close();
                            _reportMenu(userId, (user?['displayName'] ?? tx('Kullanıcı')).toString(), canMod);
                          },
                        ),
                      ),
                    Positioned(
                      top: 10,
                      right: 12,
                      child: IconButton(tooltip: tx('Kapat'), icon: const CircleAvatar(radius: 16, backgroundColor: Pal.amber, child: Icon(Icons.close, color: Colors.black, size: 20)), onPressed: close),
                    ),
                  ]),
                ),
              ),
            );
          },
        );
      },
    );
  }

  void _roleChoice(String userId, String role) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          if (role != 'moderator') ListTile(leading: const Icon(Icons.shield), title: Text(tx('Moderatör yap')), onTap: () { Navigator.pop(c); _moderate(userId, 'role', body: {'role': 'moderator'}); }),
          if (_myRole == 'owner' && role != 'cohost') ListTile(leading: const Icon(Icons.stars), title: Text(tx('Yardımcı sahip yap')), onTap: () { Navigator.pop(c); _moderate(userId, 'role', body: {'role': 'cohost'}); }),
          if (role != 'user') ListTile(leading: const Icon(Icons.remove_moderator), title: Text(tx('Yetkiyi al')), onTap: () { Navigator.pop(c); _moderate(userId, 'role', body: {'role': 'user'}); }),
        ]),
      ),
    );
  }

  void _muteChoice(String userId) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          for (final mins in const [10, 60, 1440])
            ListTile(
              leading: const Icon(Icons.comments_disabled),
              title: Text(tx('Sohbette sustur ({t})', {'t': mins == 1440 ? tx('1 gün') : (mins == 60 ? tx('1 saat') : tx('{n} dk', {'n': mins}))})),
              onTap: () { Navigator.pop(c); _moderate(userId, 'chat-mute', body: {'minutes': mins}); },
            ),
          ListTile(leading: const Icon(Icons.chat), title: Text(tx('Susturmayı kaldır')), onTap: () { Navigator.pop(c); _moderate(userId, 'chat-mute', body: {'minutes': 0}); }),
        ]),
      ),
    );
  }

  void _reportMenu(String userId, String name, bool canRoomBlock) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (c) => SafeArea(
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.flag_outlined), title: Text(tx('Şikâyet et')), onTap: () { Navigator.pop(c); reportDialog(context, kind: 'user', targetUserId: userId, roomId: widget.roomId); }),
          ListTile(leading: const Icon(Icons.person_off_outlined), title: Text(tx('Kullanıcıyı engelle')), onTap: () { Navigator.pop(c); blockUserDialog(context, userId, name); }),
          if (canRoomBlock) ...[
            ListTile(
              leading: const Icon(Icons.block, color: Colors.orangeAccent),
              title: Text(tx('Odadan banla')),
              subtitle: Text(tx('Bu odaya bir daha giremez')),
              onTap: () async {
                Navigator.pop(c);
                if (await confirm(context, tx('{name} bu odadan banlansın mı?', {'name': name}), action: tx('Banla'), destructive: true)) _moderate(userId, 'block');
              },
            ),
            ListTile(
              leading: const Icon(Icons.exit_to_app),
              title: Text(tx('Odadan at')),
              subtitle: Text(tx('24 saat bu odaya giremez')),
              onTap: () async {
                Navigator.pop(c);
                if (await confirm(context, tx('{name} odadan atılsın mı? 24 saat bu odaya giremez.', {'name': name}), action: tx('At'))) _moderate(userId, 'kick');
              },
            ),
            ListTile(leading: const Icon(Icons.comments_disabled), title: Text(tx('Sohbette sustur')), onTap: () { Navigator.pop(c); _muteChoice(userId); }),
          ],
          // Uygulama yöneticisi / yardımcı admin kısayolları (yetkiyi sunucu ayrıca denetler).
          if (Session.isStaff) ...[
            const Divider(height: 1),
            Padding(
              padding: EdgeInsets.fromLTRB(16, 10, 16, 2),
              child: Align(alignment: Alignment.centerLeft, child: Text(tx('Yönetici kısayolları'), style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w800, fontSize: 13))),
            ),
            ListTile(
              leading: const Icon(Icons.gavel, color: Colors.redAccent),
              title: Text(tx('Kullanıcıyı banla'), style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.w700)),
              onTap: () { Navigator.pop(c); _staffBan(userId, name); },
            ),
            if (Session.isAdmin)
              ListTile(
                leading: const Icon(Icons.speaker_notes_off_outlined),
                title: Text(tx('Uygulamada sohbet yasağı')),
                onTap: () { Navigator.pop(c); _staffChatBan(userId, name); },
              ),
            ListTile(
              leading: const Icon(Icons.drive_file_rename_outline),
              title: Text(tx('Adını değiştir')),
              onTap: () { Navigator.pop(c); _staffRename(userId, name); },
            ),
            ListTile(
              leading: const Icon(Icons.no_photography_outlined),
              title: Text(tx('Profil fotoğrafını kaldır')),
              onTap: () { Navigator.pop(c); _staffRemoveAvatar(userId, name); },
            ),
          ],
        ]),
        ),
      ),
    );
  }

  /// Yönetici kısayolu: süre seçilir, neden (isteğe bağlı) yazılır, onaylanınca hesap banlanır.
  Future<void> _staffBan(String userId, String name) async {
    final options = <(String, int?)>[(tx('1 saat'), 1), (tx('1 gün'), 24), (tx('7 gün'), 168), (tx('30 gün'), 720), (tx('Süresiz'), null)];
    final picked = await showModalBottomSheet<(String, int?)>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(tx('{name} · ban süresi', {'name': name}), style: const TextStyle(fontWeight: FontWeight.w800))),
          for (final o in options)
            ListTile(leading: Icon(o.$2 == null ? Icons.block : Icons.timer_outlined, color: Colors.redAccent), title: Text(o.$1), onTap: () => Navigator.pop(c, o)),
        ]),
      ),
    );
    if (picked == null || !mounted) return;
    final reasonField = tx('Neden');
    final f = await formDialog(context, tx('Ban nedeni (isteğe bağlı)'), [reasonField]);
    if (f == null || !mounted) return;
    if (!await confirm(context, tx('{name} {v1} banlansın mı? Tüm oturumları kapanır ve odalardan çıkarılır.', {'name': name, 'v1': picked.$2 == null ? tx('süresiz') : picked.$1}), action: tx('Banla'), destructive: true)) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/users/$userId/ban', {if (picked.$2 != null) 'hours': picked.$2, 'reason': (f[reasonField] ?? '').trim()}));
    if (r != null && mounted) toast(context, tx('{name} banlandı ({v1}).', {'name': name, 'v1': picked.$1}));
  }

  Future<void> _staffChatBan(String userId, String name) async {
    final options = <(String, int)>[(tx('1 saat'), 60), (tx('1 gün'), 1440), (tx('7 gün'), 10080), (tx('Yasağı kaldır'), 0)];
    final picked = await showModalBottomSheet<(String, int)>(
      context: context,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(padding: const EdgeInsets.only(bottom: 6), child: Text(tx('{name} · sohbet yasağı', {'name': name}), style: const TextStyle(fontWeight: FontWeight.w800))),
          for (final o in options)
            ListTile(leading: Icon(o.$2 == 0 ? Icons.chat : Icons.speaker_notes_off_outlined), title: Text(o.$1), onTap: () => Navigator.pop(c, o)),
        ]),
      ),
    );
    if (picked == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/users/$userId/chat-restriction', {'minutes': picked.$2}));
    if (r != null && mounted) toast(context, picked.$2 == 0 ? tx('Sohbet yasağı kaldırıldı.') : tx('{name} {t} sohbet edemeyecek.', {'name': name, 't': picked.$1}));
  }

  Future<void> _staffRename(String userId, String name) async {
    final nameField = tx('Yeni ad');
    final f = await formDialog(context, tx('Görünen adı değiştir'), [nameField], initial: {nameField: name});
    if (f == null || !mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/users/$userId/display-name', {'displayName': (f[nameField] ?? '').trim()}));
    if (r != null && mounted) toast(context, tx('Ad değiştirildi.'));
  }

  Future<void> _staffRemoveAvatar(String userId, String name) async {
    if (!await confirm(context, tx('{name} adlı kullanıcının profil fotoğrafı kaldırılsın mı?', {'name': name}), action: tx('Kaldır'), destructive: true)) return;
    if (!mounted) return;
    final r = await guard(context, () => Api.post('/api/admin/users/$userId/avatar', {'avatarUrl': null}));
    if (r != null && mounted) toast(context, tx('Profil fotoğrafı kaldırıldı.'));
  }

  void _membersSheet() => showViewers(context, _members, _memberSheet);
}
