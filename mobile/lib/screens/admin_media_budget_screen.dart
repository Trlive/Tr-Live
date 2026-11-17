import 'package:flutter/material.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';

/// Yönetim: medya bütçesi. Hediye / çerçeve / efekt dosyalarının boyut ve çözünürlük üst sınırları.
/// Sınırı aşan dosya yüklenirken otomatik küçültülür; buradan mevcut dosyalar da tek dokunuşla sınıra indirilir.
/// Orijinal dosya yedek olarak kalır (geri alınabilir). "Sınır dışı" işaretli hediyelere dokunulmaz.
class AdminMediaBudgetScreen extends StatefulWidget {
  const AdminMediaBudgetScreen({super.key});

  @override
  State<AdminMediaBudgetScreen> createState() => _AdminMediaBudgetScreenState();
}

class _AdminMediaBudgetScreenState extends State<AdminMediaBudgetScreen> {
  // anahtar, etiket
  static const _fields = <(String, String)>[
    ('mediaMp4MaxWidth', 'Video (mp4): görüntü genişliği, px'),
    ('mediaMp4MaxHeight', 'Video (mp4): yükseklik, px'),
    ('mediaMp4MaxFps', 'Video (mp4): en çok kare/sn'),
    ('mediaMp4MaxKb', 'Video (mp4): en büyük dosya, KB'),
    ('mediaSvgaMaxKb', 'SVGA: en büyük dosya, KB'),
    ('mediaSvgaMaxSide', 'SVGA: içindeki görsellerin en uzun kenarı, px'),
    ('mediaSvgaMaxDecodedMb', 'SVGA: açılınca kaplayacağı bellek, MB'),
    ('mediaImageMaxSide', 'Webp / gif / png: en uzun kenar, px'),
    ('mediaImageMaxKb', 'Webp / gif / png: en büyük dosya, KB'),
    ('mediaSmallMaxSide', 'Çerçeve ve mikte oynayan hediye: en uzun kenar, px'),
    ('mediaIconMaxSide', 'Hediye küçük resmi: en uzun kenar, px'),
  ];

