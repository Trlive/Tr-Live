import 'package:flutter/material.dart';
import '../../../../widgets/net_image.dart';
import '../registry/action_registry.dart';
import '../registry/source_registry.dart';
import '../schema/sdui_node.dart';

/// SDUI v2 çizicisi: bileşen ağacını Flutter widget'larına çevirir.
///
/// ## Tanımadığı türü ATLAR, çökmez
///
/// Sunucuya yarın yeni bir bileşen eklenirse, bugünkü APK onu görmezden gelir. Sunucu zaten
/// uygulama sürümüne göre süzerek gönderiyor; buradaki atlama ikinci kat koruma. Tek kat
/// yeterli olsaydı, yanlış bir `minApp` kaydı eski telefonlarda boş ekran demek olurdu.
///
/// ## Form durumu çizicide tutulur
///
/// Form alanlarının değerleri [SduiFormScope] içinde toplanır ve `api` eylemi çalıştığında
/// gövdeye konur. Değerleri sunucuya gönderen taraf doğrulamaz — DOĞRULAMA SUNUCUDADIR.
/// Buradaki `required`/`maxLength` yalnızca kullanıcıya anında uyarı gösterir.
class SduiRenderer extends StatefulWidget {
  final SduiNode root;
  final VoidCallback? onRefresh;
  final void Function(String target)? onTab;

  const SduiRenderer({super.key, required this.root, this.onRefresh, this.onTab});

  @override
  State<SduiRenderer> createState() => _SduiRendererState();
}

class _SduiRendererState extends State<SduiRenderer> {
  final Map<String, dynamic> _form = {};
  /// Çekilmiş veri kaynakları. Aynı kaynak bir ekranda iki kez kullanılsa bile tek çağrı.
  final Map<String, Future<List<Map<String, dynamic>>>> _sources = {};

  Future<List<Map<String, dynamic>>> _source(String name) =>
      _sources.putIfAbsent(name, () => SduiSources.load(name));

  /// Şablon düğümünü bir öğeye bağlar: metin alanlarındaki {alan} yerine değer konur.
  /// Eylemlerdeki `arg` de bağlanır — "bu öğeyi aç" ancak böyle yazılabilir.
  SduiNode _bind(SduiNode n, Map<String, dynamic> item) {
    final props = <String, dynamic>{};
    for (final e in n.props.entries) {
      final v = e.value;
      if (v is String) {
        props[e.key] = bindText(v, item);
      } else if (v is Map && v['arg'] is String) {
        props[e.key] = {...v, 'arg': bindText(v['arg'] as String, item)};
      } else {
        props[e.key] = v;
      }
    }
    return SduiNode(
      type: n.type,
      id: n.id,
      props: props,
      children: [for (final k in n.children) _bind(k, item)],
    );
  }

  @override
  Widget build(BuildContext context) => _build(context, widget.root) ?? const SizedBox.shrink();

  void _run(Map<String, dynamic>? action) {
    SduiActions.run(context, action, onRefresh: widget.onRefresh, onTab: widget.onTab, formData: Map.of(_form));
  }

  List<Widget> _kids(BuildContext c, SduiNode n) =>
      [for (final k in n.children) ?_build(c, k)];

