import 'package:flutter/material.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import '../services/session.dart';
import 'app_theme.dart';
import 'common.dart';
import 'seat_picker.dart';

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

  /// Coin ile satın alır (ya da süre ekler). Başarılıysa true.
  Future<bool> _buy() async {
    final s = _skin;
    if (s == null) return false;
    final price = fmtNumber(s['priceCoins']);
    if (!await confirm(context, tx('{price} Coin karşılığında {durationDays} günlük Doğum Günü modu satın alınsın mı?', {'price': price, 'durationDays': s['durationDays']}), action: tx('Satın al'))) return false;
    if (!mounted) return false;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.postOnce('/api/mic-skins/birthday/buy', {}));
    if (!mounted) return false;
    setState(() => _busy = false);
    if (r == null) return false;
    Session.setCoins((r['balance'] ?? Session.coins).toString());
    toast(context, tx('Doğum Günü modu alındı.'));
    await _load();
    return true;
  }

  /// Hakkı yoksa önce satın alır, ardından odaya uygular (tek dokunuş).
  Future<void> _buyAndApply() async {
    if (!_owned && !await _buy()) return;
    if (!mounted || !_owned) return;
    await _apply();
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
        decoration: const BoxDecoration(
          color: Pal.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          border: Border(top: BorderSide(color: Pal.outline)),
        ),
        child: SafeArea(
          top: false,
          child: _loading
              ? const SizedBox(height: 160, child: Center(child: CircularProgressIndicator(color: Pal.cyan)))
              : (s == null
                  ? Padding(padding: const EdgeInsets.all(24), child: Text(_error ?? tx('Doğum Günü modu şu an mevcut değil.'), style: const TextStyle(color: Pal.textDim)))
                  : SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        Row(children: [
                          const Text('🎂', style: TextStyle(fontSize: 26)),
                          const SizedBox(width: 8),
                          Expanded(child: Text(tx('Doğum Günü Mikrofon Modu'), style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900, color: Pal.cyan))),
                          InkResponse(onTap: () => Navigator.pop(context), child: const Icon(Icons.close, color: Pal.textDim)),
                        ]),
                        const SizedBox(height: 12),
                        // Önizleme: odadaki yerleşimin küçük hâli (şerit, pasta, 25 mikrofon).
                        Center(
                          child: Container(
                            width: 150,
                            height: 190,
                            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: widget.active ? Pal.cyan : Pal.outline, width: widget.active ? 2.5 : 1)),
                            padding: const EdgeInsets.all(1),
                            child: ClipRRect(borderRadius: BorderRadius.circular(12), child: const SeatModeThumb(kBirthdaySeats, skin: kBirthdaySkin)),
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(tx('{seatCount} mikrofon, pasta ve kutlama şeridi. Ortadaki taçlı koltuğa mikrofona isteyen oturabilir; şeritte yazdığın isim görünür.', {'seatCount': s['seatCount']}),
                            style: const TextStyle(color: Pal.textDim, fontSize: 13, height: 1.35)),
                        const SizedBox(height: 12),
                        if (_owned)
                          Container(
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(color: Pal.green.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10), border: Border.all(color: Pal.green.withValues(alpha: 0.4))),
                            child: Row(children: [
                              const Icon(Icons.check_circle, color: Pal.green, size: 18),
                              const SizedBox(width: 8),
                              Expanded(child: Text(tx('Hakkın var · bitiş: {v1}', {'v1': _fmtDate(_until!)}), style: const TextStyle(color: Pal.text, fontSize: 13))),
                            ]),
                          )
                        else
                          Row(children: [
                            const Text('🪙', style: TextStyle(fontSize: 18)),
                            const SizedBox(width: 6),
                            Text(tx('{priceCoins} Coin · {durationDays} gün', {'priceCoins': fmtNumber(s['priceCoins']), 'durationDays': s['durationDays']}), style: const TextStyle(color: Pal.gold, fontWeight: FontWeight.w900, fontSize: 16)),
                          ]),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _name,
                          maxLength: 40,
                          style: const TextStyle(color: Pal.text),
                          cursorColor: Pal.cyan,
                          decoration: InputDecoration(
                            labelText: tx('Kimin doğum günü?'),
                            hintText: tx('Örn. Merdo21'),
                            prefixIcon: const Icon(Icons.celebration, color: Pal.amber),
                            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.outline)),
                            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.cyan, width: 1.6)),
                          ),
                        ),
                        const SizedBox(height: 4),
                        SizedBox(
                          height: 48,
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(colors: _busy ? const [Pal.outline, Pal.outline] : const [Pal.amber, Pal.cyan]),
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: Material(
                              color: Colors.transparent,
                              child: InkWell(
                                borderRadius: BorderRadius.circular(24),
                                onTap: _busy ? null : (_owned ? _apply : _buyAndApply),
                                child: Center(
                                  child: _busy
                                      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Pal.onBright))
                                      : Text(
                                          _owned
                                              ? (widget.active ? tx('Güncelle') : tx('Uygula'))
                                              : tx('Satın al ve uygula · {priceCoins} Coin', {'priceCoins': fmtNumber(s['priceCoins'])}),
                                          style: const TextStyle(color: Pal.onBright, fontWeight: FontWeight.w900, fontSize: 15),
                                        ),
                                ),
                              ),
                            ),
                          ),
                        ),
                        if (_owned) ...[
                          const SizedBox(height: 6),
                          Row(children: [
                            if (widget.active)
                              Expanded(child: TextButton(onPressed: _busy ? null : _off, child: Text(tx('Normal moda dön'), style: const TextStyle(color: Pal.textDim)))),
                            Expanded(
                              child: TextButton(
                                onPressed: _busy ? null : () => _buy(),
                                child: Text(tx('Süre ekle ({priceCoins} Coin)', {'priceCoins': fmtNumber(s['priceCoins'])}), style: const TextStyle(color: Pal.cyan)),
                              ),
                            ),
                          ]),
                        ],
                      ]),
                    )),
        ),
      ),
    );
  }
}
