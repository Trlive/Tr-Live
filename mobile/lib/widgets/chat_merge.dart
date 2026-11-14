/// Oda sohbeti: sunucudan yeniden yüklenen geçmişi ekrandaki listeyle birleştirir.
///
/// Ekrandaki listede sunucu mesajlarının arasında yalnızca bu telefonda oluşan yerel satırlar da vardır ("odaya girdi",
/// takip kartı, sistem bildirimi; [isLocalChatLine]). Bunların sunucuda kaydı olmadığı için yeniden yüklemede yerleri,
/// hemen öncesindeki sunucu mesajına göre korunur. Öncesindeki mesaj artık geçmişte yoksa (eski mesajlar budandı) ya da
/// hiç yoksa satır listenin başına konur. Sunucuda olup ekranda olmayan mesajlar (arada gelenler) sunucu sırasıyla girer.
bool isLocalChatLine(Map<String, dynamic> m) => m['join'] == true || m['follow'] == true || m['system'] == true;

List<Map<String, dynamic>> mergeChatHistory(List<Map<String, dynamic>> current, List<Map<String, dynamic>> server) {
  final anchored = <String?, List<Map<String, dynamic>>>{};
  String? last;
  for (final m in current) {
    if (isLocalChatLine(m)) {
      (anchored[last] ??= <Map<String, dynamic>>[]).add(m);
    } else {
      last = '${m['id']}';
    }
  }
  final serverIds = {for (final m in server) '${m['id']}'};
  final out = <Map<String, dynamic>>[];
  for (final e in anchored.entries) {
    if (e.key == null || !serverIds.contains(e.key)) out.addAll(e.value);
  }
  for (final m in server) {
    out.add(m);
    final after = anchored['${m['id']}'];
    if (after != null) out.addAll(after);
  }
  return out;
}
