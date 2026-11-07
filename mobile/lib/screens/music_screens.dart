import 'dart:async';
import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/local_music.dart';
import '../services/music_service.dart';
import '../services/room_playlist.dart';
import '../services/session.dart';
import '../widgets/common.dart';
import '../widgets/marquee.dart';

// Müzik (Yoho düzeni): beyaz liste sayfaları ("Müzik", "Yerel eklendi"), altta koyu küçük çalar;
// odada yalnızca müziği çalan kişiye görünen plak ve DJ paneli. Odadaki diğer kullanıcılar müzik kutusunu görmez,
// yalnızca müziği duyar (ses düzeyini DJ ayarlar).
const _text = Color(0xFF1F2330);
const _sub = Color(0xFF9AA3B5);
const _green = Color(0xFF12C95A);
const _line = Color(0xFFEEF0F4);
const _band = Color(0xFFF2F4F8);
const _player = Color(0xFF3A3D45);

String _mmss(num ms) {
  final s = (ms / 1000).floor();
  return '${(s ~/ 60).toString().padLeft(2, '0')}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Odadaki "Müzik" düğmesi: müzik listesi (yalnızca oda yetkilileri).
void openRoomMusic(BuildContext context, {required String roomId, required bool canManage}) {
  RoomPlaylist.instance.bind(roomId);
  if (!canManage) return;
  Navigator.push(context, MaterialPageRoute(builder: (_) => MusicLibraryPage(roomId: roomId)));
}

PreferredSizeWidget _bar(BuildContext context, String title, List<Widget> actions) => AppBar(
      backgroundColor: Colors.white,
      foregroundColor: _text,
      elevation: 0,
      scrolledUnderElevation: 0,
      titleSpacing: 0,
      leading: IconButton(icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 22), onPressed: () => Navigator.maybePop(context)),
      title: Text(title, style: const TextStyle(color: _text, fontSize: 19, fontWeight: FontWeight.w800)),
      actions: [...actions, const SizedBox(width: 6)],
      bottom: const PreferredSize(preferredSize: Size.fromHeight(1), child: Divider(height: 1, color: _line)),
    );

/// Şarkı satırı: ad (kalın), altında "süre | sanatçı", sağda düğme.
Widget _trackRow({required String title, required int durationMs, required String artist, required Widget trailing, bool active = false, VoidCallback? onTap, VoidCallback? onLongPress}) {
  return InkWell(
    onTap: onTap,
    onLongPress: onLongPress,
    child: Container(
      padding: const EdgeInsets.fromLTRB(16, 13, 12, 13),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: _line))),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: active ? _green : _text, fontWeight: FontWeight.w700, fontSize: 16)),
            const SizedBox(height: 5),
            Text.rich(
              TextSpan(children: [
                TextSpan(text: _mmss(durationMs)),
                const TextSpan(text: '  |  ', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 10)),
                TextSpan(text: artist.isEmpty ? '<bilinmiyor>' : artist),
              ]),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: _sub, fontSize: 13.5),
            ),
          ]),
        ),
        const SizedBox(width: 10),
        trailing,
      ]),
    ),
  );
}

// ======================================================================= Müzik listesi
/// "Müzik": telefondan eklenen şarkılar. Dokununca odada çalar (liste sırayla devam eder). Uzun basınca kaldırılır.
class MusicLibraryPage extends StatefulWidget {
  final String roomId;
  const MusicLibraryPage({super.key, required this.roomId});

  @override
  State<MusicLibraryPage> createState() => _MusicLibraryPageState();
}

class _MusicLibraryPageState extends State<MusicLibraryPage> {
  bool _search = false;
  final _q = TextEditingController();

