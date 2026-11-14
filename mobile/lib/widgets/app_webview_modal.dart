import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../services/api.dart';
import '../services/session.dart';
import '../version.dart';
import 'app_theme.dart';

/// Kendi sunucumuzdaki bir H5 sayfasını uygulama içinde gösteren genel pencere.
///
/// Güvenlik kuralları (herkes için aynı, istisna yok):
///  * Yalnızca [Api.baseUrl] ile aynı kaynağa (şema + sunucu + kapı) gidilir; başka adrese yönlendirme engellenir.
///  * Oturum bileti adrese yazılmaz: ilk istekte `Authorization` başlığıyla gider; sayfanın kendi API çağrıları için
///    sayfa `TRLive` kanalından {"type":"getToken"} ister ve token yalnızca aynı kaynaktaki sayfaya verilir.
///  * Kanal mesajları yalnızca sayfa aynı kaynaktayken dinlenir.
///
/// Sayfanın kullanabileceği kanal mesajları (JSON):
///  {"type":"getToken"}        → uygulama `window.TRLiveAuth.set(token)` çağırır
///  {"type":"refreshBalance"}  → bakiye yenilenir ([onRefreshBalance] ve oturum)
///  {"type":"close"}           → pencere kapanır
class AppWebViewModal extends StatefulWidget {
  final String url;
  final String title;

  /// Sayfa bakiyenin değiştiğini bildirdiğinde (ve pencere kapanırken) çağrılır.
  final Future<void> Function()? onRefreshBalance;

  const AppWebViewModal({super.key, required this.url, required this.title, this.onRefreshBalance});

  @override
  State<AppWebViewModal> createState() => _AppWebViewModalState();
}

class _AppWebViewModalState extends State<AppWebViewModal> {
  late final WebViewController _controller;
  final ValueNotifier<int> _progress = ValueNotifier<int>(0);
  late final Uri _base = Uri.parse(Api.baseUrl);
  bool _trusted = false; // şu an gösterilen sayfa bizim sunucumuzdan mı
  bool _failed = false;
  bool _pageUsed = false; // sayfa oturum bileti istedi (içeride işlem yapılmış olabilir)

  bool _sameOrigin(String url) {
    final u = Uri.tryParse(url);
    if (u == null) return false;
    return u.scheme == _base.scheme && u.host == _base.host && u.port == _base.port;
  }

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Pal.bg)
      ..addJavaScriptChannel('TRLive', onMessageReceived: _onMessage)
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (r) => _sameOrigin(r.url) ? NavigationDecision.navigate : NavigationDecision.prevent,
        onPageStarted: (url) {
          _trusted = _sameOrigin(url);
          if (mounted) setState(() => _failed = false);
        },
        onUrlChange: (c) => _trusted = c.url != null && _sameOrigin(c.url!),
        onProgress: (p) => _progress.value = p,
        onPageFinished: (_) => _progress.value = 100,
        onWebResourceError: (e) {
          if (e.isForMainFrame ?? true) {
            _progress.value = 100;
            if (mounted) setState(() => _failed = true);
          }
        },
      ));
    _load();
  }

  Future<void> _load() async {
    if (!_sameOrigin(widget.url)) {
      if (mounted) setState(() => _failed = true);
      return;
    }
    if (mounted) setState(() => _failed = false);
    _progress.value = 0;
    try {
      await Api.ensureFreshToken();
    } catch (_) {/* ağ hatasında eldeki token ile denenir */}
    await _controller.loadRequest(
      Uri.parse(widget.url),
      headers: {
        'X-App-Version': kAppVersion,
        if (Api.token != null) 'Authorization': 'Bearer ${Api.token}',
      },
    );
  }

  Future<void> _onMessage(JavaScriptMessage m) async {
    if (!_trusted) return;
    String type;
    try {
      final d = jsonDecode(m.message);
      type = d is Map ? (d['type'] ?? '').toString() : m.message;
    } catch (_) {
      type = m.message;
    }
    switch (type) {
      case 'getToken':
        await _sendToken();
      case 'refreshBalance':
        await _refreshBalance();
      case 'close':
        if (mounted) Navigator.of(context).maybePop();
    }
  }

  Future<void> _sendToken() async {
    try {
      await Api.ensureFreshToken();
    } catch (_) {}
    final t = Api.token;
    if (t == null || !_trusted || !mounted) return;
    // jsonEncode metni güvenle tırnaklar (JWT zaten yalnızca güvenli karakterler içerir).
    _pageUsed = true;
    await _controller.runJavaScript('window.TRLiveAuth&&window.TRLiveAuth.set(${jsonEncode(t)});');
  }

  Future<void> _refreshBalance() async {
    try {
      await Session.refresh();
      await widget.onRefreshBalance?.call();
    } catch (_) {/* bakiye bir sonraki ekran yenilemesinde güncellenir */}
  }

  @override
  void dispose() {
    _progress.dispose();
    // Sayfa açıldıysa içeride coin harcanmış olabilir: kapanırken bakiye bir kez yenilenir.
    if (_pageUsed) _refreshBalance();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      const SizedBox(height: 8),
      Container(width: 38, height: 4, decoration: BoxDecoration(color: Pal.outline, borderRadius: BorderRadius.circular(2))),
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 6, 0),
        child: Row(children: [
          Expanded(child: Text(widget.title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Pal.text))),
          IconButton(
            tooltip: 'Yenile',
            icon: const Icon(Icons.refresh, size: 20, color: Pal.textDim),
            onPressed: _load,
          ),
          IconButton(
            tooltip: 'Kapat',
            icon: const Icon(Icons.close, size: 22, color: Pal.text),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ]),
      ),
      ValueListenableBuilder<int>(
        valueListenable: _progress,
        builder: (_, p, __) => SizedBox(
          height: 2,
          child: p >= 100
              ? null
              : LinearProgressIndicator(value: p <= 0 ? null : p / 100, minHeight: 2, backgroundColor: Pal.surface, color: Pal.cyan),
        ),
      ),
      Expanded(
        child: _failed
            ? Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.wifi_off, size: 34, color: Pal.textDim),
                  const SizedBox(height: 8),
                  const Text('Sayfa yüklenemedi.', style: TextStyle(color: Pal.textDim)),
                  const SizedBox(height: 10),
                  FilledButton(onPressed: _load, child: const Text('Tekrar dene')),
                ]),
              )
            : WebViewWidget(controller: _controller),
      ),
    ]);
  }
}

/// Alt pencere olarak açar: ekranın alt %[heightFactor]'ini kaplar, koyu tema uyumludur. Arkadaki ekran (ör. canlı oda)
/// ve ses bağlantısı olduğu gibi çalışmaya devam eder; yalnızca pencere kapanır.
Future<void> showAppWebViewSheet(
  BuildContext context, {
  required String url,
  required String title,
  Future<void> Function()? onRefreshBalance,
  double heightFactor = 0.55,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    enableDrag: false, // sayfanın kendi kaydırmasıyla çakışmasın; kapatma düğmesi var
    backgroundColor: Colors.transparent,
    builder: (sheet) => Container(
      height: MediaQuery.sizeOf(sheet).height * heightFactor,
      decoration: const BoxDecoration(
        color: Pal.bg,
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        border: Border(top: BorderSide(color: Pal.outline)),
      ),
      clipBehavior: Clip.antiAlias,
      child: AppWebViewModal(url: url, title: title, onRefreshBalance: onRefreshBalance),
    ),
  );
}