  Widget? _build(BuildContext c, SduiNode n) {
    switch (n.type) {
      // ---- Yerleşim ----
      case 'column':
        return Padding(
          padding: EdgeInsets.all((n.intOf('padding') ?? 0).toDouble()),
          child: Column(
            crossAxisAlignment: _cross(n.str('align')),
            mainAxisSize: MainAxisSize.min,
            children: _gap(_kids(c, n), n.intOf('gap') ?? 0, false),
          ),
        );
      case 'row':
        // Çocuklar BİR KEZ çizilir: ilk sürümde sarmalı (wrap) dalında _kids yeniden
        // çağrılıyordu, yani her satır iki kez inşa ediliyordu.
        final kids = _kids(c, n);
        return Padding(
          padding: EdgeInsets.all((n.intOf('padding') ?? 0).toDouble()),
          child: n.boolOf('wrap')
              ? Wrap(spacing: (n.intOf('gap') ?? 0).toDouble(), runSpacing: 6, children: kids)
              : Row(crossAxisAlignment: _crossRow(n.str('align')), children: _gap(kids, n.intOf('gap') ?? 0, true)),
        );
      case 'grid':
        final cols = (n.intOf('columns') ?? 2).clamp(1, 6);
        return Padding(
          padding: EdgeInsets.all((n.intOf('padding') ?? 0).toDouble()),
          child: GridView.count(
            crossAxisCount: cols,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            mainAxisSpacing: (n.intOf('gap') ?? 8).toDouble(),
            crossAxisSpacing: (n.intOf('gap') ?? 8).toDouble(),
            children: _kids(c, n),
          ),
        );
      case 'scroll':
        return SingleChildScrollView(
          padding: EdgeInsets.all((n.intOf('padding') ?? 0).toDouble()),
          child: Column(mainAxisSize: MainAxisSize.min, children: _kids(c, n)),
        );
      case 'container':
        return Container(
          padding: EdgeInsets.all((n.intOf('padding') ?? 12).toDouble()),
          decoration: BoxDecoration(
            color: SduiActions.tone(n.str('tone'), fallback: const Color(0x14FFFFFF)).withValues(alpha: 0.10),
            borderRadius: BorderRadius.circular((n.intOf('radius') ?? 12).toDouble()),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: _kids(c, n)),
        );
      case 'divider':
        return Padding(
          padding: EdgeInsets.symmetric(vertical: (n.intOf('padding') ?? 6).toDouble()),
          child: const Divider(height: 1, color: Color(0x1FFFFFFF)),
        );

      // ---- Bölüm ----
      case 'title':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(n.str('text') ?? '', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: SduiActions.tone(n.str('tone')))),
            if (n.str('subtitle') != null)
              Text(n.str('subtitle')!, style: const TextStyle(fontSize: 13, color: Color(0x99FFFFFF))),
          ]),
        );
      case 'banner':
        final img = n.str('image');
        return InkWell(
          onTap: actionOf(n) == null ? null : () => _run(actionOf(n)),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: SizedBox(
              height: (n.intOf('height') ?? 120).toDouble(),
              width: double.infinity,
              child: img == null
                  ? Container(color: const Color(0x14FFFFFF), alignment: Alignment.center, child: Text(n.str('text') ?? ''))
                  : NetImg(img, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: const Color(0x14FFFFFF))),
            ),
          ),
        );
      case 'card':
        return InkWell(
          onTap: actionOf(n) == null ? null : () => _run(actionOf(n)),
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: const Color(0x14FFFFFF), borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              if (n.str('image') != null)
                ClipRRect(borderRadius: BorderRadius.circular(8), child: NetImg(n.str('image')!, height: 120, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink())),
              if (n.str('title') != null)
                Text(n.str('title')!, style: TextStyle(fontWeight: FontWeight.w700, color: SduiActions.tone(n.str('tone')))),
              if (n.str('subtitle') != null)
                Text(n.str('subtitle')!, style: const TextStyle(fontSize: 13, color: Color(0x99FFFFFF))),
              ..._kids(c, n),
            ]),
          ),
        );
      case 'notice':
        return Container(
          margin: const EdgeInsets.symmetric(vertical: 4),
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: SduiActions.tone(n.str('tone'), fallback: const Color(0xFF7DD3FC)).withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: InkWell(
            onTap: actionOf(n) == null ? null : () => _run(actionOf(n)),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(SduiActions.icon(n.str('icon'), fallback: Icons.info_outline), size: 18, color: SduiActions.tone(n.str('tone'))),
              const SizedBox(width: 8),
              Expanded(child: Text(n.str('text') ?? '', style: const TextStyle(fontSize: 13.5, height: 1.35))),
            ]),
          ),
        );

      // ---- Liste ----
      case 'list':
        return Column(mainAxisSize: MainAxisSize.min, children: _gap(_kids(c, n), n.intOf('gap') ?? 0, false));
      case 'listItem':
        return ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: n.str('image') != null
              ? ClipOval(child: NetImg(n.str('image')!, width: 36, height: 36, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(width: 36, height: 36)))
              : Icon(SduiActions.icon(n.str('icon')), color: SduiActions.tone(n.str('tone'))),
          title: Text(n.str('title') ?? '', style: const TextStyle(fontSize: 14.5)),
          subtitle: n.str('subtitle') == null ? null : Text(n.str('subtitle')!, style: const TextStyle(fontSize: 12.5, color: Color(0x99FFFFFF))),
          trailing: n.str('badge') == null
              ? (actionOf(n) == null ? null : const Icon(Icons.chevron_right, size: 18))
              : _badge(n.str('badge')!, n.str('tone')),
          onTap: actionOf(n) == null ? null : () => _run(actionOf(n)),
        );
      case 'badge':
        return _badge(n.str('text') ?? '', n.str('tone'));
      case 'emptyState':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 28),
          child: Column(children: [
            Icon(SduiActions.icon(n.str('icon'), fallback: Icons.inbox_outlined), size: 36, color: const Color(0x66FFFFFF)),
            const SizedBox(height: 8),
            Text(n.str('text') ?? '', style: const TextStyle(color: Color(0x99FFFFFF))),
          ]),
        );

      // ---- Detay ----
      case 'keyValue':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 5),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Text(n.str('label') ?? '', style: const TextStyle(fontSize: 13.5, color: Color(0x99FFFFFF)))),
            Text(n.str('value') ?? '', style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: SduiActions.tone(n.str('tone')))),
          ]),
        );
      case 'description':
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Text(n.str('text') ?? '', style: const TextStyle(fontSize: 14, height: 1.45)),
        );
      case 'image':
        final u = n.str('url');
        if (u == null) return null;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: ClipRRect(
            borderRadius: BorderRadius.circular((n.intOf('radius') ?? 10).toDouble()),
            child: NetImg(u, height: (n.intOf('height') ?? 160).toDouble(), fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
          ),
        );
      case 'status':
        return Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(SduiActions.icon(n.str('icon'), fallback: Icons.circle), size: 14, color: SduiActions.tone(n.str('tone'))),
          const SizedBox(width: 6),
          Text(n.str('text') ?? '', style: TextStyle(fontSize: 13, color: SduiActions.tone(n.str('tone')))),
        ]);

      // ---- Form ----
      case 'form':
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
          ..._kids(c, n),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: () => _submit(n),
            child: Text(n.str('submitLabel') ?? 'Gönder'),
          ),
        ]);
      case 'textInput':
        final name = n.str('name');
        if (name == null) return null;
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: TextField(
            maxLength: n.intOf('maxLength'),
            maxLines: n.boolOf('multiline') ? 4 : 1,
            decoration: InputDecoration(
              labelText: n.str('label'),
              helperText: n.str('hint'),
              counterText: '',
              border: const OutlineInputBorder(),
            ),
            onChanged: (v) => _form[name] = v,
          ),
        );
      case 'select':
        final name = n.str('name');
        if (name == null) return null;
        final options = n.listOf('options');
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: DropdownButtonFormField<String>(
            initialValue: _form[name] as String?,
            decoration: InputDecoration(labelText: n.str('label'), border: const OutlineInputBorder()),
            items: [
              for (final o in options)
                DropdownMenuItem(value: '${o['value'] ?? ''}', child: Text('${o['label'] ?? o['value'] ?? ''}')),
            ],
            onChanged: (v) => setState(() => _form[name] = v),
          ),
        );
      case 'checkbox':
        final name = n.str('name');
        if (name == null) return null;
        return CheckboxListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          value: _form[name] == true,
          title: Text(n.str('label') ?? '', style: const TextStyle(fontSize: 14)),
          onChanged: (v) => setState(() => _form[name] = v == true),
        );
      case 'toggle':
        final name = n.str('name');
        if (name == null) return null;
        return SwitchListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          value: _form[name] == true,
          title: Text(n.str('label') ?? '', style: const TextStyle(fontSize: 14)),
          subtitle: n.str('hint') == null ? null : Text(n.str('hint')!, style: const TextStyle(fontSize: 12)),
          onChanged: (v) => setState(() => _form[name] = v),
        );

      // ---- Veriye bağlı ----
      //
      // Çocuklar ŞABLONDUR: her öğe için {alan} değerleriyle yeniden bağlanır.
      // Veri gelmezse (hata, boş liste) emptyText gösterilir — boş ekran, bozuk ekrandan
      // ayırt edilemez; bu yüzden boş durum metni her zaman çizilir.
      case 'repeater':
        final src = n.str('source');
        if (src == null) return null;
        final max = (n.intOf('max') ?? 20).clamp(1, 100);
        return FutureBuilder<List<Map<String, dynamic>>>(
          future: _source(src),
          builder: (fc, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
            }
            final items = snap.data ?? const <Map<String, dynamic>>[];
            if (items.isEmpty) {
              return Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text(n.str('emptyText') ?? 'Burada henüz bir şey yok.',
                      style: const TextStyle(color: Color(0x99FFFFFF))),
                ),
              );
            }
            return Column(mainAxisSize: MainAxisSize.min, children: [
              for (final item in items.take(max))
                for (final k in n.children) ?_build(fc, _bind(k, item)),
            ]);
          },
        );
      case 'avatarRow':
        final asrc = n.str('source');
        if (asrc == null) return null;
        final amax = (n.intOf('max') ?? 8).clamp(1, 30);
        return FutureBuilder<List<Map<String, dynamic>>>(
          future: _source(asrc),
          builder: (fc, snap) {
            final items = (snap.data ?? const <Map<String, dynamic>>[]).take(amax).toList();
            if (items.isEmpty) return const SizedBox.shrink();
            return InkWell(
              onTap: actionOf(n) == null ? null : () => _run(actionOf(n)),
              child: SizedBox(
                height: 34,
                child: Stack(children: [
                  for (var i = 0; i < items.length; i++)
                    Positioned(
                      left: i * 22.0,
                      child: Container(
                        width: 32,
                        height: 32,
                        decoration: const BoxDecoration(shape: BoxShape.circle, color: Color(0xFF1A1A1E)),
                        padding: const EdgeInsets.all(1.5),
                        child: ClipOval(
                          child: NetImg('${items[i]['avatarUrl'] ?? ''}', fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Icon(Icons.person, size: 18, color: Color(0x66FFFFFF))),
                        ),
                      ),
                    ),
                ]),
              ),
            );
          },
        );

      // ---- Yerleşim mimarisi ----
      //
      // Sabit piksel yükseklik veren bir kart dar ekranda taşar, geniş ekranda sırıtır.
      // aspectRatio oranı korur; maxWidth geniş ekranda satırın okunamayacak kadar
      // uzamasını engeller. Sayfa düzeni her telefonda aynı görünsün diye bunlar var.
      case 'aspectRatio':
        final w = (n.intOf('w') ?? 16).clamp(1, 100);
        final hh = (n.intOf('h') ?? 9).clamp(1, 100);
        return AspectRatio(
          aspectRatio: w / hh,
          child: Stack(fit: StackFit.expand, children: _kids(c, n)),
        );
      case 'maxWidth':
        return Align(
          alignment: switch (n.str('align')) {
            'start' => Alignment.centerLeft,
            'end' => Alignment.centerRight,
            _ => Alignment.center,
          },
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: (n.intOf('width') ?? 560).toDouble()),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: _kids(c, n)),
          ),
        );
      case 'safeArea':
        return SafeArea(
          top: n.boolOf('top'),
          bottom: n.boolOf('bottom'),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: _kids(c, n)),
        );
      case 'spacer':
        return SizedBox(height: (n.intOf('size') ?? 12).toDouble());

      // ---- Vektörel ----
      //
      // Hepsi KOD İLE çizilir, görsel indirmez: her ekran yoğunluğunda keskin durur,
      // çevrimdışı da çizilir, rengini temadan alır.
      case 'icon':
        return Icon(
          SduiActions.icon(n.str('name')),
          size: (n.intOf('size') ?? 24).toDouble(),
          color: SduiActions.tone(n.str('tone')),
        );
      case 'shape':
        final sz = (n.intOf('size') ?? 24).toDouble();
        return SizedBox(
          width: n.str('kind') == 'line' ? double.infinity : sz,
          height: n.str('kind') == 'line' ? (n.intOf('thickness') ?? 2).toDouble() : sz,
          child: CustomPaint(
            painter: _ShapePainter(
              kind: n.str('kind') ?? 'circle',
              color: SduiActions.tone(n.str('tone'), fallback: const Color(0xFFD7B56D)),
              thickness: (n.intOf('thickness') ?? 3).toDouble(),
            ),
          ),
        );
      case 'progress':
        final v = ((n.intOf('value') ?? 0).clamp(0, 100)) / 100.0;
        final tone = SduiActions.tone(n.str('tone'), fallback: const Color(0xFFD7B56D));
        if (n.str('kind') == 'ring') {
          final sz = (n.intOf('size') ?? 56).toDouble();
          return SizedBox(
            width: sz,
            height: sz,
            child: Stack(alignment: Alignment.center, children: [
              CircularProgressIndicator(value: v, strokeWidth: 4, color: tone, backgroundColor: const Color(0x22FFFFFF)),
              if (n.str('label') != null)
                Text(n.str('label')!, style: TextStyle(fontSize: sz * 0.26, fontWeight: FontWeight.w800, color: tone)),
            ]),
          );
        }
        return Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          if (n.str('label') != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(n.str('label')!, style: const TextStyle(fontSize: 12, color: Color(0x99FFFFFF))),
            ),
          ClipRRect(
            borderRadius: BorderRadius.circular(6),
            child: LinearProgressIndicator(value: v, minHeight: 6, color: tone, backgroundColor: const Color(0x22FFFFFF)),
          ),
        ]);

      // ---- Durum ----
      case 'loading':
        return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
      case 'error':
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Text(n.str('text') ?? 'Bir sorun oluştu.', style: const TextStyle(color: Color(0xFFF87171))),
        );

      default:
        // Tanınmayan tür: ATLANIR. Eski bir APK, sonradan eklenmiş bir bileşenle
        // karşılaşınca çökmemeli; o parça olmadan devam eder.
        return null;
    }
  }

  /// Form gönderimi: zorunlu alanlar boşsa uyarı gösterilir ve istek ATILMAZ.
  ///
  /// Bu bir güvenlik denetimi DEĞİLDİR, kullanıcı rahatlığıdır: kuralları sunucudan gelen
  /// düzen söylüyor, veriyi de kullanıcı veriyor. Gerçek doğrulama, formu alan ucun kendisinde.
  void _submit(SduiNode form) {
    final missing = <String>[];
    void walk(SduiNode n) {
      final name = n.str('name');
      if (name != null && n.boolOf('required')) {
        final v = _form[name];
        if (v == null || (v is String && v.trim().isEmpty) || v == false) missing.add(n.str('label') ?? name);
      }
      for (final k in n.children) walk(k);
    }

    walk(form);
    if (missing.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Eksik alan: ${missing.join(', ')}')));
      return;
    }
    _run(actionOf(form));
  }

  static Widget _badge(String text, String? tone) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(
          color: SduiActions.tone(tone, fallback: const Color(0xFFD7B56D)).withValues(alpha: 0.18),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: SduiActions.tone(tone))),
      );

  static CrossAxisAlignment _cross(String? a) => switch (a) {
        'center' => CrossAxisAlignment.center,
        'end' => CrossAxisAlignment.end,
        'stretch' => CrossAxisAlignment.stretch,
        _ => CrossAxisAlignment.start,
      };

  static CrossAxisAlignment _crossRow(String? a) => switch (a) {
        'center' => CrossAxisAlignment.center,
        'end' => CrossAxisAlignment.end,
        _ => CrossAxisAlignment.start,
      };

  /// Çocuklar arasına boşluk koyar. Satırda yatay, sütunda dikey.
  static List<Widget> _gap(List<Widget> kids, int gap, bool horizontal) {
    if (gap <= 0 || kids.length < 2) return kids;
    final out = <Widget>[];
    for (var i = 0; i < kids.length; i++) {
      if (i > 0) out.add(horizontal ? SizedBox(width: gap.toDouble()) : SizedBox(height: gap.toDouble()));
      out.add(kids[i]);
    }
    return out;
  }
}