  @override
  void initState() {
    super.initState();
    LocalMusic.instance.load();
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  Future<void> _openDevice() async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => const DeviceAudioPage()));
    if (mounted) setState(() {});
  }

  /// Çalan şarkıya dokununca duraklat / devam; başka şarkıya dokununca o çalar.
  Future<void> _tap(LocalTrack t, bool active) async {
    // Şarkı odaya gönderilirken dokunmalar beklesin.
    if (RoomPlaylist.instance.busy.value) return;
    if (active) {
      final playing = MusicService.instance.state.value?['status'] == 'playing';
      await guard(context, () => Api.post('/api/rooms/${widget.roomId}/music/${playing ? 'pause' : 'play'}'));
      return;
    }
    await guard(context, () async {
      await RoomPlaylist.instance.playTrack(t);
      return true;
    });
  }

  Future<void> _remove(LocalTrack t) async {
    if (await confirm(context, '"${t.title}" listeden kaldırılsın mı?', action: 'Kaldır')) await LocalMusic.instance.remove(t);
  }

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: ThemeData.light(useMaterial3: true),
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: _bar(context, 'Müzik', [
          IconButton(tooltip: 'Ara', icon: const Icon(Icons.search_rounded, size: 28), onPressed: () => setState(() => _search = !_search)),
          IconButton(tooltip: 'Telefondan ekle', icon: const Icon(Icons.library_add_outlined, size: 27), onPressed: _openDevice),
        ]),
        body: ValueListenableBuilder<List<LocalTrack>>(
          valueListenable: LocalMusic.instance.tracks,
          builder: (context, all, _) {
            final q = _q.text.trim().toLowerCase();
            final list = q.isEmpty ? all : all.where((t) => '${t.title} ${t.artist}'.toLowerCase().contains(q)).toList();
            return Column(children: [
              if (_search)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
                  child: TextField(
                    controller: _q,
                    autofocus: true,
                    onChanged: (_) => setState(() {}),
                    style: const TextStyle(color: _text),
                    decoration: InputDecoration(
                      hintText: 'Şarkı ya da sanatçı ara',
                      hintStyle: const TextStyle(color: _sub),
                      prefixIcon: const Icon(Icons.search, color: _sub),
                      isDense: true,
                      filled: true,
                      fillColor: _band,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(22), borderSide: BorderSide.none),
                    ),
                  ),
                ),
              Container(
                width: double.infinity,
                color: _band,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                child: Text('Toplamda: ${all.length} şarkı', style: const TextStyle(color: _sub, fontSize: 14, fontWeight: FontWeight.w600)),
              ),
              Expanded(
                child: all.isEmpty
                    ? _empty()
                    : ValueListenableBuilder<Map<String, dynamic>?>(
                        valueListenable: MusicService.instance.state,
                        builder: (context, s, _) => ValueListenableBuilder<String?>(
                          valueListenable: RoomPlaylist.instance.currentPath,
                          builder: (context, cur, _) {
                            final playing = s?['status'] == 'playing';
                            return ListView.builder(
                              padding: const EdgeInsets.only(bottom: 100),
                              itemCount: list.length,
                              itemBuilder: (_, i) {
                                final t = list[i];
                                final active = cur == t.path && mapOf(s?['track']) != null;
                                return _trackRow(
                                  title: t.title,
                                  durationMs: t.durationMs,
                                  artist: t.artist,
                                  active: active,
                                  onTap: () => _tap(t, active),
                                  onLongPress: () => _remove(t),
                                  trailing: ValueListenableBuilder<String?>(
                                    valueListenable: RoomPlaylist.instance.loadingPath,
                                    builder: (context, loading, _) => loading == t.path
                                        // Şarkı odaya gönderiliyor (DJ zaten telefondan dinliyor).
                                        ? const SizedBox(width: 34, height: 34, child: Padding(padding: EdgeInsets.all(6), child: CircularProgressIndicator(strokeWidth: 2.6, color: _green)))
                                        : Icon(
                                            (active || cur == t.path) && (playing || loading == t.path) ? Icons.pause_circle_outline_rounded : Icons.play_circle_outline_rounded,
                                            color: active || cur == t.path ? _green : const Color(0xFFC5CAD6),
                                            size: 34,
                                          ),
                                  ),
                                );
                              },
                            );
                          },
                        ),
                      ),
              ),
            ]);
          },
        ),
        bottomNavigationBar: const _MiniPlayer(),
      ),
    );
  }

  Widget _empty() => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.queue_music_rounded, color: Color(0xFFC5CAD6), size: 72),
          const SizedBox(height: 14),
          const Text('Henüz şarkı eklemediniz', style: TextStyle(color: _sub, fontSize: 15)),
          const SizedBox(height: 18),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: _green, foregroundColor: Colors.white, shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 12)),
            onPressed: _openDevice,
            child: const Text('Telefondan şarkı ekle', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          ),
        ]),
      );
}

/// Liste sayfasının altındaki koyu küçük çalar: oynat/duraklat, ad, ilerleme, süreler, ses düzeyi.
class _MiniPlayer extends StatefulWidget {
  const _MiniPlayer();

  @override
  State<_MiniPlayer> createState() => _MiniPlayerState();
}

