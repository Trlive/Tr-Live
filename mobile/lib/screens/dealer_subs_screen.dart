import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../l10n/l10n.dart';
import '../services/api.dart';
import '../widgets/common.dart';

/// Alt bayilerim (ana bayi görünümü).
///
/// Ana bayi, kendi stoğundan alt bayilerine Coin aktarır. Coin YARATILMAZ: aktarım
/// ana bayinin bakiyesinden düşer. Sunucu tarafında tek işlemde yapılır ve iki tarafın
/// defterine de yazılır; burada yalnızca görüntü ve istek var.
///
/// Bu ekran ayrı dosyada: dealer_center_screen.dart 1000 satırı aştı, modül standardı
/// gereği yeni bölüm oraya eklenmiyor.
const _dark = Color(0xFF0B0906);
const _card = Color(0xFF17130C);
const _line = Color(0xFF3A2F1A);
const _gold = Color(0xFFF2B92A);
const _goldHi = Color(0xFFFFD54F);

class DealerSubsScreen extends StatefulWidget {
  const DealerSubsScreen({super.key});

  @override
  State<DealerSubsScreen> createState() => _DealerSubsScreenState();
}

class _DealerSubsScreenState extends State<DealerSubsScreen> {
  int _v = 0;

  Future<Map<String, dynamic>> _load() async {
    // Kendi bakiyemizi de alıyoruz: aktarım kutusunda "/ stok" göstermek ve
    // kullanıcıyı sunucuya boşuna göndermemek için.
    final subs = Api.get('/api/dealer/subs');
    final me = Api.get('/api/dealer/me').catchError((_) => <String, dynamic>{});
    return {'subs': await subs, 'me': await me};
  }

  /// Aktarım kutusu. Tarayıcının kendi kutusu DEĞİL, uygulama içi kutu.
  Future<void> _transfer(Map<String, dynamic> sub, String balance) async {
    final ctl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        backgroundColor: _card,
        title: Text(tx('Alt bayiye Coin aktar'), style: const TextStyle(color: _goldHi)),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${sub['name']}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text(tx('Aktarılan Coin stoğundan düşer.'), style: const TextStyle(color: Colors.white54, fontSize: 12.5)),
          const SizedBox(height: 10),
          TextField(
            controller: ctl,
            autofocus: true,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(hintText: tx('Coin miktarı'), suffixText: '/ ${fmtNumber(balance)}'),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: Text(tx('İptal'))),
          FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(tx('Aktar'))),
        ],
      ),
    );
    final amount = ctl.text.trim();
    if (ok != true || amount.isEmpty || !mounted) return;
    // postOnce: ağ koparsa uygulama isteği tekrarlayabilir; para hareketinde tekrar
    // iki kez aktarım demektir. Sunucu aynı anahtarla gelen ikinci isteğe ilkinin
    // sonucunu döner.
    final r = await guard(context, () => Api.postOnce('/api/dealer/subs/${sub['id']}/transfer', {'coins': amount}));
    if (r == null || !mounted) return;
    setState(() => _v++);
    toast(context, tx('Aktarıldı.'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _dark,
      appBar: AppBar(backgroundColor: _dark, title: Text(tx('Alt Bayilerim'))),
      body: AsyncBody<Map<String, dynamic>>(
        key: ValueKey(_v),
        load: _load,
        builder: (context, data, reload) {
          // mapOf nullable döner; her erişimde varsayılan veriyoruz.
          final subsData = mapOf(data['subs']) ?? const <String, dynamic>{};
          final dealer = mapOf(mapOf(data['me'])?['dealer']);
          final balance = '${dealer?['coinBalance'] ?? '0'}';

          // Alt bayinin kendi alt bayisi olamaz (en fazla iki kat). Boş liste değil,
          // açıklayıcı metin gösteriyoruz: kullanıcı "neden boş" diye sormasın.
          if (subsData['isSub'] == true) {
            return _empty(
              Icons.account_tree_outlined,
              tx('Siz bir alt bayisiniz.'),
              tx('Alt bayilerin kendi altında bayi bulunmaz.'),
            );
          }

          final list = listOf(subsData['subs']);
          if (list.isEmpty) {
            return _empty(
              Icons.account_tree_outlined,
              tx('Henüz alt bayin yok.'),
              tx('Alt bayi tanımlaması yönetim tarafından yapılır.'),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => reload(),
            child: ListView.separated(
              padding: const EdgeInsets.all(14),
              itemCount: list.length + 1,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                if (i == 0) return _stock(balance);
                final s = list[i - 1];
                final active = s['active'] != false;
                return Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: _card, borderRadius: BorderRadius.circular(14), border: Border.all(color: _line)),
                  child: Row(children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(shape: BoxShape.circle, color: _dark, border: Border.all(color: _gold.withValues(alpha: 0.6))),
                      child: const Icon(Icons.storefront, color: _goldHi, size: 20),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(children: [
                          Flexible(child: Text('${s['name']}', overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 15))),
                          if (!active) ...[
                            const SizedBox(width: 6),
                            Text(tx('kapalı'), style: const TextStyle(color: Colors.redAccent, fontSize: 11.5)),
                          ],
                        ]),
                        const SizedBox(height: 2),
                        Text([
                          '🪙 ${fmtNumber('${s['coinBalance'] ?? '0'}')}',
                          '${tx('Satış')}: ${fmtNumber('${s['soldCoins'] ?? '0'}')}',
                          if ('${s['owner'] ?? ''}'.isNotEmpty) '@${s['owner']}',
                        ].join(' · '), style: const TextStyle(color: Colors.white54, fontSize: 12)),
                      ]),
                    ),
                    const SizedBox(width: 8),
                    // Kapalı bayiye aktarım sunucuda da reddedilir; düğmeyi hiç açmıyoruz.
                    IconButton(
                      tooltip: tx('Coin aktar'),
                      onPressed: active ? () => _transfer(s, balance) : null,
                      icon: const Icon(Icons.swap_horiz, color: _goldHi),
                    ),
                  ]),
                );
              },
            ),
          );
        },
      ),
    );
  }

  Widget _stock(String balance) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: _card, borderRadius: BorderRadius.circular(16), border: Border.all(color: _line)),
        child: Row(children: [
          const Icon(Icons.inventory_2_outlined, color: _goldHi),
          const SizedBox(width: 10),
          Expanded(child: Text(tx('Aktarılabilir stoğun'), style: const TextStyle(color: Colors.white70))),
          Text('🪙 ${fmtNumber(balance)}', style: const TextStyle(color: _goldHi, fontWeight: FontWeight.w900, fontSize: 16)),
        ]),
      );

  Widget _empty(IconData icon, String title, String note) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, color: Colors.white24, size: 54),
            const SizedBox(height: 12),
            Text(title, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w800)),
            const SizedBox(height: 6),
            Text(note, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white38, fontSize: 12.5)),
          ]),
        ),
      );
}
