import 'package:flutter/material.dart';
import '../services/api.dart';
import '../services/session.dart';
import 'app_theme.dart';
import 'common.dart';

/// Doğum günü mikrofon modu penceresi (oda sahibi): fiyat / süre, Coin ile satın alma, kimin doğum günü olduğunu yazma,
/// uygulama ve kapatma. Hak yönetimce de hediye edilebilir; süre bitince oda normal moda döner.
/// [patchRoom]: oda ayarını sunucuya gönderir (true = başarılı).
Future<void> showBirthdaySheet(
  BuildContext context, {
  required String? currentName,
  required bool active,
  required Future<bool> Function(Map<String, dynamic>) patchRoom,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (c) => _BirthdaySheet(currentName: currentName, active: active, patchRoom: patchRoom),
  );
}

class _BirthdaySheet extends StatefulWidget {
  final String? currentName;
  final bool active;
  final Future<bool> Function(Map<String, dynamic>) patchRoom;
  const _BirthdaySheet({required this.currentName, required this.active, required this.patchRoom});

  @override
  State<_BirthdaySheet> createState() => _BirthdaySheetState();
}

class _BirthdaySheetState extends State<_BirthdaySheet> {
  Map<String, dynamic>? _skin;
  String? _error;
  bool _loading = true;
  bool _busy = false;
  late final TextEditingController _name = TextEditingController(text: widget.currentName ?? '');

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await Api.get('/api/mic-skins');
      final s = listOf(r['skins']).where((x) => x['key'] == 'birthday').toList();
      if (!mounted) return;
      setState(() {
        _skin = s.isEmpty ? null : s.first;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = errorText(e);
        _loading = false;
      });
    }
  }

  DateTime? get _until => DateTime.tryParse((_skin?['ownedUntil'] ?? '').toString())?.toLocal();
  bool get _owned => _until != null && _until!.isAfter(DateTime.now());

  String _fmtDate(DateTime d) {
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}.${two(d.month)}.${d.year} ${two(d.hour)}:${two(d.minute)}';
  }

  Future<void> _buy() async {
    final s = _skin;
    if (s == null) return;
    final price = fmtNumber(s['priceCoins']);
    if (!await confirm(context, '$price Coin karşılığında ${s['durationDays']} günlük Doğum Günü modu satın alınsın mı?', action: 'Satın al')) return;
    if (!mounted) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.postOnce('/api/mic-skins/birthday/buy', {}));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) {
      Session.setCoins((r['balance'] ?? Session.coins).toString());
      toast(context, 'Doğum Günü modu alındı.');
      await _load();
    }
  }

  Future<void> _apply() async {
    setState(() => _busy = true);
    final ok = await widget.patchRoom({'micSkin': 'birthday', 'micSkinText': _name.text.trim()});
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context);
  }

  Future<void> _off() async {
    setState(() => _busy = true);
    final ok = await widget.patchRoom({'micSkin': null});
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final s = _skin;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        decoration: const BoxDecoration(color: Color(0xFF1C1C1F), borderRadius: BorderRadius.vertical(top: Radius.circular(22))),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: _loading
                ? const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()))
                : (s == null
                    ? Padding(padding: const EdgeInsets.all(16), child: Text(_error ?? 'Doğum Günü modu şu an mevcut değil.', style: const TextStyle(color: Colors.white70)))
                    : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          const Text('🎂', style: TextStyle(fontSize: 26)),
                          const SizedBox(width: 8),
                          const Expanded(child: Text('Doğum Günü Mikrofon Modu', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white))),
                          InkResponse(onTap: () => Navigator.pop(context), child: const Icon(Icons.close, color: Colors.white70)),
                        ]),
                        const SizedBox(height: 8),
                        Text('${s['seatCount']} mikrofon, pasta ve kutlama şeridi. Ortadaki taçlı koltuğa mikrofona isteyen oturabilir; şeritte yazdığın isim görünür.',
                            style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.3)),
                        const SizedBox(height: 12),
                        if (_owned)
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(color: Pal.green.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(10)),
                            child: Row(children: [
                              const Icon(Icons.check_circle, color: Pal.green, size: 18),
                              const SizedBox(width: 8),
                              Expanded(child: Text('Hakkın var · bitiş: ${_fmtDate(_until!)}', style: const TextStyle(color: Colors.white, fontSize: 13))),
                            ]),
                          )
                        else
                          Text('${fmtNumber(s['priceCoins'])} Coin · ${s['durationDays']} gün', style: const TextStyle(color: Pal.gold, fontWeight: FontWeight.w800, fontSize: 16)),
                        const SizedBox(height: 12),
                        if (_owned) ...[
                          TextField(
                            controller: _name,
                            maxLength: 40,
                            style: const TextStyle(color: Colors.white),
                            decoration: const InputDecoration(labelText: 'Kimin doğum günü?', hintText: 'Örn. Merdo21', border: OutlineInputBorder()),
                          ),
                          FilledButton.icon(onPressed: _busy ? null : _apply, icon: const Icon(Icons.cake), label: Text(widget.active ? 'Güncelle' : 'Uygula')),
                          if (widget.active) TextButton(onPressed: _busy ? null : _off, child: const Text('Normal moda dön')),
                          TextButton(onPressed: _busy ? null : _buy, child: Text('Süre ekle (${fmtNumber(s['priceCoins'])} Coin)')),
                        ] else
                          FilledButton.icon(onPressed: _busy ? null : _buy, icon: const Icon(Icons.shopping_bag), label: Text('Satın al · ${fmtNumber(s['priceCoins'])} Coin')),
                      ])),
          ),
        ),
      ),
    );
  }
}
