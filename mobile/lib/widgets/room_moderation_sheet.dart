import 'package:flutter/material.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import 'app_theme.dart';
import 'common.dart';

/// Yönetici kayıtları (oda sahibi ve yardımcı sahip): bu odada süren yasaklar ve yöneticilerin son işlemleri
/// (atma, banlama, yasak kaldırma, susturma, mikrofondan indirme, rol). Atılan kişi 24 saat odaya giremez;
/// yasak buradan kaldırılır. Kayıtlar kalıcı odaya aittir: oda kapatılıp yeniden açılsa da görünür.
Future<void> showRoomModeration(BuildContext context, String roomId) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Pal.surface,
      builder: (_) => _ModerationSheet(roomId: roomId),
    );

class _ModerationSheet extends StatefulWidget {
  final String roomId;
  const _ModerationSheet({required this.roomId});

  @override
  State<_ModerationSheet> createState() => _ModerationSheetState();
}

class _LogInfo {
  final IconData icon;
  final Color color;
  final String label;
  const _LogInfo(this.icon, this.color, this.label);
}

class _ModerationSheetState extends State<_ModerationSheet> {
  Map<String, dynamic>? _data;
  String? _error;
  bool _loading = false;
  final Set<String> _busy = <String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (_loading) return;
    _loading = true;
    try {
      final d = await Api.get('/api/rooms/${widget.roomId}/moderation');
      if (!mounted) return;
      setState(() {
        _data = d;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      _loading = false;
    }
  }

  String _name(Map<String, dynamic>? u) => (u?['displayName'] ?? tx('Kullanıcı')).toString();

  Future<void> _unban(String userId, String name) async {
    if (_busy.contains(userId)) return;
    final ok = await confirm(context, tx('{name} için yasak kaldırılsın mı? Odaya yeniden girebilir.', {'name': name}), action: tx('Yasağı kaldır'));
    if (!ok || !mounted) return;
    setState(() => _busy.add(userId));
    final r = await guard(context, () => Api.delete('/api/rooms/${widget.roomId}/blocks/$userId'));
    if (!mounted) return;
    setState(() => _busy.remove(userId));
    if (r == null) return;
    toast(context, tx('Yasak kaldırıldı.'));
    await _load();
  }

  static String _two(int v) => v < 10 ? '0$v' : '$v';

  String _when(Object? iso) {
    final d = DateTime.tryParse('${iso ?? ''}')?.toLocal();
    if (d == null) return '';
    return '${_two(d.day)}.${_two(d.month)} ${_two(d.hour)}:${_two(d.minute)}';
  }

  /// Yasağın durumu: süresiz ban ya da kalan süre.
  String _banLine(Map<String, dynamic> b) {
    final until = DateTime.tryParse('${b['until'] ?? ''}');
    if (until == null) return tx('Banlandı · süresiz');
    final left = until.difference(DateTime.now());
    final m = left.inMinutes < 1 ? 1 : left.inMinutes;
    final h = m ~/ 60;
    return h > 0 ? tx('Atıldı · {h} sa {m} dk kaldı', {'h': h, 'm': m % 60}) : tx('Atıldı · {m} dk kaldı', {'m': m});
  }

  _LogInfo _info(Map<String, dynamic> l) {
    final d = mapOf(l['detail']) ?? const <String, dynamic>{};
    switch ('${l['action']}') {
      case 'kick':
        return _LogInfo(Icons.exit_to_app, Pal.orange, tx('Odadan atıldı ({h} saat)', {'h': d['hours'] ?? 24}));
      case 'block':
        return _LogInfo(Icons.block, Pal.red, tx('Odadan banlandı (süresiz)'));
      case 'unban':
        return _LogInfo(Icons.lock_open, Pal.green, tx('Yasak kaldırıldı'));
      case 'mute':
        return _LogInfo(Icons.comments_disabled, Pal.amber, tx('Sohbette susturuldu ({m} dk)', {'m': d['minutes'] ?? 0}));
      case 'unmute':
        return _LogInfo(Icons.chat_bubble_outline, Pal.green, tx('Susturma kaldırıldı'));
      case 'mic_off':
        return _LogInfo(Icons.mic_off, Pal.amber, tx('Mikrofondan indirildi'));
      case 'role':
        final r = '${d['role']}';
        final label = r == 'moderator' ? tx('Moderatör') : (r == 'cohost' ? tx('Yardımcı sahip') : tx('Üye'));
        return _LogInfo(Icons.manage_accounts, Pal.cyan, tx('Rol: {r}', {'r': label}));
      default:
        return _LogInfo(Icons.info_outline, Pal.textDim, '${l['action']}');
    }
  }

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.only(top: Gap.s, bottom: Gap.s),
        child: Text(title, style: const TextStyle(color: Pal.cyan, fontSize: 13.5, fontWeight: FontWeight.w800)),
      );

