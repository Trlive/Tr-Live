import 'package:flutter/material.dart';
import '../../../services/api.dart';
import '../../../widgets/app_theme.dart';
import '../resolver/sdui_action.dart';
import '../schema/sdui_schema.dart';

/// Sunucudan gelen bölümleri çizer.
///
/// Çizim uygulamanın kendi bileşenleriyle yapılır: sunucu **ne gösterileceğini** söyler,
/// **nasıl görüneceğini** değil. Renk, yazı tipi ve ölçüler koddan gelir; böylece sunucudan
/// gelen bir düzen uygulamanın görünümünü bozamaz ve marka tutarlılığı korunur.
///
/// Bilinmeyen bölüm türü şemada zaten elenmiş olur; buraya gelmez.
class SduiSections extends StatelessWidget {
  const SduiSections({super.key, required this.sections, this.onTab});

  final List<SduiSection> sections;
  final void Function(String target)? onTab;

  @override
  Widget build(BuildContext context) {
    if (sections.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [for (final s in sections) _section(context, s)],
    );
  }

  Widget _section(BuildContext context, SduiSection s) => switch (s.type) {
        'notice' => _Notice(section: s, onTab: onTab),
        'banner' => _Banner(section: s, onTab: onTab),
        'cards' => _Cards(section: s, onTab: onTab),
        _ => const SizedBox.shrink(),
      };
}

void _go(BuildContext context, SduiAction a, void Function(String)? onTab) {
  SduiActionResolver.run(context, a, onTab: onTab);
}

class _Notice extends StatelessWidget {
  const _Notice({required this.section, this.onTab});
  final SduiSection section;
  final void Function(String)? onTab;

  @override
  Widget build(BuildContext context) {
    if (section.text.isEmpty && section.title.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: section.action.type == 'noop' ? null : () => _go(context, section.action, onTab),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Pal.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Pal.outline, width: 0.8),
          ),
          child: Row(children: [
            const Icon(Icons.campaign_outlined, size: 20, color: Pal.cyan),
            const SizedBox(width: 10),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (section.title.isNotEmpty)
                  Text(section.title, style: const TextStyle(fontWeight: FontWeight.w600, color: Pal.text)),
                if (section.text.isNotEmpty)
                  Text(section.text, style: const TextStyle(fontSize: 13, color: Pal.textDim)),
              ]),
            ),
            if (section.action.type != 'noop') const Icon(Icons.chevron_right, color: Pal.textDim),
          ]),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.section, this.onTab});
  final SduiSection section;
  final void Function(String)? onTab;

  @override
  Widget build(BuildContext context) {
    final items = section.items;
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
      child: SizedBox(
        height: 104,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: items.length,
          separatorBuilder: (_, __) => const SizedBox(width: 10),
          itemBuilder: (_, i) {
            final it = items[i];
            final url = Api.absoluteUrl(it.image);
            return InkWell(
              borderRadius: BorderRadius.circular(14),
              onTap: () => _go(context, it.action, onTab),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: SizedBox(
                  width: 280,
                  child: Stack(fit: StackFit.expand, children: [
                    if (url != null && url.isNotEmpty)
                      // Görsel inmezse kutu boş kalır, düzen bozulmaz.
                      Image.network(url, fit: BoxFit.cover, errorBuilder: (_, __, ___) => Container(color: Pal.surface))
                    else
                      Container(color: Pal.surface),
                    if (it.title.isNotEmpty)
                      Align(
                        alignment: Alignment.bottomLeft,
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.fromLTRB(12, 16, 12, 10),
                          decoration: const BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [Colors.transparent, Colors.black87],
                            ),
                          ),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                            Text(it.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                            if (it.subtitle.isNotEmpty)
                              Text(it.subtitle, maxLines: 1, overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(color: Colors.white70, fontSize: 12)),
                          ]),
                        ),
                      ),
                  ]),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Cards extends StatelessWidget {
  const _Cards({required this.section, this.onTab});
  final SduiSection section;
  final void Function(String)? onTab;

  @override
  Widget build(BuildContext context) {
    final items = section.items;
    if (items.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (section.title.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8, left: 2),
            child: Text(section.title, style: const TextStyle(fontWeight: FontWeight.w700, color: Pal.text)),
          ),
        Wrap(spacing: 10, runSpacing: 10, children: [
          for (final it in items)
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => _go(context, it.action, onTab),
              child: Container(
                width: 104,
                padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 6),
                decoration: BoxDecoration(
                  color: Pal.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Pal.outline, width: 0.8),
                ),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  _CardIcon(item: it),
                  const SizedBox(height: 6),
                  Text(it.title, maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 12, color: Pal.text)),
                ]),
              ),
            ),
        ]),
      ]),
    );
  }
}

class _CardIcon extends StatelessWidget {
  const _CardIcon({required this.item});
  final SduiItem item;

  @override
  Widget build(BuildContext context) {
    final url = Api.absoluteUrl(item.image);
    if (url != null && url.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Image.network(url, width: 36, height: 36, fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => const Icon(Icons.circle_outlined, size: 28, color: Pal.cyan)),
      );
    }
    return Icon(SduiActionResolver.icon(null), size: 28, color: Pal.cyan);
  }
}
