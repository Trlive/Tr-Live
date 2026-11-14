import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';

/// Yönetim: günlük giriş ödülleri (7 gün Coin, 7. gün çerçeve / araç ve süresi, aç / kapat). Uygulama ayarlarına kaydedilir.
class AdminCheckinScreen extends StatefulWidget {
  const AdminCheckinScreen({super.key});

  @override
  State<AdminCheckinScreen> createState() => _AdminCheckinScreenState();
}

class _AdminCheckinScreenState extends State<AdminCheckinScreen> {
  final _coins = List.generate(7, (_) => TextEditingController());
  final _days = TextEditingController();
  bool _enabled = true;
  String _frame = '';
  String _vehicle = '';
  List<Map<String, dynamic>> _frames = const [];
  List<Map<String, dynamic>> _vehicles = const [];
  bool _loading = true;
  bool _busy = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in _coins) {
      c.dispose();
    }
    _days.dispose();
    super.dispose();
  }

  List<Map<String, dynamic>> _items(Map<String, dynamic> r) => [
        for (final x in (r['items'] as List? ?? const []))
          if (x is Map && x['wip'] != true) Map<String, dynamic>.from(x),
      ];

  Future<void> _load() async {
    try {
      final res = await Future.wait([
        Api.get('/api/admin/app-config'),
        Api.get('/api/admin/grantables', query: {'category': 'frame'}),
        Api.get('/api/admin/grantables', query: {'category': 'vehicle'}),
      ]);
      final c = Map<String, dynamic>.from(res[0]['config'] as Map? ?? const {});
      final parts = (c['checkinCoins'] ?? '20,20,20,20,50,50,100').toString().split(',');
      if (!mounted) return;
      setState(() {
        for (var i = 0; i < 7; i++) {
          _coins[i].text = i < parts.length ? parts[i].trim() : '0';
        }
        _days.text = '${c['checkinItemDays'] ?? 7}';
        _enabled = c['checkinEnabled'] != false;
        _frames = _items(res[1]);
        _vehicles = _items(res[2]);
        final f = (c['checkinFrameId'] ?? '').toString();
        final v = (c['checkinVehicleId'] ?? '').toString();
        _frame = _frames.any((x) => x['key'] == f) ? f : '';
        _vehicle = _vehicles.any((x) => x['key'] == v) ? v : '';
        _loading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _save() async {
    final coins = [for (final c in _coins) int.tryParse(c.text.trim())];
    if (coins.any((n) => n == null || n < 0)) {
      toast(context, 'Her gün için 0 veya daha büyük bir sayı yazın.', error: true);
      return;
    }
    final days = int.tryParse(_days.text.trim());
    if (days == null || days < 1 || days > 90) {
      toast(context, 'Eşya süresi 1-90 gün olmalı.', error: true);
      return;
    }
    setState(() => _busy = true);
    final r = await guard(
      context,
      () => Api.put('/api/admin/app-config', {
        'checkinEnabled': _enabled,
        'checkinCoins': coins.join(','),
        'checkinFrameId': _frame,
        'checkinVehicleId': _vehicle,
        'checkinItemDays': days,
      }),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (r != null) toast(context, 'Günlük giriş ödülleri kaydedildi.');
  }

  Widget _picker(String label, String value, List<Map<String, dynamic>> items, ValueChanged<String> onChanged) {
    return DropdownButtonFormField<String>(
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        const DropdownMenuItem(value: '', child: Text('Yok (verilmez)')),
        for (final x in items) DropdownMenuItem(value: x['key'].toString(), child: Text('${x['name']}', overflow: TextOverflow.ellipsis)),
      ],
      onChanged: (v) => onChanged(v ?? ''),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Günlük giriş ödülleri')),
      body: _error != null
          ? LoadError(message: errorText(_error!), onRetry: () {
              setState(() => _error = null);
              _load();
            })
          : _loading
              ? const Center(child: CircularProgressIndicator())
              : ListView(padding: const EdgeInsets.all(16), children: [
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Günlük giriş açık'),
                    subtitle: const Text('Kapalıyken pencere açılışta gösterilmez ve ödül alınamaz.'),
                    value: _enabled,
                    onChanged: (v) => setState(() => _enabled = v),
                  ),
                  const SizedBox(height: 8),
                  const Text('Gün gün Coin ödülü', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 4),
                  const Text('Seri her gün giriş yapınca ilerler; bir gün atlanırsa veya 7. gün alınınca 1. güne döner.', style: TextStyle(color: Pal.textDim, fontSize: 12)),
                  const SizedBox(height: 10),
                  Wrap(spacing: 10, runSpacing: 10, children: [
                    for (var i = 0; i < 7; i++)
                      SizedBox(
                        width: 96,
                        child: TextField(
                          controller: _coins[i],
                          keyboardType: TextInputType.number,
                          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(9)],
                          decoration: InputDecoration(labelText: '${i + 1}. gün', suffixText: 'Coin', isDense: true),
                        ),
                      ),
                  ]),
                  const SizedBox(height: 22),
                  const Text('7. gün eşya ödülü', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 8),
                  _picker('Çerçeve', _frame, _frames, (v) => setState(() => _frame = v)),
                  const SizedBox(height: 8),
                  _picker('Araç', _vehicle, _vehicles, (v) => setState(() => _vehicle = v)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _days,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(2)],
                    decoration: const InputDecoration(labelText: 'Eşya süresi (gün)', helperText: 'Zaten varsa süresi uzar.'),
                  ),
                  const SizedBox(height: 24),
                  FilledButton(onPressed: _busy ? null : _save, child: Text(_busy ? 'Kaydediliyor…' : 'Kaydet')),
                ]),
    );
  }
}
