import 'package:flutter/material.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';

/// Yönetim: şanslı hediye havuzları. Her şanslı hediyenin ana havuzu (x1–x50) ve büyük ödül havuzu (x100–x1000);
/// büyük ödül havuzu "fiyat × 100" birikince açılır. Giren / ödenen ve gerçekleşen geri dönüş görünür; havuza Coin eklenebilir.
class AdminLuckyPoolsScreen extends StatefulWidget {
  const AdminLuckyPoolsScreen({super.key});

  @override
  State<AdminLuckyPoolsScreen> createState() => _AdminLuckyPoolsScreenState();
}

class _AdminLuckyPoolsScreenState extends State<AdminLuckyPoolsScreen> {
  List<Map<String, dynamic>> _pools = const [];
  bool _loading = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Api.get('/api/admin/lucky-pools');
      if (!mounted) return;
      setState(() {
        _pools = listOf(r['pools']);
        _loading = false;
        _error = null;
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

  static BigInt _b(dynamic v) => BigInt.tryParse('${v ?? 0}') ?? BigInt.zero;

  Future<void> _seed(Map<String, dynamic> p) async {
    String pool = 'jackpot';
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => StatefulBuilder(
        builder: (c, set) => AlertDialog(
          backgroundColor: Pal.surface,
          title: Text('${p['name']} — havuza ekle'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'jackpot', label: Text('Büyük ödül')),
                ButtonSegment(value: 'base', label: Text('Ana havuz')),
              ],
              selected: {pool},
              onSelectionChanged: (v) => set(() => pool = v.first),
            ),
            const SizedBox(height: Gap.m),
            TextField(
              controller: ctl,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Coin', hintText: 'ör. 10000'),
            ),
            const SizedBox(height: Gap.s),
            const Text(
              'Eklenen Coin kazanç olarak oyunculara dağıtılır (platformdan çıkar) ve denetim kaydına yazılır.',
              style: TextStyle(color: Pal.textDim, fontSize: 12),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Vazgeç')),
            FilledButton(onPressed: () => Navigator.pop(c, true), child: const Text('Ekle')),
          ],
        ),
      ),
    );
    final coins = int.tryParse(ctl.text.trim());
    ctl.dispose();
    if (ok != true || !mounted) return;
    if (coins == null || coins <= 0) {
      toast(context, 'Geçerli bir miktar girin.', error: true);
      return;
    }
    final r = await guard(context, () => Api.post('/api/admin/lucky-pools/${p['giftId']}/seed', {'pool': pool, 'coins': coins}));
    if (r != null && mounted) {
      toast(context, 'Havuza eklendi.');
      _load();
    }
  }

  Widget _card(Map<String, dynamic> p) {
    final jackpot = _b(p['jackpot']);
    final openAt = _b(p['openAt']);
    final open = openAt > BigInt.zero && jackpot >= openAt;
    final frac = openAt <= BigInt.zero ? 1.0 : (jackpot.toDouble() / openAt.toDouble()).clamp(0.0, 1.0);
    final tin = _b(p['totalIn']);
    final tout = _b(p['totalOut']);
    final rtp = tin > BigInt.zero ? (tout.toDouble() / tin.toDouble() * 100) : 0.0;
    Widget kv(String k, String v) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 2),
          child: Row(children: [
            Expanded(child: Text(k, style: const TextStyle(color: Pal.textDim, fontSize: 12.5))),
            Text(v, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
          ]),
        );
    return Card(
      color: Pal.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Pal.outline)),
      child: Padding(
        padding: const EdgeInsets.all(Gap.m),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text('${p['name']} · ${fmtNumber(p['coinPrice'])} Coin${p['active'] == false ? ' (kapalı)' : ''}',
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            ),
            TextButton.icon(onPressed: () => _seed(p), icon: const Icon(Icons.add, size: 18), label: const Text('Ekle')),
          ]),
          const SizedBox(height: Gap.s),
          Text(open ? 'Büyük ödül havuzu DOLU (x100–x1000 açık)' : 'Büyük ödül havuzu dolmadı',
              style: TextStyle(color: open ? Pal.gold : Pal.textDim, fontWeight: FontWeight.w700, fontSize: 12.5)),
          const SizedBox(height: 4),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: frac, minHeight: 7, color: open ? Pal.gold : Pal.amber, backgroundColor: Pal.surfaceHi),
          ),
          const SizedBox(height: Gap.s),
          kv('Büyük ödül havuzu', '${fmtNumber(jackpot.toString())} / ${fmtNumber(openAt.toString())}'),
          kv('Ana havuz (x1–x50)', fmtNumber(p['base'])),
          kv('Gönderimlerden giren', fmtNumber(tin.toString())),
          kv('Ödenen kazanç', fmtNumber(tout.toString())),
          kv('Yönetimin eklediği', fmtNumber(p['seeded'])),
          kv('Büyük ödül sayısı', '${p['jackpotHits'] ?? 0}'),
          kv('Ödenen / giren', '%${rtp.toStringAsFixed(1)}'),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Şanslı hediye havuzları'), actions: [IconButton(onPressed: _load, icon: const Icon(Icons.refresh))]),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? LoadError(message: errorText(_error!), onRetry: _load)
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(padding: const EdgeInsets.all(Gap.m), children: [
                    const Text(
                      'Her gönderimin "geri dönüş oranı" kadarı hediyenin havuzuna girer; kazançlar yalnızca havuzdan ödenir. '
                      'Büyük ödül havuzu fiyat × 100 birikince x100–x1000 açılır, çıkınca boşalır ve yeniden dolar.',
                      style: TextStyle(color: Pal.textDim, fontSize: 12.5, height: 1.35),
                    ),
                    const SizedBox(height: Gap.m),
                    if (_pools.isEmpty) const Text('Şanslı hediye yok.'),
                    for (final p in _pools) _card(p),
                  ]),
                ),
    );
  }
}