/// Vektörel süs çizimi: daire, halka, yuvarlatılmış kare, nokta, çizgi.
///
/// Görsel dosyası YERİNE kod. Üç sebeple: her ekran yoğunluğunda keskin durur (PNG 3x
/// ekranda bulanıklaşır), indirme beklemez (çevrimdışı da çizilir) ve rengini temadan alır.
class _ShapePainter extends CustomPainter {
  final String kind;
  final Color color;
  final double thickness;

  const _ShapePainter({required this.kind, required this.color, required this.thickness});

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = color..isAntiAlias = true;
    final r = Rect.fromLTWH(0, 0, size.width, size.height);
    switch (kind) {
      case 'ring':
        p
          ..style = PaintingStyle.stroke
          ..strokeWidth = thickness;
        canvas.drawCircle(r.center, (size.shortestSide - thickness) / 2, p);
      case 'rounded':
        canvas.drawRRect(RRect.fromRectAndRadius(r, Radius.circular(size.shortestSide * 0.28)), p);
      case 'dot':
        canvas.drawCircle(r.center, size.shortestSide * 0.22, p);
      case 'line':
        canvas.drawRRect(RRect.fromRectAndRadius(r, Radius.circular(size.height / 2)), p);
      default:
        canvas.drawCircle(r.center, size.shortestSide / 2, p);
    }
  }

  @override
  bool shouldRepaint(_ShapePainter old) =>
      old.kind != kind || old.color != color || old.thickness != thickness;
}
