import 'package:flutter/foundation.dart';

/// SDUI v2 düğümü: sunucudan gelen bileşen ağacının tek bir öğesi.
///
/// ## Neden gevşek bir harita, katı bir sınıf değil
///
/// Her bileşen türü için ayrı Dart sınıfı yazmak, sunucuya yeni bir bileşen eklendiğinde
/// APK çıkmayı zorunlu kılardı — SDUI'nin varlık sebebinin tam tersi. Düğüm, türü ve
/// alanlarını olduğu gibi taşır; ANLAMLANDIRMA bileşen kaydında (registry) yapılır.
///
/// Bunun bedeli tip güvenliğinin kaybı; bu yüzden okuma yardımcıları (`str`, `intOf`, `boolOf`)
/// hiçbir zaman atmaz, yalnızca varsayılana düşer. Sunucudan gelen bir alanın türü beklenenden
/// farklıysa ekran bozulur ama ÇÖKMEZ — uzaktan gelen veri yüzünden uygulama kapanmamalı.
@immutable
class SduiNode {
  final String type;
  final String? id;
  final Map<String, dynamic> props;
  final List<SduiNode> children;

  const SduiNode({required this.type, this.id, this.props = const {}, this.children = const []});

  static SduiNode? from(dynamic raw) {
    if (raw is! Map) return null;
    final type = raw['type'];
    if (type is! String || type.isEmpty) return null;
    final kids = <SduiNode>[];
    final rawKids = raw['children'];
    if (rawKids is List) {
      for (final k in rawKids) {
        final n = SduiNode.from(k);
        // Bozuk çocuk ATLANIR, kardeşlerini düşürmez: sunucudan gelen tek hatalı düğüm
        // yüzünden bütün ekranın boşalması, kısmi ekrandan kötüdür.
        if (n != null) kids.add(n);
      }
    }
    final props = <String, dynamic>{};
    for (final e in raw.entries) {
      final key = e.key;
      if (key is! String || key == 'type' || key == 'id' || key == 'children') continue;
      props[key] = e.value;
    }
    return SduiNode(type: type, id: raw['id'] is String ? raw['id'] as String : null, props: props, children: kids);
  }

  String? str(String key) {
    final v = props[key];
    if (v is String && v.trim().isNotEmpty) return v;
    return null;
  }

  int? intOf(String key) {
    final v = props[key];
    if (v is int) return v;
    if (v is num) return v.toInt();
    if (v is String) return int.tryParse(v);
    return null;
  }

  bool boolOf(String key) => props[key] == true;

  Map<String, dynamic>? mapOf(String key) {
    final v = props[key];
    return v is Map ? Map<String, dynamic>.from(v) : null;
  }

  List<Map<String, dynamic>> listOf(String key) {
    final v = props[key];
    if (v is! List) return const [];
    return [for (final x in v) if (x is Map) Map<String, dynamic>.from(x)];
  }

  int get nodeCount => 1 + children.fold(0, (s, c) => s + c.nodeCount);
}

/// Bir ekranın tamamı.
@immutable
class SduiScreenDoc {
  final String screenId;
  final String revision;
  final SduiNode root;

  const SduiScreenDoc({required this.screenId, required this.revision, required this.root});

  static SduiScreenDoc? from(dynamic raw) {
    if (raw is! Map) return null;
    // Şema sürümü uyuşmuyorsa ekran ÇİZİLMEZ, yerleşik ekrana düşülür. İleride v3 gelirse
    // v2 uygulamaları onu çizmeye çalışıp yarım ekran göstermesin.
    final sv = raw['schemaVersion'];
    if (sv != null && sv != 2) return null;
    final root = SduiNode.from(raw['root']);
    if (root == null) return null;
    return SduiScreenDoc(
      screenId: raw['screenId'] is String ? raw['screenId'] as String : '',
      revision: raw['revision'] is String ? raw['revision'] as String : '',
      root: root,
    );
  }

  bool get isEmpty => root.children.isEmpty && root.props.isEmpty;
}
