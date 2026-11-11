import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'platform_rules.dart';

/// Telefonun kendi hafızasından seçilen müzik dosyası.
class LocalTrack {
  final String path;
  final String title;
  final String artist;
  final int durationMs;
  final int sizeBytes;
  const LocalTrack({required this.path, required this.title, required this.artist, required this.durationMs, required this.sizeBytes});

  Map<String, dynamic> toJson() => {'path': path, 'title': title, 'artist': artist, 'durationMs': durationMs, 'sizeBytes': sizeBytes};
  factory LocalTrack.fromJson(Map<String, dynamic> j) => LocalTrack(
        path: j['path'] as String,
        title: (j['title'] ?? '') as String,
        artist: (j['artist'] ?? '') as String,
        durationMs: (j['durationMs'] as num?)?.toInt() ?? 0,
        sizeBytes: (j['sizeBytes'] as num?)?.toInt() ?? 0,
      );
}

/// Telefon müzik kitaplığı: dosya seçme, kalıcı liste, telefonda dinleme ve odaya gönderme.
class LocalMusic {
  LocalMusic._();
  static final LocalMusic instance = LocalMusic._();

  static const maxBytes = 25 * 1024 * 1024; // sunucu sınırıyla aynı
  static const _prefsKey = 'local_music_v1';