class _MiniPlayerState extends State<_MiniPlayer> {
  Timer? _t;
  double? _drag; // kaydırılırken gösterilen konum (ms)

  @override
  void initState() {
    super.initState();
    // İlerleme çubuğu saniyede bir yenilenir.
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && MusicService.instance.state.value?['status'] == 'playing') setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Map<String, dynamic>?>(
      valueListenable: MusicService.instance.state,
      builder: (context, s, _) {
        final track = mapOf(s?['track']);
        final room = MusicService.instance.roomId;
        if (track == null || room == null) return const SizedBox.shrink();
        final playing = s?['status'] == 'playing';
        final dur = ((track['durationMs'] as num?)?.toInt() ?? 0).clamp(1, 1 << 31).toDouble();
        final pos = (_drag ?? MusicService.instance.currentPositionMs().toDouble()).clamp(0.0, dur);
        return Container(
          color: _player,
          padding: EdgeInsets.fromLTRB(14, 10, 10, 8 + MediaQuery.paddingOf(context).bottom),
          child: Row(children: [
            GestureDetector(
              onTap: () => guard(context, () => Api.post('/api/rooms/$room/music/${playing ? 'pause' : 'play'}')),
              child: Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2.4)),
                child: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: Colors.white, size: 28),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                Row(children: [
                  Expanded(
                    child: Text((track['title'] ?? '').toString(),
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                  ),
                  IconButton(
                    visualDensity: VisualDensity.compact,
                    tooltip: 'Ses düzeyi',
                    icon: Icon(MusicService.instance.roomVolume == 0 ? Icons.volume_off_rounded : Icons.volume_up_rounded, color: Colors.white),
                    onPressed: () => _volumeSheet(context),
                  ),
                ]),
                SliderTheme(
                  data: SliderTheme.of(context).copyWith(
                    trackHeight: 2,
                    overlayShape: SliderComponentShape.noOverlay,
                    thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                    activeTrackColor: _green,
                    inactiveTrackColor: Colors.white24,
                    thumbColor: Colors.white,
                  ),
                  child: Slider(
                    value: pos,
                    max: dur,
                    onChanged: (v) => setState(() => _drag = v),
                    onChangeEnd: (v) async {
                      await guard(context, () => Api.post('/api/rooms/$room/music/seek', {'positionMs': v.round()}));
                      if (mounted) setState(() => _drag = null);
                    },
                  ),
                ),
                const SizedBox(height: 4),
                Row(children: [
                  Text(_mmss(pos), style: const TextStyle(color: Colors.white70, fontSize: 12)),
                  const Spacer(),
                  Text(_mmss(dur), style: const TextStyle(color: Colors.white70, fontSize: 12)),
                  const SizedBox(width: 6),
                ]),
              ]),
            ),
          ]),
        );
      },
    );
  }
}

/// Odadaki müzik ses düzeyi (DJ ayarlar; odadaki herkeste bu düzeyde çalar).
void _volumeSheet(BuildContext context) {
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.white,
    builder: (c) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Odadaki müzik sesi', style: TextStyle(color: _text, fontWeight: FontWeight.w800, fontSize: 16)),
          const SizedBox(height: 6),
          const _RoomVolumeSlider(dark: false),
        ]),
      ),
    ),
  );
}

class _RoomVolumeSlider extends StatelessWidget {
  final bool dark;
  const _RoomVolumeSlider({required this.dark});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Map<String, dynamic>?>(
      valueListenable: MusicService.instance.state,
      builder: (context, _, __) {
        final v = MusicService.instance.roomVolume;
        return Row(children: [
          GestureDetector(
            onTap: () => MusicService.instance.setRoomVolume(v == 0 ? 0.7 : 0),
            child: Icon(v == 0 ? Icons.volume_off_rounded : Icons.volume_up_rounded, color: dark ? Colors.white : _text, size: 26),
          ),
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 3,
                activeTrackColor: _green,
                inactiveTrackColor: dark ? Colors.white24 : _line,
                thumbColor: Colors.white,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 9, elevation: 2),
                overlayShape: SliderComponentShape.noOverlay,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: Slider(value: v, onChanged: MusicService.instance.setRoomVolume),
              ),
            ),
          ),
        ]);
      },
    );
  }
}

// ======================================================================= Yerel eklendi
/// "Yerel eklendi": telefondaki ses dosyaları taranır, "Eklemek" ile Müzik listesine girer (eklenenler soluk "Eklendi").
class DeviceAudioPage extends StatefulWidget {
  const DeviceAudioPage({super.key});

