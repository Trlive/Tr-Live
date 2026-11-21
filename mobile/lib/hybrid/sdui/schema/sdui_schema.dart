/// SDUI şeması — uygulama tarafı.
///
/// ## Temel kural: bilinmeyeni atla, asla çökme
///
/// Sunucu, bu APK'dan sonra eklenmiş bir düğüm türü gönderebilir. Eski bir telefon onu tanımaz.
/// Bu normaldir ve **hata değildir**: tanınmayan sekme, bölüm, eylem ya da simge sessizce atlanır.
/// Alternatifi, sunucuya yeni bir alan eklendiği gün eski telefonların çökmesi olurdu.
///
/// ## İkinci kural: sunucu yeni yetenek üretemez
///
/// Eylemler kapalı listedir ve hepsi uygulamanın **zaten yaptığı** şeylere işaret eder. Sunucu
/// yeni bir davranış tanımlayamaz, var olanları yeniden düzenler. SDUI'nin uzaktan kod
/// çalıştırmaya dönüşmemesi buna bağlı.

/// Uygulamanın çizebildiği sekmeler. Sunucu bunları gizler, sıralar, yeniden adlandırır —
/// yenisini ekleyemez (yeni sekme APK gerektirir).
const kTabTargets = ['voice', 'feed', 'video', 'messages', 'profile'];

/// SDUI'den açılabilen ekranlar. Oda ekranı, cüzdan işlem akışı ve giriş BURADA YOK:
/// ses, görüntü, kimlik doğrulama ve finansal işlemler native kalır (mimari ilke).
const kOpenScreens = ['store', 'wallet', 'usd_wallet', 'leaderboards', 'family'];

class SduiAction {
  const SduiAction(this.type, {this.target, this.screen, this.id, this.url, this.external = false});

  final String type; // noop | tab | openScreen | openActivity | openUrl
  final String? target;
  final String? screen;
  final String? id;
  final String? url;
  final bool external;

  static const none = SduiAction('noop');

  /// Tanınmayan ya da izin verilmeyen eylem `none` olur: düğme görünür ama hiçbir şey yapmaz.
  /// Düğmeyi gizlemek yerine etkisizleştirmek bilinçli — düzen bozulmaz, kullanıcı da yanlış
  /// bir yere gitmez.
  static SduiAction from(Object? raw) {
    if (raw is! Map) return none;
    final type = raw['type']?.toString() ?? 'noop';
    switch (type) {
      case 'tab':
        final t = raw['target']?.toString() ?? '';
        return kTabTargets.contains(t) ? SduiAction(type, target: t) : none;
      case 'openScreen':
        final s = raw['screen']?.toString() ?? '';
        return kOpenScreens.contains(s) ? SduiAction(type, screen: s) : none;
      case 'openActivity':
        final id = raw['id']?.toString() ?? '';
        return RegExp(r'^[0-9a-fA-F-]{36}$').hasMatch(id) ? SduiAction(type, id: id) : none;
      case 'openUrl':
        final u = raw['url']?.toString() ?? '';
        // https şartı burada; izin listesi denetimi açılış anında (sdui_action.dart).
        return u.startsWith('https://') ? SduiAction(type, url: u, external: raw['external'] == true) : none;
      default:
        return none;
    }
  }
}

class SduiTab {
  const SduiTab({required this.target, required this.label, this.icon, this.hidden = false});
  final String target;
  final String label;
  final String? icon;
  final bool hidden;

  static SduiTab? from(Object? raw) {
    if (raw is! Map) return null;
    final t = raw['target']?.toString() ?? '';
    if (!kTabTargets.contains(t)) return null; // bilinmeyen sekme atlanır
    return SduiTab(
      target: t,
      label: raw['label']?.toString() ?? '',
      icon: raw['icon']?.toString(),
      hidden: raw['hidden'] == true,
    );
  }
}

class SduiItem {
  const SduiItem({required this.id, required this.title, this.subtitle = '', this.image, this.action = SduiAction.none});
  final String id;
  final String title;
  final String subtitle;
  final String? image;
  final SduiAction action;

  static SduiItem? from(Object? raw) {
    if (raw is! Map) return null;
    final title = raw['title']?.toString() ?? '';
    if (title.isEmpty) return null;
    return SduiItem(
      id: raw['id']?.toString() ?? title,
      title: title,
      subtitle: raw['subtitle']?.toString() ?? '',
      image: (raw['image']?.toString().isNotEmpty ?? false) ? raw['image'].toString() : null,
      action: SduiAction.from(raw['action']),
    );
  }
}

class SduiSection {
  const SduiSection({required this.id, required this.type, this.title = '', this.text = '', this.items = const [], this.action = SduiAction.none});
  final String id;
  final String type; // banner | cards | notice
  final String title;
  final String text;
  final List<SduiItem> items;
  final SduiAction action;

  static const _known = {'banner', 'cards', 'notice'};

  static SduiSection? from(Object? raw) {
    if (raw is! Map) return null;
    if (raw['hidden'] == true) return null;
    final type = raw['type']?.toString() ?? '';
    if (!_known.contains(type)) return null; // bu APK'nın bilmediği bölüm türü: atlanır
    final items = <SduiItem>[];
    final list = raw['items'];
    if (list is List) {
      for (final e in list) {
        final it = SduiItem.from(e);
        if (it != null) items.add(it);
      }
    }
    return SduiSection(
      id: raw['id']?.toString() ?? type,
      type: type,
      title: raw['title']?.toString() ?? '',
      text: raw['text']?.toString() ?? '',
      items: items,
      action: SduiAction.from(raw['action']),
    );
  }
}

class SduiLayout {
  const SduiLayout({required this.version, required this.tabs, required this.sections});
  final String version;
  final List<SduiTab> tabs;
  final List<SduiSection> sections;

  bool get isEmpty => tabs.isEmpty && sections.isEmpty;

  /// Ham yanıtı çözer. **Geçerli bir düzen üretilemezse null döner** ve çağıran yerleşik düzene
  /// düşer. Yarı çözülmüş bir düzen döndürmek, kullanıcıya yarım bir uygulama göstermek olurdu.
  static SduiLayout? from(Object? raw) {
    if (raw is! Map) return null;
    final version = raw['version']?.toString() ?? '';
    if (version.isEmpty) return null;

    final tabs = <SduiTab>[];
    final t = raw['tabs'];
    if (t is List) {
      for (final e in t) {
        final tab = SduiTab.from(e);
        if (tab != null) tabs.add(tab);
      }
    }
    // Görünür sekme kalmadıysa düzen kullanılamaz: uygulama gezinemez hale gelirdi.
    // Sunucu bunu kaydettirmiyor ama eski bir APK bütün sekmeleri tanımıyor olabilir.
    if (tabs.isNotEmpty && !tabs.any((x) => !x.hidden)) return null;

    final sections = <SduiSection>[];
    final s = raw['sections'];
    if (s is List) {
      for (final e in s) {
        final sec = SduiSection.from(e);
        if (sec != null) sections.add(sec);
      }
    }
    return SduiLayout(version: version, tabs: tabs, sections: sections);
  }
}
