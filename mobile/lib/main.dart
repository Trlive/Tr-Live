import 'services/crash_report.dart';
import 'services/fx_load.dart';
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/update_screen.dart';
import 'services/api.dart';
import 'services/app_visibility.dart';
import 'services/auth_service.dart';
import 'services/background_service.dart';
import 'services/error_log.dart';
import 'services/login_link.dart';
import 'services/presence_service.dart';
import 'services/push_service.dart';
import 'services/session.dart';
import 'services/socket_service.dart';
import 'widgets/app_theme.dart';
import 'widgets/common.dart';
import 'services/effect_prefs.dart';
import 'services/screen_guard.dart';
import 'l10n/delegates.dart';
import 'services/audio_processing.dart';
import 'l10n/l10n.dart';
import 'widgets/nav_guard.dart';
import 'widgets/tr_localizations.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
bool _loggingOut = false;
bool _updateShown = false;

Future<void> main() async {
  // Yakalanmamış hatalar uygulamayı çökertmesin; kayda geçip devam edilir.
  FlutterError.onError = (details) {
    ErrorLog.add('Arayüz hatası', details.exception, details.stack);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    ErrorLog.add('Beklenmeyen hata', error, stack);
    return true;
  };
  runZonedGuarded(_boot, (error, stack) => ErrorLog.add('Bölge hatası', error, stack));
}

Future<void> _boot() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Hareketli mikrofon emojileri: Google Noto Emoji Animation (CC BY 4.0) — lisans sayfasında görünür.
  LicenseRegistry.addLicense(() => Stream.value(const LicenseEntryWithLineBreaks(
        ['Noto Emoji Animation'],
        'Animated emoji © Google LLC, from the Noto Emoji Animation project '
        '(https://googlefonts.github.io/noto-emoji-animation/). Licensed under the Creative Commons Attribution 4.0 '
        'International License (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/. One emoji is also shown '
        'mirrored (horizontally flipped).',
      )));
  // Uygulama yalnızca dikey çalışır (telefon yan çevrilince ekran dönüp yarım görünmesin).
  unawaited(SystemChrome.setPreferredOrientations(const [DeviceOrientation.portraitUp]).catchError((_) {}));
  // Google/Facebook girişinden dönüş bağlantısı (sayfa yönlendirmesinden önce yakalansın diye en başta).
  LoginLink.instance.init();
  // Efekt yük koruması: telefonun belleği okunur, "bellek azaldı" bildirimi dinlenir (hediye yağmurunda çökmesin).
  FxLoad.install();
  // Önceki kapanış çökme / bellek yetersizliği ise nedeni hata kayıtlarına gönderilir.
  unawaited(CrashReport.collect());
  // Yayın sürümünde bozulan bir parça gri kutu yerine sade bir simgeyle görünsün (ekranın geri kalanı çalışır).
  if (kReleaseMode) {
    ErrorWidget.builder = (details) => const Center(child: Icon(Icons.broken_image_outlined, color: Colors.white24, size: 28));
  }
  // Açılış hiçbir koşulda takılmasın: hazırlık adımları hata verse / gecikse de uygulama ekranı açılır.
  // Efekt ayarları (hediye animasyonu, araç, şerit, global bildirim) telefondan okunur.
  await EffectPrefs.load().timeout(const Duration(seconds: 2), onTimeout: () {});
  await L10n.init().timeout(const Duration(seconds: 2), onTimeout: () {}); // dil: kayıtlı seçim ya da telefonun dili
  // Mikrofon ses işleme (yankı / gürültü): LiveKit kullanılmadan önce bir kez (bkz. AudioProcessing).
  await AudioProcessing.init().timeout(const Duration(seconds: 4), onTimeout: () {});
  // Uygulama ekranda mı: arka plandayken periyodik sorgular durur (pil/internet).
  AppVisibility.instance.init();
  try {
    BackgroundService.instance.init();
  } catch (e, s) {
    ErrorLog.add('Arka plan servisi', e, s);
  }
  try {
    await AuthService.restore().timeout(const Duration(seconds: 5));
  } catch (e, s) {
    ErrorLog.add('Oturum okunamadı', e, s);
  }
  // Oturum sona erdiğinde (401, yasaklı hesap, şifre değişimi) giriş ekranına dön.
  Api.onUnauthorized = () async {
    if (_loggingOut) return;
    _loggingOut = true;
    await AuthService.logout();
    navigatorKey.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const LoginScreen()), (_) => false);
    _loggingOut = false;
  };
  // Sunucu bu sürümü artık kabul etmiyorsa (yönetim panelinde "en düşük sürüm") güncelleme ekranı açılır.
  Api.onUpdateRequired = (message, url) {
    if (_updateShown) return;
    _updateShown = true;
    navigatorKey.currentState?.pushAndRemoveUntil(
      MaterialPageRoute(
        builder: (_) => UpdateRequiredScreen(
          message: message,
          url: url,
          onRetry: () {
            _updateShown = false;
            navigatorKey.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const _Boot()), (_) => false);
          },
        ),
      ),
      (_) => false,
    );
  };
  PresenceService.init();
  ScreenGuard.init(); // uygulama içi ekran görüntüsü bildirimi (Android)
  // Dil değişince açık sayfalar yeni dille baştan açılır (oturum korunur; ana sayfa ya da giriş ekranı).
  // Kişinin bölgesi öğrenilince (oturum / kayıt ekranındaki ülke) dil bölgeye göre ayarlanır (bkz. L10n).
  Session.me.addListener(() => L10n.applyRegion(Session.me.value?['region']?.toString()));
  L10n.lang.addListener(() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      navigatorKey.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const _Boot()), (_) => false);
    });
  });
  runApp(const TRLiveApp());
  // Yönetimden "herkese telefon bildirimi". İzin penceresi açılış ekranı çizilmeden açılırsa bazı telefonlarda
  // uygulama logoda takılı kalıyordu: ilk kare çizildikten birkaç saniye sonra başlatılır.
  WidgetsBinding.instance.addPostFrameCallback((_) {
    Future.delayed(const Duration(seconds: 4), () {
      unawaited(PushService.start().catchError((Object e, StackTrace s) => ErrorLog.add('Bildirim servisi', e, s)));
    });
  });
}