  @override
  State<DeviceAudioPage> createState() => _DeviceAudioPageState();
}

class _DeviceAudioPageState extends State<DeviceAudioPage> with WidgetsBindingObserver {
  List<DeviceAudio>? _files;
  bool _scanning = false;
  bool _needPermission = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    LocalMusic.instance.load();
    _scan();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// İzin penceresinden dönünce yeniden taranır.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _needPermission && !_scanning) _scan();
  }

  Future<void> _scan() async {
    setState(() => _scanning = true);
    final r = await LocalMusic.scanDevice();
    if (!mounted) return;
    setState(() {
      _scanning = false;
      _needPermission = r == null;
      _files = r ?? const [];
    });
  }

  Future<void> _pickManually() async {
    final added = await LocalMusic.instance.pickToLibrary();
    if (!mounted) return;
    if (added.isNotEmpty) toast(context, '${added.length} şarkı eklendi.');
  }

  @override
  Widget build(BuildContext context) {
    final files = _files;
    return Theme(
      data: ThemeData.light(useMaterial3: true),
      child: Scaffold(
        backgroundColor: Colors.white,
        appBar: _bar(context, 'Yerel eklendi', [
          TextButton(
            onPressed: _scanning ? null : _scan,
            child: const Text('Yeniden tara', style: TextStyle(color: _green, fontWeight: FontWeight.w800, fontSize: 16)),
          ),
        ]),
        body: Column(children: [
          if (files != null && files.isNotEmpty)
            Container(
              color: _band,
              padding: const EdgeInsets.fromLTRB(16, 4, 6, 4),
              child: Row(children: [
                Text('${files.length} şarkı bulundu', style: const TextStyle(color: _sub, fontWeight: FontWeight.w600, fontSize: 14)),
                const Spacer(),
                TextButton(
                  onPressed: () async {
                    final n = await LocalMusic.instance.addDevice(files);
                    if (context.mounted) toast(context, n == 0 ? 'Hepsi zaten ekli.' : '$n şarkı eklendi.');
                  },
                  child: const Text('Tümünü ekle', style: TextStyle(color: _green, fontWeight: FontWeight.w800)),
                ),
              ]),
            ),
          Expanded(child: _body(files)),
        ]),
      ),
    );
  }

  Widget _body(List<DeviceAudio>? files) {
    if (_scanning || files == null) {
      return const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        CircularProgressIndicator(color: _green),
        SizedBox(height: 14),
        Text('Telefonundaki müzik dosyaları taranıyor...', style: TextStyle(color: _sub)),
      ]));
    }
    if (_needPermission || files.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.library_music_rounded, color: Color(0xFFC5CAD6), size: 64),
            const SizedBox(height: 14),
            Text(
              _needPermission
                  ? 'Müzik dosyalarını görebilmek için açılan pencerede "İzin ver"e dokun.'
                  : (LocalMusic.scanUnsupported ? 'Bu sürümde otomatik tarama yok; dosyaları elle seçebilirsin.' : 'Telefonunda müzik dosyası bulunamadı.'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: _sub, fontSize: 15, height: 1.4),
            ),
            const SizedBox(height: 14),
            TextButton(onPressed: _pickManually, child: const Text('Dosyaları elle seç', style: TextStyle(color: _green, fontWeight: FontWeight.w800))),
          ]),
        ),
      );
    }
    return ValueListenableBuilder<List<LocalTrack>>(
      valueListenable: LocalMusic.instance.tracks,
      builder: (context, lib, _) {
        final have = {for (final t in lib) t.path};
        return ListView.builder(
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: files.length,
          itemBuilder: (_, i) {
            final f = files[i];
            final added = have.contains(f.path);
            return _trackRow(
              title: f.title,
              durationMs: f.durationMs,
              artist: f.artist,
              trailing: GestureDetector(
                onTap: added ? null : () => LocalMusic.instance.addDevice([f]),
                child: Container(
                  height: 36,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: added ? const Color(0xFFF4F5F8) : _green, borderRadius: BorderRadius.circular(9)),
                  child: Text(added ? 'Eklendi' : 'Eklemek',
                      style: TextStyle(color: added ? const Color(0xFFE1E4EA) : Colors.white, fontWeight: FontWeight.w800, fontSize: 15)),
                ),
              ),
            );
          },
        );
      },
    );
  }
}

