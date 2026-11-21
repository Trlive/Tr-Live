import '../hybrid/webview/navigation_policy.dart';
import '../hybrid/js_bridge/bridge_policy.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../l10n/l10n.dart';
import '../services/api.dart';
import '../services/session.dart';
import 'app_theme.dart';
import 'common.dart';

/// Yönetimin yapıştırdığı etkinlik bağlantısını açar (v2.124).
/// Sunucu bağlantıdaki yer tutucuları doldurur ({uid} {publicId} {name} {lang} {roomId} {token} …); oturum bileti
/// ASLA dış sayfaya verilmez (yalnızca o etkinliğe özel 2 saatlik oyun bileti).
/// Açılış biçimi: sheet = alt pencere (oda arkada sürer), full = tam ekran, browser = telefonun tarayıcısı.
Future<void> openActivity(BuildContext context, String id, {String? roomId}) async {
  final r = await guard(context, () => Api.post('/api/activities/$id/launch', {if (roomId != null) 'roomId': roomId, 'lang': L10n.lang.value}));
  if (r == null || !context.mounted) return;
  final url = '${r['url'] ?? ''}';
  final title = '${r['title'] ?? tx('Etkinlikler')}';
  final mode = '${r['openMode'] ?? 'sheet'}';
  final uri = Uri.tryParse(url);
  if (uri == null || !uri.hasScheme) return;
  if (mode == 'browser') {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
    return;
  }
  if (mode == 'full') {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => Scaffold(backgroundColor: Pal.bg, body: SafeArea(child: ExternalWebView(url: url, title: title, fullPage: true)))));
  } else {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Pal.bg,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (c) => SizedBox(height: MediaQuery.sizeOf(c).height * 0.78, child: ExternalWebView(url: url, title: title)),
    );
  }
  // Oyunda Coin kazanılmış / harcanmış olabilir.
  try {
    await Session.refresh();
  } catch (_) {}
}

/// Ödeme ya da başka dış sayfayı telefonun uygulama içi tarayıcı sekmesinde açar (ödeme sayfaları için en güvenlisi).
Future<void> openPayLink(String url) async {
  final uri = Uri.tryParse(url);
  if (uri == null) return;
  if (!await launchUrl(uri, mode: LaunchMode.inAppBrowserView)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

/// Dış (üçüncü taraf) H5 sayfası penceresi: https sayfalarda gezinir; başka şemaları (ör. ödeme uygulaması, intent://)
/// telefona devreder. Uygulama kanalı ve oturum bileti YOKTUR.
class ExternalWebView extends StatefulWidget {
  final String url;
  final String title;
  final bool fullPage;
  const ExternalWebView({super.key, required this.url, required this.title, this.fullPage = false});

  @override
  State<ExternalWebView> createState() => _ExternalWebViewState();
}

class _ExternalWebViewState extends State<ExternalWebView> {
  late final WebViewController _c;
  final _progress = ValueNotifier<int>(0);
  bool _failed = false;

  @override
  void initState() {
    super.initState();
    _c = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Pal.bg)
      // Oyun sayfasının "kapat" düğmesi (yalnızca close; başka hiçbir uygulama komutu dışarıdaki sayfaya açılmaz).
      // Dış sayfaya yalnızca 'close' açıktır; yetki kararı BridgePolicy'de, tek yerde.
      // Oturum bileti dış sayfaya ASLA verilmez: biletimizi başkasının sunucusuna göndermek,
      // o sunucunun kullanıcı adına her şeyi yapabilmesi demektir.
      ..addJavaScriptChannel('TrLiveBridge', onMessageReceived: (m) {
        BridgePolicy.handle(widget.url, m.message, (msg) async {
          if (msg.type == 'close' && mounted) Navigator.of(context).maybePop();
        });
      })
      ..setNavigationDelegate(NavigationDelegate(
        onNavigationRequest: (r) {
          // Düz http artık yüklenmiyor: araya giren, kanal bağlı bir pencereye kod sokabilirdi.
          // İzin listesi doluysa yabancı alan adı da engellenir.
          if (WebViewPolicy.canLoadExternal(r.url)) return NavigationDecision.navigate;
          final u = Uri.tryParse(r.url);
          if (u != null && WebViewPolicy.shouldHandOff(r.url)) {
            launchUrl(u, mode: LaunchMode.externalApplication).catchError((_) => false);
          } else if (u != null && u.scheme == 'https') {
            // İzin listesinde olmayan https adres: uygulama içinde değil, telefonun tarayıcısında
            // açılır. Orada adres çubuğu görünür, kullanıcı nereye gittiğini bilir.
            launchUrl(u, mode: LaunchMode.externalApplication).catchError((_) => false);
          }
          return NavigationDecision.prevent;
        },
        onPageStarted: (_) {
          if (mounted && _failed) setState(() => _failed = false);
        },
        onProgress: (p) => _progress.value = p,
        onPageFinished: (_) => _progress.value = 100,
        onWebResourceError: (e) {
          if (e.isForMainFrame != false && mounted) setState(() => _failed = true);
        },
      ))
      ..loadRequest(Uri.parse(widget.url));
  }

  @override
  void dispose() {
    _progress.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(children: [
      if (!widget.fullPage) ...[
        const SizedBox(height: 8),
        Container(width: 38, height: 4, decoration: BoxDecoration(color: Pal.outline, borderRadius: BorderRadius.circular(2))),
      ],
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 6, 0),
        child: Row(children: [
          Expanded(child: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: Pal.text))),
          IconButton(icon: const Icon(Icons.refresh, size: 20, color: Pal.textDim), onPressed: () => _c.reload()),
          IconButton(icon: const Icon(Icons.close, size: 22, color: Pal.text), onPressed: () => Navigator.of(context).maybePop()),
        ]),
      ),
      ValueListenableBuilder<int>(
        valueListenable: _progress,
        builder: (_, p, __) => SizedBox(
          height: 2,
          child: p >= 100 ? null : LinearProgressIndicator(value: p <= 0 ? null : p / 100, minHeight: 2, backgroundColor: Pal.surface, color: Pal.gold),
        ),
      ),
      Expanded(
        child: _failed
            ? Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.wifi_off, size: 34, color: Pal.textDim),
                  const SizedBox(height: 8),
                  Text(tx('Sayfa açılamadı.'), style: const TextStyle(color: Pal.textDim)),
                  TextButton(onPressed: () => _c.reload(), child: Text(tx('Tekrar dene'))),
                ]),
              )
            : WebViewWidget(controller: _c),
      ),
    ]);
  }
}