class TRLiveApp extends StatelessWidget {
  const TRLiveApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Dil değişince yerleşik metinler (tarih seçici vb.) yeni dile geçer; sayfalar main() içindeki dinleyiciyle baştan açılır.
    return ValueListenableBuilder<String>(valueListenable: L10n.lang, builder: (context, lang, _) => _app(lang));
  }

  Widget _app(String lang) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      // Aynı sayfanın art arda iki kez açılmasını engeller.
      navigatorObservers: [DuplicateRouteGuard()],
      debugShowCheckedModeBanner: false,
      title: 'TR Live',
      theme: buildAppTheme(),
      themeMode: ThemeMode.dark,
      locale: Locale(lang),
      supportedLocales: const [Locale('tr'), Locale('en'), Locale('ar'), Locale('hi')],
      // Türkçe: kendi çevirimiz; İngilizce: Flutter'ın yerleşik metinleri.
      localizationsDelegates: const [
        TrMaterialLocalizations.delegate,
        TrMaterialLocalizations.cupertinoDelegate,
        AppFallbackLocalizations.material,
        AppFallbackLocalizations.cupertino,
        AppFallbackLocalizations.widgets, // Arapça: sağdan sola
      ],
      // Kısa listelerde de aşağı çekip yenileme çalışsın.
      scrollBehavior: const _AppScroll(),
      builder: appFrame,
      // Açılış ekranı. Uygulama bir bağlantıyla (ör. giriş dönüşü) soğuk açılırsa bağlantı sayfa sayılmaz.
      onGenerateInitialRoutes: (_) => [MaterialPageRoute(builder: (_) => const _Boot())],
      onGenerateRoute: (_) => MaterialPageRoute(builder: (_) => const _Boot()),
    );
  }
}

class _AppScroll extends MaterialScrollBehavior {
  const _AppScroll();

  // Yalnızca dikey listeler her zaman kaydırılabilir (aşağı çekip yenileme için); yatay listeler eski davranışında
  // kalır, böylece kısa yatay şeritler üst sayfa geçişlerinin kaydırmasını yakalamaz.
  @override
  ScrollPhysics getScrollPhysics(BuildContext context) {
    final base = super.getScrollPhysics(context);
    final w = context.widget;
    final vertical = w is Scrollable && axisDirectionToAxis(w.axisDirection) == Axis.vertical;
    return vertical ? AlwaysScrollableScrollPhysics(parent: base) : base;
  }
}

/// Kayıtlı oturum varsa sunucuda doğrular, yoksa giriş ekranını açar.
class _Boot extends StatefulWidget {
  const _Boot();

  @override
  State<_Boot> createState() => _BootState();
}

class _BootState extends State<_Boot> {
  String? _error;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    if (Api.token == null) {
      _go(const LoginScreen());
      return;
    }
    setState(() => _error = null);
    try {
      await Session.refresh();
      // Eski sürümden güncellendiyse oturum, yeniden giriş istemeden cihaz oturumuna çevrilir.
      await AuthService.upgradeLegacySession();
      SocketService.instance.start();
      ErrorLog.flushSaved();
      _go(const HomeScreen());
      // Zorunlu olmayan "yeni sürüm var" bildirimi (ana sayfa açıldıktan biraz sonra).
      Future.delayed(const Duration(seconds: 3), () {
        final c = navigatorKey.currentState?.overlay?.context;
        if (c != null && c.mounted) checkOptionalUpdate(c);
      });
    } catch (e) {
      if (!mounted) return;
      // 401 ise onUnauthorized zaten giriş ekranına yönlendirir.
      if (Api.token != null) setState(() => _error = errorText(e));
    }
  }

  void _go(Widget page) {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return Scaffold(body: LoadError(message: _error!, onRetry: _start));
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
