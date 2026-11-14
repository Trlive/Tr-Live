import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/image_pick.dart';
import '../widgets/net_image.dart';
import '../widgets/room_theme.dart';

const _effectLabels = {
  'none': 'Hareketsiz',
  'aurora': 'Kutup ışığı',
  'stars': 'Parlayan yıldızlar',
  'meteors': 'Yıldız kayması',
  'snow': 'Kar',
  'petals': 'Çiçek yaprakları',
  'fireflies': 'Ateş böcekleri',
  'bubbles': 'Baloncuk',
  'embers': 'Kor / kıvılcım',
};

/// Yönetim: oda temaları (ekle / düzenle / kapat / sil) ve kullanıcı özel tema talepleri (onay / red).
/// Yüklenen her görsel sunucuda otomatik olarak 1080x1920 tam ekran + 360x640 küçük resme getirilir.
class AdminRoomThemesScreen extends StatefulWidget {
  const AdminRoomThemesScreen({super.key});

  @override
  State<AdminRoomThemesScreen> createState() => _AdminRoomThemesScreenState();
}

class _AdminRoomThemesScreenState extends State<AdminRoomThemesScreen> {
  int _v = 0;
  String _status = 'pending';

  void _refresh() => setState(() => _v++);

  Future<void> _edit([Map<String, dynamic>? t]) async {
    final saved = await Navigator.push<bool>(context, MaterialPageRoute(builder: (_) => _ThemeEditPage(theme: t)));
    if (saved == true) {
      RoomThemes.load(force: true);
      _refresh();
    }
  }