// ======================================================================= Odadaki plak ve DJ paneli
/// Odada müziği çalan kişiye görünen plak (çalarken döner). Dokununca DJ paneli açılır / kapanır.
class DjDisc extends StatefulWidget {
  final VoidCallback onTap;
  final double size;
  const DjDisc({super.key, required this.onTap, this.size = 50});

  @override
  State<DjDisc> createState() => _DjDiscState();
}

class _DjDiscState extends State<DjDisc> with SingleTickerProviderStateMixin {
  late final AnimationController _spin = AnimationController(vsync: this, duration: const Duration(seconds: 6));

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Map<String, dynamic>?>(
      valueListenable: MusicService.instance.state,
      builder: (context, s, _) {
        final playing = s?['status'] == 'playing';
        if (playing && !_spin.isAnimating) {
          _spin.repeat();
        } else if (!playing && _spin.isAnimating) {
          _spin.stop();
        }
        final d = widget.size;
        return GestureDetector(
          onTap: widget.onTap,
          child: SizedBox(
            width: d * 1.15,
            height: d * 1.15,
            child: Stack(children: [
              Positioned(
                left: 0,
                bottom: 0,
                width: d,
                height: d,
                child: RotationTransition(
                  turns: _spin,
                  child: Container(
                    decoration: const BoxDecoration(shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black54, blurRadius: 8)]),
                    child: ClipOval(child: Image.asset('assets/images/music_disc.png', fit: BoxFit.cover)),
                  ),
                ),
              ),
              // Pikap kolu
              Positioned(
                right: 0,
                top: 0,
                child: Transform.rotate(
                  angle: playing ? 0.35 : 0,
                  alignment: Alignment.topRight,
                  child: Container(
                    width: 3,
                    height: d * 0.62,
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(2), boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 2)]),
                  ),
                ),
              ),
              Positioned(right: 0, top: 0, child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle))),
            ]),
          ),
        );
      },
    );
  }
}

/// DJ paneli (yalnızca müziği çalan kişide): kapat (müziği durdurur), küçült, şarkı adı, ses düzeyi (odadaki herkes
/// için), oynat/duraklat, sonraki ve şarkı listesi.
class DjPanel extends StatelessWidget {
  final String roomId;
  final VoidCallback onMinimize;
  const DjPanel({super.key, required this.roomId, required this.onMinimize});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<Map<String, dynamic>?>(
      valueListenable: MusicService.instance.state,
      builder: (context, s, _) {
        final track = mapOf(s?['track']);
        if (track == null) return const SizedBox.shrink();
        final playing = s?['status'] == 'playing';
        return Material(
          color: const Color(0xF20C0C10),
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Row(children: [
                IconButton(
                  tooltip: 'Müziği kapat',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.power_settings_new_rounded, color: Colors.white, size: 28),
                  onPressed: () => guard(context, () async {
                    await RoomPlaylist.instance.stop();
                    return true;
                  }),
                ),
                const Spacer(),
                IconButton(
                  tooltip: 'Küçült',
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.close_fullscreen_rounded, color: Colors.white, size: 24),
                  onPressed: onMinimize,
                ),
              ]),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Marquee(
                  height: 24,
                  speed: 30,
                  child: Text((track['title'] ?? '').toString(), maxLines: 1, softWrap: false, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16.5)),
                ),
              ),
              const SizedBox(height: 6),
              Row(children: [
                const Expanded(child: _RoomVolumeSlider(dark: true)),
                const SizedBox(width: 6),
                GestureDetector(
                  onTap: () => guard(context, () => Api.post('/api/rooms/$roomId/music/${playing ? 'pause' : 'play'}')),
                  child: Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2.6)),
                    child: Icon(playing ? Icons.pause_rounded : Icons.play_arrow_rounded, color: Colors.white, size: 30),
                  ),
                ),
                IconButton(
                  tooltip: 'Sonraki',
                  icon: const Icon(Icons.skip_next_rounded, color: Colors.white, size: 36),
                  onPressed: () => guard(context, () async {
                    await RoomPlaylist.instance.next();
                    return true;
                  }),
                ),
                IconButton(
                  tooltip: 'Şarkı listesi',
                  icon: const Icon(Icons.queue_music_rounded, color: Colors.white, size: 30),
                  onPressed: () => openRoomMusic(context, roomId: roomId, canManage: true),
                ),
              ]),
            ]),
          ),
        );
      },
    );
  }
}

/// Müzik kutusu bu telefonda görünsün mü: yalnızca müziği çalan kişi (oda yetkilisi) görür.
bool showDjControls() => MusicService.instance.isController(Session.id);
