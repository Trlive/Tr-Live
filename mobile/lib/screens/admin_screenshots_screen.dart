import 'package:flutter/material.dart';
import '../services/api.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';

const _screenLabels = {
  'room': 'Oda',
  'profile': 'Profil',
  'chat': 'Özel mesaj',
  'messages': 'Mesajlar',
  'feed': 'Akış',
  'home': 'Ana sayfa',
  'store': 'Mağaza',
  'other': 'Diğer',
};

/// Yönetim: uygulama içinde alınan ekran görüntüleri (kim, ne zaman, hangi ekranda, hangi oda / kişi).
/// Görüntünün kendisi tutulmaz. [userId] verilirse yalnızca o kişinin aldıkları, [targetUserId] verilirse o kişinin
/// profilinde / sohbetinde alınanlar listelenir. Kayıtlar 90 gün saklanır.
class AdminScreenshotsScreen extends StatefulWidget {
  final String? userId;
  final String? targetUserId;
  final String? title;
  const AdminScreenshotsScreen({super.key, this.userId, this.targetUserId, this.title});

  @override
  State<AdminScreenshotsScreen> createState() => _AdminScreenshotsScreenState();
}

class _AdminScreenshotsScreenState extends State<AdminScreenshotsScreen> {
  int _v = 0;
  String? _screen;

  String get _query {
    final q = <String>['limit=200'];
    if (widget.userId != null) q.add('userId=${widget.userId}');
    if (widget.targetUserId != null) q.add('targetUserId=${widget.targetUserId}');
    if (_screen != null) q.add('screen=$_screen');
    return q.join('&');
  }

  String _when(String? iso) {
    final d = DateTime.tryParse(iso ?? '')?.toLocal();
    if (d == null) return '';
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(d.day)}.${two(d.month)}.${d.year} ${two(d.hour)}:${two(d.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title ?? 'Ekran görüntüleri')),
      body: Column(children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: Row(children: [
            Padding(padding: const EdgeInsets.only(right: 8), child: ChoiceChip(label: const Text('Tümü'), selected: _screen == null, onSelected: (_) => setState(() => _screen = null))),
            for (final e in _screenLabels.entries)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(label: Text(e.value), selected: _screen == e.key, onSelected: (_) => setState(() => _screen = e.key)),
              ),
          ]),
        ),
        Expanded(
          child: FutureBuilder<Map<String, dynamic>>(
            key: ValueKey('$_v$_screen'),
            future: Api.get('/api/admin/screenshots?$_query'),
            builder: (context, snap) {
              if (snap.hasError) return Center(child: Text(errorText(snap.error!)));
              if (!snap.hasData) return const Center(child: CircularProgressIndicator());
              final items = [for (final x in (snap.data!['items'] as List? ?? const [])) Map<String, dynamic>.from(x as Map)];
              return RefreshIndicator(
                onRefresh: () async => setState(() => _v++),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
                  itemCount: items.length + 1,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    if (i == 0) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text('Son 24 saatte: ${fmtNumber(snap.data!['last24h'])} · Gösterilen: ${items.length}', style: const TextStyle(color: Pal.textDim)),
                      );
                    }
                    final x = items[i - 1];
                    final u = Map<String, dynamic>.from(x['user'] as Map? ?? const {});
                    final t = x['target'] is Map ? Map<String, dynamic>.from(x['target'] as Map) : null;
                    final r = x['room'] is Map ? Map<String, dynamic>.from(x['room'] as Map) : null;
                    final where = [
                      _screenLabels[x['screen']] ?? '${x['screen']}',
                      if (r != null) '"${r['name'] ?? ''}"${r['roomNumber'] != null ? ' (${r['roomNumber']})' : ''}',
                      if (t != null) '@${t['username']}',
                    ].join(' · ');
                    return ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                      leading: const Icon(Icons.screenshot_monitor, color: Pal.orange),
                      title: Text('${u['displayName'] ?? ''} (@${u['username'] ?? '?'})', maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text('$where\n${_when(x['createdAt']?.toString())}${x['appVersion'] != null ? ' · v${x['appVersion']}' : ''}'),
                      isThreeLine: true,
                    );
                  },
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}
