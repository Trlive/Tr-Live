import 'package:flutter/cupertino.dart' show CupertinoLocalizations, DefaultCupertinoLocalizations;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

/// Türkçe dışındaki diller (en / ar / hi) için Flutter'ın yerleşik (İngilizce) Material / Cupertino metinleri.
/// Böylece Arapça ve Hintçede de tarih seçici, kopyala / yapıştır menüsü vb. çalışır (eksik yerelleştirme hatası olmaz).
class AppFallbackLocalizations {
  AppFallbackLocalizations._();
  static const LocalizationsDelegate<MaterialLocalizations> material = _MaterialFallback();
  static const LocalizationsDelegate<CupertinoLocalizations> cupertino = _CupertinoFallback();

  /// Yazı yönü: Arapça sağdan sola, diğerleri soldan sağa.
  static const LocalizationsDelegate<WidgetsLocalizations> widgets = _WidgetsDelegate();
}

class _MaterialFallback extends LocalizationsDelegate<MaterialLocalizations> {
  const _MaterialFallback();
  @override
  bool isSupported(Locale locale) => locale.languageCode != 'tr';
  @override
  Future<MaterialLocalizations> load(Locale locale) => DefaultMaterialLocalizations.load(locale);
  @override
  bool shouldReload(_MaterialFallback old) => false;
}

class _CupertinoFallback extends LocalizationsDelegate<CupertinoLocalizations> {
  const _CupertinoFallback();
  @override
  bool isSupported(Locale locale) => locale.languageCode != 'tr';
  @override
  Future<CupertinoLocalizations> load(Locale locale) => DefaultCupertinoLocalizations.load(locale);
  @override
  bool shouldReload(_CupertinoFallback old) => false;
}

class _RtlWidgetsLocalizations extends DefaultWidgetsLocalizations {
  const _RtlWidgetsLocalizations();
  @override
  TextDirection get textDirection => TextDirection.rtl;
}

class _WidgetsDelegate extends LocalizationsDelegate<WidgetsLocalizations> {
  const _WidgetsDelegate();
  @override
  bool isSupported(Locale locale) => true;
  @override
  Future<WidgetsLocalizations> load(Locale locale) => SynchronousFuture<WidgetsLocalizations>(
        locale.languageCode == 'ar' ? const _RtlWidgetsLocalizations() : const DefaultWidgetsLocalizations(),
      );
  @override
  bool shouldReload(_WidgetsDelegate old) => false;
}