  final ValueNotifier<List<LocalTrack>> tracks = ValueNotifier<List<LocalTrack>>([]);
  final ValueNotifier<String?> previewing = ValueNotifier<String?>(null); // çalan dosyanın yolu
  AudioPlayer? _preview;
  bool _loaded = false;

  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    try {
      final p = await SharedPreferences.getInstance();
      final raw = p.getString(_prefsKey);
      if (raw == null) return;
      final list = (jsonDecode(raw) as List).map((e) => LocalTrack.fromJson(Map<String, dynamic>.from(e as Map))).toList();
      // Telefondan silinmiş dosyaları listeden düşür.
      tracks.value = [for (final t in list) if (await File(t.path).exists()) t];
    } catch (_) {/* bozuk kayıt: boş liste */}
  }

  Future<void> _save() async {
    try {
      final p = await SharedPreferences.getInstance();
      await p.setString(_prefsKey, jsonEncode(tracks.value.map((t) => t.toJson()).toList()));
    } catch (_) {/* yoksay */}
  }

  /// "Sanatçı - Şarkı.mp3" adından başlık/sanatçı çıkarır.
  static ({String title, String artist}) parseName(String fileName) {
    var n = fileName.replaceFirst(RegExp(r'\.[A-Za-z0-9]{2,5}$'), '').replaceAll('_', ' ').trim();
    n = n.replaceFirst(RegExp(r'^\d{1,3}[\s.\-]+'), ''); // baştaki parça numarası
    final i = n.indexOf(' - ');
    if (i > 0 && i < n.length - 3) return (artist: n.substring(0, i).trim(), title: n.substring(i + 3).trim());
    return (artist: '', title: n.isEmpty ? 'Adsız parça' : n);
  }

  static String contentTypeOf(String path) {
    final e = path.toLowerCase().split('.').last;
    switch (e) {
      case 'm4a':
      case 'mp4':
        return 'audio/mp4';
      case 'aac':
        return 'audio/aac';
      case 'ogg':
      case 'opus':
        return 'audio/ogg';
      case 'wav':
        return 'audio/wav';
      case 'flac':
        return 'audio/flac';
      default:
        return 'audio/mpeg';
    }
  }

  /// Dosya seçiciyi açar; seçilen ses dosyalarını listeye ekler. Eklenen sayısını döndürür.
  Future<int> pickAndAdd() async => (await pickToLibrary()).length;

  /// Kalıcı müzik klasörü (uygulamanın kendi alanı). Dosya seçicinin verdiği kopya geçici önbellektedir ve
  /// telefon temizleyince siliniyordu; seçilen şarkı buraya kopyalanır, "Müziklerim"de kalıcı durur.
  static Future<Directory> _libraryDir() async {
    final d = Directory('${Directory.systemTemp.parent.path}/files/trlive_music');
    if (!await d.exists()) await d.create(recursive: true);
    return d;
  }

  /// Telefondan şarkı seçtirir, kalıcı klasöre kopyalar ve "Müziklerim"e ekler. Yeni eklenenleri döndürür.
  Future<List<LocalTrack>> pickToLibrary() async {
    await load();
    // iPhone'da "ses" türü Apple Music kitaplığını açar (yalnızca satın alınmış şarkılar); Dosyalar uygulamasından
    // ses dosyası seçilsin diye uzantıyla seçilir.
    final r = isIOS
        ? await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg'], allowMultiple: true)
        : await FilePicker.platform.pickFiles(type: FileType.audio, allowMultiple: true);
    if (r == null) return const [];
    final list = [...tracks.value];
    final added = <LocalTrack>[];
    final dir = await _libraryDir();
    for (final f in r.files) {
      final src = f.path;
      if (src == null) continue;
      final meta = parseName(f.name);
      // Aynı şarkı (ad + boyut) zaten kitaplıktaysa yeniden kopyalanmaz.
      final dup = list.where((t) => t.title == meta.title && t.artist == meta.artist && t.sizeBytes == f.size);
      if (dup.isNotEmpty) {
        added.add(dup.first);
        continue;
      }
      try {
        if (f.size > maxBytes) continue;
        final safe = f.name.replaceAll(RegExp(r'[^A-Za-z0-9._ -]'), '_');
        final dest = '${dir.path}/${DateTime.now().microsecondsSinceEpoch}_$safe';
        await File(src).copy(dest);
        final dur = await _durationOf(dest);
        if (dur == null) {
          await File(dest).delete().catchError((_) => File(dest));
          continue; // çalınamayan dosya
        }
        final t = LocalTrack(path: dest, title: meta.title, artist: meta.artist, durationMs: dur, sizeBytes: f.size);
        list.add(t);
        added.add(t);
      } catch (_) {/* kopyalanamayan dosya atlanır */}
    }
    tracks.value = list;
    await _save();
    return added;
  }

  /// Kitaplıktaki şarkıları (sırasıyla) odaya yükleyip çalma listesine ekler.
  Future<({int added, int skipped, String? error})> addTracksToRoom(String roomId, List<LocalTrack> list, {void Function(int done, int total)? onProgress}) async {
    var added = 0, skipped = 0;
    String? error;
    for (var i = 0; i < list.length; i++) {
      onProgress?.call(i, list.length);
      try {
        await sendToRoom(roomId, list[i], playNow: false);
        added++;
      } on ApiException catch (e) {
        skipped++;
        error ??= e.message;
        if (e.message.contains('en fazla') || e.message.contains('Sıra dolu')) break;
      } catch (_) {
        skipped++;
        error ??= 'Bir şarkı eklenemedi.';
      }
    }
    onProgress?.call(list.length, list.length);
    return (added: added, skipped: skipped, error: error);
  }


  /// Seçilen dosyaları (seçim sırasıyla) tek tek odaya yükleyip çalma listesine ekler.
  /// Hiçbir şey çalmıyorsa sunucu ilk şarkıyı kendisi başlatır. Sonuç: (eklenen, atlanan, ilk hata).
  Future<({int added, int skipped, String? error})> addPickedToRoom(String roomId, List<PlatformFile> files, {void Function(int done, int total)? onProgress}) async {
    var added = 0, skipped = 0;
    String? error;
    for (var i = 0; i < files.length; i++) {
      onProgress?.call(i, files.length);
      final f = files[i];
      final path = f.path;
      try {
        if (path == null) throw ApiException('Dosya okunamadı.');
        final size = await File(path).length();
        if (size > maxBytes) throw ApiException('"${f.name}" 25 MB sınırını aşıyor.');
        final dur = await _durationOf(path);
        if (dur == null) throw ApiException('"${f.name}" çalınamayan bir dosya.');
        final meta = parseName(f.name);
        final bytes = await File(path).readAsBytes();
        final up = await Api.postBytes('/api/rooms/$roomId/music/upload', bytes, contentTypeOf(path), query: {
          'title': meta.title,
          if (meta.artist.isNotEmpty) 'artist': meta.artist,
          'durationMs': '$dur',
        });
        final id = (up['track'] as Map?)?['id'];
        if (id == null) throw ApiException('Yükleme tamamlanamadı.');
        await Api.post('/api/rooms/$roomId/music/queue', {'trackId': id});
        added++;
      } on ApiException catch (e) {
        skipped++;
        error ??= e.message;
        if (e.message.contains('en fazla') || e.message.contains('Sıra dolu')) break; // limit doldu: devam etmenin anlamı yok
      } catch (_) {
        skipped++;
        error ??= 'Bir şarkı eklenemedi.';
      }
    }
    onProgress?.call(files.length, files.length);
    return (added: added, skipped: skipped, error: error);
  }

  Future<int?> _durationOf(String path) async {
    final p = AudioPlayer();
    try {
      final d = await p.setFilePath(path);
      return d?.inMilliseconds;
    } catch (_) {
      return null;
    } finally {
      await p.dispose();
    }
  }

  Future<void> remove(LocalTrack t) async {
    if (previewing.value == t.path) await stopPreview();
    tracks.value = tracks.value.where((x) => x.path != t.path).toList();
    await _save();
    // Kalıcı klasördeki kopya da silinir (kullanıcının kendi dosyasına dokunulmaz).
    try {
      final dir = await _libraryDir();
      if (t.path.startsWith(dir.path)) await File(t.path).delete();
    } catch (_) {}
  }

  /// Telefonda (yalnızca kendiniz için) dinle / durdur.
  Future<void> togglePreview(LocalTrack t) async {
    if (previewing.value == t.path) return stopPreview();
    await stopPreview();
    final p = _preview ??= AudioPlayer();
    try {
      await p.setFilePath(t.path);
      previewing.value = t.path;
      unawaited(p.play().then((_) {
        if (previewing.value == t.path && p.processingState == ProcessingState.completed) previewing.value = null;
      }));
    } catch (_) {
      previewing.value = null;
      rethrow;
    }
  }

  Future<void> stopPreview() async {
    previewing.value = null;
    try {
      await _preview?.stop();
    } catch (_) {/* yoksay */}
  }

  /// Telefonda taranan ses dosyalarını "Müziklerim"e ekler (kopyalanmaz; dosya telefondaki yerinde kalır).
  Future<int> addDevice(List<DeviceAudio> files) async {
    await load();
    final list = [...tracks.value];
    final have = {for (final t in list) t.path};
    var n = 0;
    for (final f in files) {
      if (have.contains(f.path) || f.size > maxBytes) continue;
      list.add(LocalTrack(path: f.path, title: f.title, artist: f.artist, durationMs: f.durationMs, sizeBytes: f.size));
      have.add(f.path);
      n++;
    }
    tracks.value = list;
    await _save();
    return n;
  }

  /// Telefondaki ses dosyalarını tarar (Android müzik kitaplığı). İzin yoksa izin penceresi açılır ve null döner.
  /// Tarama yapılamıyorsa (eski derleme) boş liste yerine `[]` ve [scanUnsupported] true olur.
  static bool scanUnsupported = false;
  static Future<List<DeviceAudio>?> scanDevice() async {
    try {
      final r = await const MethodChannel('trlive/device').invokeMethod<Map<dynamic, dynamic>>('scanAudio');
      if (r == null) return const [];
      if (r['permission'] != true) return null;
      final out = <DeviceAudio>[];
      for (final raw in (r['files'] as List? ?? const [])) {
        if (raw is! Map) continue;
        final path = raw['path']?.toString();
        if (path == null || path.isEmpty) continue;
        final name = (raw['name'] ?? path.split('/').last).toString();
        final parsed = parseName(name);
        var title = (raw['title'] ?? '').toString().trim();
        var artist = (raw['artist'] ?? '').toString().trim();
        if (title.isEmpty) title = parsed.title;
        if (artist.isEmpty || artist == '<unknown>') artist = parsed.artist;
        out.add(DeviceAudio(
          path: path,
          title: title,
          artist: artist,
          durationMs: (raw['durationMs'] as num?)?.toInt() ?? 0,
          size: (raw['size'] as num?)?.toInt() ?? 0,
          ext: name.contains('.') ? name.split('.').last.toLowerCase() : 'mp3',
        ));
      }
      return out;
    } on MissingPluginException {
      scanUnsupported = true;
      return const [];
    } catch (_) {
      return const [];
    }
  }

  /// Bu oturumda odaya yüklenmiş şarkılar ("oda|yol|boyut" -> sunucudaki kimlik): aynı şarkı yeniden
  /// çalınınca dosya bir daha gönderilmez, hemen başlar. Sunucu kaydı 12 saat (her çalınışta uzar) tutar.
  final Map<String, ({String id, DateTime at})> _uploaded = {};
  final Map<String, Future<String>> _uploading = {};
  static String _key(String roomId, LocalTrack t) => '$roomId|${t.path}|${t.sizeBytes}';

  /// Dosyayı odaya yükler (önceden yüklendiyse yeniden göndermez). Sunucudaki şarkı kimliğini döndürür.
  Future<String> uploadToRoom(String roomId, LocalTrack t) {
    final k = _key(roomId, t);
    final c = _uploaded[k];
    if (c != null && DateTime.now().difference(c.at) < const Duration(hours: 10)) return Future.value(c.id);
    // Aynı şarkı zaten yükleniyorsa (ör. arka planda önceden yükleme) ikinci kez gönderilmez.
    return _uploading[k] ??= _upload(roomId, t).then((id) {
      _uploaded[k] = (id: id, at: DateTime.now());
      return id;
    }).whenComplete(() {
      _uploading.remove(k);
    });
  }

  /// Bu şarkı bu odaya daha önce yüklendi mi (yükleme beklemeden hemen çalınabilir).
  bool isUploaded(String roomId, LocalTrack t) {
    final c = _uploaded[_key(roomId, t)];
    return c != null && DateTime.now().difference(c.at) < const Duration(hours: 10);
  }

  /// Sunucu kaydı silinmişse (süresi doldu) önbellekten düşer; sonraki deneme yeniden yükler.
  void forgetUpload(String roomId, LocalTrack t) => _uploaded.remove(_key(roomId, t));

  Future<String> _upload(String roomId, LocalTrack t) async {
    final file = File(t.path);
    if (!await file.exists()) throw ApiException('Dosya telefonda bulunamadı. Listeden kaldırıp yeniden ekleyin.');
    final size = await file.length();
    if (size > maxBytes) throw ApiException('Dosya çok büyük (en fazla 25 MB). Daha küçük bir dosya seçin.');
    // Aynı şarkı bu odaya son saatlerde yüklendiyse (uygulama kapanıp açılmış olsa bile) yeniden gönderilmez.
    try {
      final r = await Api.post('/api/rooms/$roomId/music/reuse', {'title': t.title, 'durationMs': t.durationMs, 'sizeBytes': size});
      final id = (r['track'] as Map?)?['id'];
      if (id != null) return id.toString();
    } catch (_) {/* yoksa yüklenir */}
    final bytes = await file.readAsBytes();
    final up = await Api.postBytes('/api/rooms/$roomId/music/upload', bytes, contentTypeOf(t.path), query: {
      'title': t.title,
      if (t.artist.isNotEmpty) 'artist': t.artist,
      'durationMs': '${t.durationMs}',
    });
    final id = (up['track'] as Map?)?['id'];
    if (id == null) throw ApiException('Yükleme tamamlanamadı.');
    return id.toString();
  }

  /// Dosyayı odaya yükler. [playNow]: yetkili ise hemen çalar, değilse sıraya ekler. Sunucudaki şarkı kimliğini döndürür.
  Future<String> sendToRoom(String roomId, LocalTrack t, {required bool playNow}) async {
    Future<String> go() async {
      final id = await uploadToRoom(roomId, t);
      await Api.post('/api/rooms/$roomId/music/${playNow ? 'play' : 'queue'}', {'trackId': id});
      return id;
    }

    try {
      return await go();
    } on ApiException catch (e) {
      // Önceden yüklenen kayıt sunucuda artık yoksa bir kez yeniden yüklenir.
      if (e.statusCode != 404) rethrow;
      forgetUpload(roomId, t);
      return go();
    }
  }
}

/// Telefonda taranan ses dosyası.
class DeviceAudio {
  final String path;
  final String title;
  final String artist;
  final int durationMs;
  final int size;
  final String ext;
  const DeviceAudio({required this.path, required this.title, required this.artist, required this.durationMs, required this.size, required this.ext});
}