  Widget _empty(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: Gap.m),
        child: Text(text, style: const TextStyle(color: Pal.textDim, fontSize: 13)),
      );

  Widget _unbanButton(String userId, String name) => _busy.contains(userId)
      ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
      : OutlinedButton(
          style: OutlinedButton.styleFrom(
            foregroundColor: Pal.cyan,
            side: const BorderSide(color: Pal.cyan),
            padding: const EdgeInsets.symmetric(horizontal: 10),
            visualDensity: VisualDensity.compact,
          ),
          onPressed: () => _unban(userId, name),
          child: Text(tx('Yasağı kaldır'), style: const TextStyle(fontSize: 12.5)),
        );

  Widget _banTile(Map<String, dynamic> b) {
    final u = mapOf(b['user']);
    final by = mapOf(b['by']);
    return Container(
      margin: const EdgeInsets.only(bottom: Gap.s),
      padding: const EdgeInsets.all(Gap.s),
      decoration: BoxDecoration(color: Pal.surfaceHi, borderRadius: BorderRadius.circular(Rad.md), border: Border.all(color: Pal.outline, width: 0.8)),
      child: Row(children: [
        UserAvatar(user: u, radius: 20),
        const SizedBox(width: Gap.s),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_name(u), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.text, fontWeight: FontWeight.w700)),
            const SizedBox(height: 2),
            Text(_banLine(b), style: TextStyle(color: b['until'] == null ? Pal.red : Pal.amber, fontSize: 12.5)),
            if (by != null)
              Text(tx('İşlemi yapan: {a}', {'a': _name(by)}), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.textDim, fontSize: 11.5)),
          ]),
        ),
        const SizedBox(width: Gap.s),
        _unbanButton('${b['userId']}', _name(u)),
      ]),
    );
  }

  Widget _logTile(Map<String, dynamic> l) {
    final info = _info(l);
    final target = mapOf(l['target']);
    final actor = mapOf(l['actor']);
    final targetId = l['targetId']?.toString() ?? '';
    final action = '${l['action']}';
    // Yasağı süren kişinin atılma / banlanma satırında da "Yasağı kaldır" çıkar.
    final canUnban = l['banned'] == true && targetId.isNotEmpty && (action == 'kick' || action == 'block');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 34,
          height: 34,
          decoration: BoxDecoration(color: info.color.withValues(alpha: 0.16), shape: BoxShape.circle),
          child: Icon(info.icon, size: 18, color: info.color),
        ),
        const SizedBox(width: Gap.s),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_name(target), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Pal.text, fontWeight: FontWeight.w700, fontSize: 13.5)),
            Text(info.label, style: TextStyle(color: info.color, fontSize: 12.5)),
            Text(
              '${tx('İşlemi yapan: {a}', {'a': _name(actor)})} · ${_when(l['createdAt'])}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Pal.textDim, fontSize: 11.5),
            ),
          ]),
        ),
        if (canUnban) ...[const SizedBox(width: Gap.s), _unbanButton(targetId, _name(target))],
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    Widget body;
    if (data == null) {
      body = Padding(
        padding: const EdgeInsets.all(Gap.xl),
        child: _error == null
            ? const Center(child: CircularProgressIndicator())
            : Column(mainAxisSize: MainAxisSize.min, children: [
                Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim)),
                const SizedBox(height: Gap.m),
                FilledButton(
                  onPressed: () {
                    setState(() => _error = null);
                    _load();
                  },
                  child: Text(tx('Tekrar dene')),
                ),
              ]),
      );
    } else {
      final bans = listOf(data['bans']);
      final logs = listOf(data['logs']);
      body = ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(Gap.l, 0, Gap.l, Gap.l),
        children: [
          Text(
            tx('Odadan atılan kişi {h} saat giremez. Yasağı buradan kaldırabilirsin.', {'h': data['kickHours'] ?? 24}),
            style: const TextStyle(color: Pal.textDim, fontSize: 12.5, height: 1.35),
          ),
          _section(tx('Yasaklılar ({n})', {'n': bans.length})),
          if (bans.isEmpty) _empty(tx('Yasaklı kimse yok.')),
          for (final b in bans) _banTile(b),
          _section(tx('Son işlemler')),
          if (logs.isEmpty) _empty(tx('Henüz işlem yok.')),
          for (final l in logs) _logTile(l),
        ],
      );
    }
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(context).height * 0.78),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(Gap.l, 0, Gap.s, Gap.s),
            child: Row(children: [
              const Icon(Icons.fact_check_outlined, color: Pal.cyan),
              const SizedBox(width: Gap.s),
              Expanded(child: Text(tx('Yönetici kayıtları'), style: const TextStyle(color: Pal.text, fontSize: 17, fontWeight: FontWeight.w800))),
              IconButton(tooltip: tx('Yenile'), onPressed: _load, icon: const Icon(Icons.refresh, color: Pal.textDim)),
            ]),
          ),
          Flexible(child: body),
        ]),
      ),
    );
  }
}