  Future<void> _toggle(Map<String, dynamic> t, bool v) async {
    if (await guard(context, () => Api.patch('/api/admin/room-themes/${t['key']}', {'active': v})) != null) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Oda temaları'),
          bottom: const TabBar(tabs: [Tab(text: 'Temalar'), Tab(text: 'Özel tema talepleri')]),
        ),
        floatingActionButton: Builder(
          builder: (c) => FloatingActionButton.extended(onPressed: () => _edit(), icon: const Icon(Icons.add), label: const Text('Tema ekle')),
        ),
        body: TabBarView(children: [_themes(), _requests()]),
      ),
    );
  }

  Widget _themes() {
    return FutureBuilder<Map<String, dynamic>>(
      key: ValueKey('t$_v'),
      future: Api.get('/api/admin/room-themes'),
      builder: (context, snap) {
        if (snap.hasError) return Center(child: Text(errorText(snap.error!)));
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final list = [for (final t in (snap.data!['themes'] as List? ?? const [])) Map<String, dynamic>.from(t as Map)];
        final dpr = MediaQuery.devicePixelRatioOf(context);
        return RefreshIndicator(
          onRefresh: () async => _refresh(),
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final t = list[i];
              final free = t['free'] == true;
              final thumb = Api.absoluteUrl(t['thumbUrl']?.toString());
              return Card(
                child: InkWell(
                  onTap: () => _edit(t),
                  child: Padding(
                    padding: const EdgeInsets.all(8),
                    child: Row(children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: SizedBox(
                          width: 54,
                          height: 96,
                          child: thumb == null ? const ColoredBox(color: Pal.surfaceHi) : Image(image: NetImage(thumb, targetW: NetImage.px(54, dpr), targetH: NetImage.px(96, dpr)), fit: BoxFit.cover),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text('${t['label']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                          Text(t['key'].toString(), style: const TextStyle(color: Pal.textDim, fontSize: 12)),
                          const SizedBox(height: 4),
                          Text(free ? 'Coin\'siz' : '${fmtNumber(t['priceCoins'])} Coin · ${t['durationDays']} gün', style: TextStyle(color: free ? Pal.green : Pal.gold, fontWeight: FontWeight.w600)),
                          Text('${_effectLabels[t['effect']] ?? t['effect']} · ${t['inUse'] ?? 0} odada', style: const TextStyle(color: Pal.textDim, fontSize: 12)),
                        ]),
                      ),
                      Switch(value: t['active'] == true, onChanged: t['key'] == 'default' ? null : (v) => _toggle(t, v)),
                    ]),
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }

  Widget _requests() {
    const labels = {'pending': 'Bekleyen', 'approved': 'Onaylanan', 'rejected': 'Reddedilen', 'granted': 'Görsel bekleyen'};
    return Column(children: [
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
        child: Row(children: [
          for (final e in labels.entries)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(label: Text(e.value), selected: _status == e.key, onSelected: (_) => setState(() => _status = e.key)),
            ),
        ]),
      ),
      Expanded(
        child: FutureBuilder<Map<String, dynamic>>(
          key: ValueKey('r$_v$_status'),
          future: Api.get('/api/admin/room-themes/custom?status=$_status'),
          builder: (context, snap) {
            if (snap.hasError) return Center(child: Text(errorText(snap.error!)));
            if (!snap.hasData) return const Center(child: CircularProgressIndicator());
            final items = [for (final t in (snap.data!['items'] as List? ?? const [])) Map<String, dynamic>.from(t as Map)];
            if (items.isEmpty) return const Center(child: Text('Kayıt yok.', style: TextStyle(color: Pal.textDim)));
            return GridView.builder(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 96),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.48, mainAxisSpacing: 10, crossAxisSpacing: 10),
              itemCount: items.length,
              itemBuilder: (_, i) => _requestCard(items[i]),
            );
          },
        ),
      ),
    ]);
  }

  Widget _requestCard(Map<String, dynamic> r) {
    final img = Api.absoluteUrl(r['imageUrl']?.toString());
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final pending = r['status'] == 'pending';
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Expanded(
          child: GestureDetector(
            onTap: img == null ? null : () => _fullImage(img),
            child: img == null
                ? const ColoredBox(color: Pal.surfaceHi, child: Center(child: Text('Görsel yok', style: TextStyle(color: Pal.textDim))))
                : Image(image: NetImage(img, targetW: NetImage.px(200, dpr), targetH: NetImage.px(356, dpr)), fit: BoxFit.cover),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
          child: Text('@${r['username'] ?? '?'} · ${r['days']} gün', maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
        if (r['reviewNote'] != null) Padding(padding: const EdgeInsets.symmetric(horizontal: 8), child: Text('${r['reviewNote']}', maxLines: 2, style: const TextStyle(color: Pal.textDim, fontSize: 12))),
        if (pending)
          Row(children: [
            Expanded(child: TextButton(onPressed: () => _reject(r), child: const Text('Reddet', style: TextStyle(color: Pal.red)))),
            Expanded(child: TextButton(onPressed: () => _approve(r), child: const Text('Onayla', style: TextStyle(color: Pal.green)))),
          ])
        else
          const SizedBox(height: 8),
      ]),
    );
  }

  void _fullImage(String url) => showDialog<void>(
        context: context,
        builder: (c) => GestureDetector(onTap: () => Navigator.pop(c), child: InteractiveViewer(child: Image(image: NetImage(url)))),
      );

  Future<void> _approve(Map<String, dynamic> r) async {
    if (!await confirm(context, '@${r['username']} kullanıcısının özel teması onaylansın mı? ${r['days']} günlük süre şimdi başlar.', action: 'Onayla')) return;
    if (!mounted) return;
    if (await guard(context, () => Api.post('/api/admin/room-themes/custom/${r['id']}/approve', {})) != null && mounted) {
      toast(context, 'Onaylandı; kullanıcıya bildirildi.');
      _refresh();
    }
  }

  Future<void> _reject(Map<String, dynamic> r) async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: const Text('Reddet'),
        content: TextField(controller: ctl, maxLength: 200, decoration: const InputDecoration(labelText: 'Neden (kullanıcı görür)', hintText: 'Örn. telif / uygunsuz içerik / düşük kalite')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Reddet')),
        ],
      ),
    );
    final note = ctl.text.trim();
    ctl.dispose();
    if (ok != true || !mounted) return;
    if (await guard(context, () => Api.post('/api/admin/room-themes/custom/${r['id']}/reject', {'note': note})) != null && mounted) {
      toast(context, 'Reddedildi. Kullanıcı yeni görsel yükleyebilir.');
      _refresh();
    }
  }
}

/// Tema ekle / düzenle.
class _ThemeEditPage extends StatefulWidget {
  final Map<String, dynamic>? theme;
  const _ThemeEditPage({this.theme});

  @override
  State<_ThemeEditPage> createState() => _ThemeEditPageState();
}

class _ThemeEditPageState extends State<_ThemeEditPage> {
  late final bool _isNew = widget.theme == null;
  late final _key = TextEditingController(text: widget.theme?['key']?.toString() ?? '');
  late final _label = TextEditingController(text: widget.theme?['label']?.toString() ?? '');
  late final _price = TextEditingController(text: widget.theme?['priceCoins']?.toString() ?? '0');
  late final _days = TextEditingController(text: '${widget.theme?['durationDays'] ?? 14}');
  late final _sort = TextEditingController(text: '${widget.theme?['sortOrder'] ?? 100}');
  late String _effect = widget.theme?['effect']?.toString() ?? 'none';
  late String? _imageUrl = widget.theme?['imageUrl']?.toString();
  late String? _thumbUrl = widget.theme?['thumbUrl']?.toString();
  bool _busy = false;

