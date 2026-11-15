import 'dart:async';
import 'package:flutter/material.dart';
import '../l10n/l10n.dart';
import '../services/socket_service.dart';
import 'app_theme.dart';

/// Canlı bağlantı (WebSocket) birkaç saniyedir kopuksa küçük "Bağlantı yenileniyor…" bilgisi. Kısa kopmalarda
/// (1-2 sn) hiç görünmez; bağlantı gelince kendiliğinden kalkar. Kullanıcı odanın neden güncellenmediğini bilir.
class ReconnectPill extends StatefulWidget {
  const ReconnectPill({super.key});

  @override
  State<ReconnectPill> createState() => _ReconnectPillState();
}

class _ReconnectPillState extends State<ReconnectPill> {
  Timer? _t;
  bool _show = false;

  @override
  void initState() {
    super.initState();
    SocketService.instance.connected.addListener(_changed);
    _changed();
  }

  void _changed() {
    final ok = SocketService.instance.connected.value;
    _t?.cancel();
    _t = null;
    if (ok) {
      if (_show && mounted) setState(() => _show = false);
      return;
    }
    _t = Timer(const Duration(seconds: 4), () {
      if (mounted && !SocketService.instance.connected.value) setState(() => _show = true);
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    SocketService.instance.connected.removeListener(_changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_show) return const SizedBox.shrink();
    return IgnorePointer(
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: Pal.bg.withValues(alpha: 0.88),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Pal.amber.withValues(alpha: 0.6)),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: Pal.amber)),
            const SizedBox(width: 8),
            Text(tx('Bağlantı yenileniyor…'), style: const TextStyle(color: Pal.text, fontSize: 12.5, fontWeight: FontWeight.w600)),
          ]),
        ),
      ),
    );
  }
}