  Map<String, dynamic> _data = const {};
  final Map<String, TextEditingController> _ctl = {for (final f in _fields) f.$1: TextEditingController()};
  bool _auto = true;
  bool _loading = true;
  bool _running = false;
  bool _stop = false;
  bool _saving = false;
  String _progress = '';
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load(first: true);
  }

  @override
  void dispose() {
    _stop = true;
    for (final c in _ctl.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load({bool first = false}) async {
    try {
      final r = await Api.get('/api/admin/media-budget');
      Map<String, dynamic>? cfg;
      if (first) {
        final c = await Api.get('/api/admin/app-config');
        cfg = (c['config'] as Map?)?.cast<String, dynamic>();
      }
      if (!mounted) return;
      setState(() {
        _data = r;
        _loading = false;
        _error = null;
        if (cfg != null) {
          for (final f in _fields) {
            _ctl[f.$1]!.text = '${cfg[f.$1] ?? ''}';
          }
          _auto = cfg['mediaBudgetAuto'] != false;
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e;
        });
      }
    }
  }

  static String _mb(num? bytes) {
    final b = (bytes ?? 0).toDouble();
    if (b >= 1048576) return '${(b / 1048576).toStringAsFixed(1)} MB';
    return '${(b / 1024).toStringAsFixed(0)} KB';
  }

  Map<String, dynamic> get _sum => (_data['summary'] as Map?)?.cast<String, dynamic>() ?? const {};

  Future<void> _save() async {
    final body = <String, dynamic>{'mediaBudgetAuto': _auto};
    for (final f in _fields) {
      final v = int.tryParse(_ctl[f.$1]!.text.trim());
      if (v == null) {
        toast(context, '${f.$2}: sayı girin.', error: true);
        return;
      }
      body[f.$1] = v;
    }
    setState(() => _saving = true);
    final r = await guard(context, () => Api.put('/api/admin/app-config', body));
    if (!mounted) return;
    setState(() => _saving = false);
    if (r != null) {
      toast(context, 'Kaydedildi. Dosyalar yeni sınırlara göre yeniden denetlenecek.');
      _load();
    }
  }

  /// Sunucu her çağrıda bir dosya işler; kalan bitene kadar devam edilir.
  Future<void> _runAll() async {
    if (_running) return;
    setState(() {
      _running = true;
      _stop = false;
      _progress = 'Başlıyor…';
    });
    var fixed = 0;
    var saved = 0;
    var failed = 0;
    try {
      for (var i = 0; i < 3000 && !_stop && mounted; i++) {
        final r = await Api.post('/api/admin/media-budget/run');
        if (r['done'] == true) break;
        final res = (r['result'] as Map?)?.cast<String, dynamic>();
        if (res?['changed'] == true) {
          fixed++;
          saved += ((res!['beforeBytes'] as num?) ?? 0).toInt() - ((res['afterBytes'] as num?) ?? 0).toInt();
        } else if (res != null && (res['over'] as List?)?.isNotEmpty == true) {
          failed++;
        }
        if (mounted) setState(() => _progress = 'Kalan ${r['left']} · küçültülen $fixed · kazanılan ${_mb(saved)}');
      }
      if (mounted) toast(context, '$fixed dosya küçültüldü, ${_mb(saved)} kazanıldı${failed > 0 ? ' · $failed dosya elle çözülmeli' : ''}.');
    } catch (e) {
      if (mounted) toast(context, errorText(e), error: true);
    }
    if (!mounted) return;
    setState(() {
      _running = false;
      _progress = '';
    });
    _load();
  }

  Future<void> _one(Map<String, dynamic> it) async {
    final r = await guard(context, () => Api.post('/api/admin/media-budget/optimize/${it['id']}'));
    if (r == null || !mounted) return;
    toast(context, '${r['note'] ?? 'Tamam'}', error: r['changed'] != true && r['failed'] == true);
    _load();
  }

  Future<void> _revert(Map<String, dynamic> it) async {
    if (!await confirm(context, 'Bu dosya orijinal haline döndürülsün mü? Hediye yeniden büyük dosyayı kullanır.', action: 'Geri al')) return;
    final r = await guard(context, () => Api.post('/api/admin/media-budget/revert/${it['id']}'));
    if (r != null && mounted) {
      toast(context, 'Orijinal dosyaya dönüldü.');
      _load();
    }
  }

  Future<void> _cleanup() async {
    final n = _sum['backupFiles'] ?? 0;
    if (!await confirm(context, '$n yedek dosya (${_mb(_sum['backupBytes'] as num?)}) silinecek. Silinen yedekler için geri alma yapılamaz. Devam edilsin mi?', action: 'Yedekleri sil', destructive: true)) return;
    final r = await guard(context, () => Api.post('/api/admin/media-budget/cleanup'));
    if (r != null && mounted) {
      toast(context, '${r['deleted']} yedek silindi, ${_mb(r['freedBytes'] as num?)} boşaldı.');
      _load();
    }
  }

  Future<void> _exempt(Map<String, dynamic> g, bool v) async {
    final r = await guard(context, () => Api.post('/api/admin/media-budget/exempt', {'giftId': g['id'], 'exempt': v}));
    if (r != null && mounted) _load();
  }

  Widget _stat(String k, String v, {Color? color}) => Expanded(
        child: Column(children: [
          Text(v, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: color ?? Pal.text)),
          const SizedBox(height: 2),
          Text(k, textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim, fontSize: 11.5)),
        ]),
      );

  (String, Color) _stateOf(Map<String, dynamic> it) {
    switch (it['state']) {
      case 'ok':
        return (it['from'] != null ? 'Küçültüldü' : (it['kept'] == true ? 'Geri alındı' : 'Sınır içinde'), Pal.green);
      case 'over':
        return (it['manual'] == true ? 'Elle çözülmeli' : 'Sınırı aşıyor', Pal.red);
      case 'exempt':
        return ('Sınır dışı', Pal.gold);
      case 'unsupported':
        return ('Desteklenmiyor', Pal.textDim);
      default:
        return ('Denetlenmedi', Pal.amber);
    }
  }

  Widget _item(Map<String, dynamic> it) {
    final (label, color) = _stateOf(it);
    final names = (it['names'] as List?)?.join(', ') ?? '';
    final over = (it['over'] as List?)?.cast<dynamic>() ?? const [];
    final dims = it['w'] != null ? ' · ${it['w']}×${it['h'] ?? '?'}' : '';
    final fps = it['fps'] != null && (it['fps'] as num) > 0 ? ' · ${(it['fps'] as num).round()} kare/sn' : '';
    final mem = it['decodedMb'] != null ? ' · bellek ${it['decodedMb']} MB' : '';
    final was = it['from'] != null && it['beforeBytes'] != null ? ' (önceden ${_mb(it['beforeBytes'] as num)})' : '';
    return Card(
      color: Pal.surface,
      margin: const EdgeInsets.only(bottom: Gap.s),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: const BorderSide(color: Pal.outline)),
      child: Padding(
        padding: const EdgeInsets.all(Gap.m),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(child: Text(names.isEmpty ? '—' : names, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800))),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(8)),
              child: Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 11.5)),
            ),
          ]),
          const SizedBox(height: 2),
          Text('${('${it['kind']}').toUpperCase()} · ${it['cls'] == 'small' ? 'küçük' : it['cls'] == 'icon' ? 'küçük resim' : 'tam ekran'} · ${_mb(it['bytes'] as num?)}$was$dims$fps$mem',
              style: const TextStyle(color: Pal.textDim, fontSize: 12)),
          for (final o in over) Text('• $o', style: const TextStyle(color: Pal.red, fontSize: 12)),
          if (over.isEmpty && it['note'] != null && it['state'] != 'ok') Text('${it['note']}', style: const TextStyle(color: Pal.textDim, fontSize: 12)),
          if (it['state'] != 'exempt' && it['state'] != 'unsupported')
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              if (it['from'] != null && it['state'] == 'ok') TextButton(onPressed: _running ? null : () => _revert(it), child: const Text('Geri al')),
              if (it['state'] == 'over' || it['state'] == 'unchecked') TextButton(onPressed: _running ? null : () => _one(it), child: const Text('Şimdi küçült')),
            ]),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final items = listOf(_data['items']);
    final gifts = listOf(_data['gifts']);
    final s = _sum;
    final needWork = ((s['over'] ?? 0) as num) + ((s['unchecked'] ?? 0) as num) > 0;
    return Scaffold(
      appBar: AppBar(title: const Text('Medya bütçesi'), actions: [IconButton(onPressed: _running ? null : () => _load(), icon: const Icon(Icons.refresh))]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? LoadError(message: errorText(_error!), onRetry: () => _load(first: true))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(padding: const EdgeInsets.all(Gap.m), children: [
                    const Text(
                      'Telefonun belleğini dolduran, dosyanın açılınca kaplayacağı yerdir. Bu yüzden hediye dosyalarına üst sınır konur: '
                      'sınırı aşan dosya yüklenirken (ve aşağıdaki düğmeyle mevcutlarda) otomatik küçültülür. Orijinal dosya yedek kalır ve geri alınabilir.',
                      style: TextStyle(color: Pal.textDim, fontSize: 12.5, height: 1.35),
                    ),
                    const SizedBox(height: Gap.m),
                    if (_data['ffmpeg'] == false)
                      Container(
                        padding: const EdgeInsets.all(Gap.m),
                        margin: const EdgeInsets.only(bottom: Gap.m),
                        decoration: BoxDecoration(color: Pal.red.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                        child: const Text('Sunucuda ffmpeg kurulu değil: dosyalar ölçülebilir ama küçültülemez.', style: TextStyle(color: Pal.red, fontSize: 12.5)),
                      ),
                    Card(
                      color: Pal.surface,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Pal.outline)),
                      child: Padding(
                        padding: const EdgeInsets.all(Gap.m),
                        child: Column(children: [
                          Row(children: [
                            _stat('Dosya', '${s['files'] ?? 0}'),
                            _stat('Sınırı aşan', '${s['over'] ?? 0}', color: ((s['over'] ?? 0) as num) > 0 ? Pal.red : Pal.green),
                            _stat('Denetlenmedi', '${s['unchecked'] ?? 0}', color: ((s['unchecked'] ?? 0) as num) > 0 ? Pal.amber : Pal.green),
                            _stat('Sınır dışı', '${s['exempt'] ?? 0}', color: Pal.gold),
                          ]),
                          const SizedBox(height: Gap.m),
                          Row(children: [
                            _stat('Toplam boyut', _mb(s['totalBytes'] as num?)),
                            _stat('Kazanılan', _mb(s['savedBytes'] as num?), color: Pal.green),
                            _stat('Yedekler', _mb(s['backupBytes'] as num?)),
                          ]),
                          const SizedBox(height: Gap.m),
                          FilledButton.icon(
                            onPressed: _running ? () => setState(() => _stop = true) : _runAll,
                            icon: _running ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.compress),
                            label: Text(_running ? 'Durdur' : (needWork ? 'Hepsini kontrol et ve sınıra indir' : 'Yeniden kontrol et')),
                          ),
                          if (_progress.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text(_progress, style: const TextStyle(color: Pal.textDim, fontSize: 12))),
                          if (((s['backupFiles'] ?? 0) as num) > 0)
                            TextButton.icon(onPressed: _running ? null : _cleanup, icon: const Icon(Icons.delete_sweep_outlined, size: 18), label: Text('Yedekleri temizle (${s['backupFiles']})')),
                        ]),
                      ),
                    ),
                    const SizedBox(height: Gap.m),
                    Card(
                      color: Pal.surface,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Pal.outline)),
                      child: ExpansionTile(
                        title: Text('Sınır dışı hediyeler (${gifts.where((g) => g['exempt'] == true).length})', style: const TextStyle(fontWeight: FontWeight.w800)),
                        subtitle: const Text('İşaretli hediyelerin dosyası küçültülmez (ör. kral, kraliçe, çift hediyeleri).', style: TextStyle(color: Pal.textDim, fontSize: 12)),
                        children: [
                          for (final g in gifts)
                            SwitchListTile(
                              dense: true,
                              title: Text('${g['name']}'),
                              value: g['exempt'] == true,
                              onChanged: _running ? null : (v) => _exempt(g, v),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: Gap.s),
                    Card(
                      color: Pal.surface,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Pal.outline)),
                      child: ExpansionTile(
                        title: const Text('Üst sınırlar', style: TextStyle(fontWeight: FontWeight.w800)),
                        childrenPadding: const EdgeInsets.fromLTRB(Gap.m, 0, Gap.m, Gap.m),
                        children: [
                          SwitchListTile(
                            contentPadding: EdgeInsets.zero,
                            title: const Text('Yüklenen dosyayı otomatik sınıra indir'),
                            value: _auto,
                            onChanged: (v) => setState(() => _auto = v),
                          ),
                          for (final f in _fields)
                            Padding(
                              padding: const EdgeInsets.only(bottom: Gap.s),
                              child: TextField(controller: _ctl[f.$1], keyboardType: TextInputType.number, decoration: InputDecoration(labelText: f.$2)),
                            ),
                          FilledButton.icon(
                            onPressed: _saving ? null : _save,
                            icon: _saving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.save),
                            label: const Text('Kaydet'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: Gap.m),
                    Text('Dosyalar (${items.length}) · büyükten küçüğe', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: Gap.s),
                    if (items.isEmpty) const Text('Henüz hediye / çerçeve / efekt dosyası yok.'),
                    for (final it in items) _item(it),
                  ]),
                ),
    );
  }
}