  @override
  void dispose() {
    for (final c in [_key, _label, _price, _days, _sort]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pick() async {
    final p = await pickImage(context, crop: CropSpec.roomTheme);
    if (p == null || !mounted) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.putBytes('/api/admin/room-themes/image', p.bytes, p.mime));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (r != null) {
        _imageUrl = r['imageUrl']?.toString();
        _thumbUrl = r['thumbUrl']?.toString();
      }
    });
  }

  Future<void> _save() async {
    final body = <String, dynamic>{
      'label': _label.text.trim(),
      'priceCoins': _price.text.trim().isEmpty ? '0' : _price.text.trim(),
      'durationDays': int.tryParse(_days.text.trim()) ?? 14,
      'sortOrder': int.tryParse(_sort.text.trim()) ?? 100,
      'effect': _effect,
      if (_imageUrl != null) 'imageUrl': _imageUrl,
      'thumbUrl': _thumbUrl,
    };
    if (_isNew && _imageUrl == null) {
      toast(context, 'Önce bir görsel yükleyin.', error: true);
      return;
    }
    setState(() => _busy = true);
    final r = await guard(context, () => _isNew ? Api.post('/api/admin/room-themes', {...body, 'key': _key.text.trim().toLowerCase()}) : Api.patch('/api/admin/room-themes/${widget.theme!['key']}', body));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) Navigator.pop(context, true);
  }

  Future<void> _delete() async {
    final inUse = widget.theme?['inUse'] ?? 0;
    if (!await confirm(context, '"${widget.theme!['label']}" silinsin mi? Kullanan $inUse oda Varsayılan temaya döner. Satın alanların kalan süresi geçersiz olur.', action: 'Sil', destructive: true)) return;
    if (!mounted) return;
    if (await guard(context, () => Api.delete('/api/admin/room-themes/${widget.theme!['key']}')) != null && mounted) Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    final img = Api.absoluteUrl(_thumbUrl ?? _imageUrl);
    final dpr = MediaQuery.devicePixelRatioOf(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(_isNew ? 'Yeni tema' : 'Temayı düzenle'),
        actions: [if (!_isNew && widget.theme!['key'] != 'default') IconButton(tooltip: 'Sil', onPressed: _busy ? null : _delete, icon: const Icon(Icons.delete_outline))],
      ),
      body: AbsorbPointer(
        absorbing: _busy,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          Center(
            child: GestureDetector(
              onTap: _pick,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: SizedBox(
                  width: 162,
                  height: 288,
                  child: Stack(fit: StackFit.expand, children: [
                    if (img != null) Image(image: NetImage(img, targetW: NetImage.px(162, dpr), targetH: NetImage.px(288, dpr)), fit: BoxFit.cover) else const ColoredBox(color: Pal.surfaceHi),
                    Align(
                      alignment: Alignment.bottomCenter,
                      child: Container(
                        width: double.infinity,
                        color: Colors.black54,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Text(img == null ? 'Görsel seç (9:16)' : 'Görseli değiştir', textAlign: TextAlign.center),
                      ),
                    ),
                    if (_busy) const ColoredBox(color: Colors.black45, child: Center(child: CircularProgressIndicator())),
                  ]),
                ),
              ),
            ),
          ),
          const SizedBox(height: 6),
          const Text('Görsel kırpılır ve sunucuda her ekrana uyacak şekilde 1080x1920 boyutuna getirilir.', textAlign: TextAlign.center, style: TextStyle(color: Pal.textDim, fontSize: 12)),
          const SizedBox(height: 16),
          if (_isNew)
            TextField(
              controller: _key,
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[a-z0-9_]')), LengthLimitingTextInputFormatter(20)],
              decoration: const InputDecoration(labelText: 'Anahtar (ör. yaz_gecesi)', helperText: 'Küçük harf, rakam, alt çizgi. Sonradan değişmez.'),
            ),
          TextField(controller: _label, maxLength: 40, decoration: const InputDecoration(labelText: 'Görünen ad')),
          Row(children: [
            Expanded(child: TextField(controller: _price, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], decoration: const InputDecoration(labelText: 'Fiyat (Coin, 0 = Coin\'siz)'))),
            const SizedBox(width: 12),
            Expanded(child: TextField(controller: _days, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.digitsOnly], decoration: const InputDecoration(labelText: 'Süre (gün)'))),
          ]),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _effect,
            decoration: const InputDecoration(labelText: 'Hareket efekti (hafif, kasmaz)'),
            items: [for (final e in _effectLabels.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _effect = v ?? 'none'),
          ),
          const SizedBox(height: 8),
          TextField(controller: _sort, keyboardType: const TextInputType.numberWithOptions(signed: true), decoration: const InputDecoration(labelText: 'Sıra (küçük olan önce)')),
          const SizedBox(height: 20),
          FilledButton(onPressed: _busy ? null : _save, child: const Text('Kaydet')),
        ]),
      ),
    );
  }
}
