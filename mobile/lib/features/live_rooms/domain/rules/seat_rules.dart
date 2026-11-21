/// Oda koltuk kuralları — saf mantık.
///
/// ## Niçin ayrı dosya
///
/// Bu kurallar `_RoomScreenState` içinde, 5.191 satırlık bir sınıfın ortasında duruyordu.
/// Orada **test edilemiyorlardı**: her biri `_members`, `_seatCount`, `_lockedSeats` gibi
/// örnek alanlarını okuyordu ve o alanları kurmak için bütün ekranı ayağa kaldırmak gerekiyordu.
///
/// Buraya taşındıklarında girdileri parametreye döndü. Artık her kural tek başına sınanıyor —
/// ve oda ekranını bölme işinin önündeki asıl engel buydu: davranışı sabitleyen test olmadan
/// 5.000 satırlık bir durum makinesini yeniden yazmak, hatayı ilk gören kişinin kullanıcı
/// olması demektir.
///
/// Mantık **birebir korundu**; tek sadeleştirme: boş koltuk sayımı iki yerde kopyalanmıştı
/// (`_noFreeSeat` ve `_freeGuestSeats` aynı kümeyi aynı şekilde hesaplıyordu), tek işleve indi.
/// İkisi matematiksel olarak aynı şey: boş koltuk yok demek, boş koltuk sayısının sıfır olması.
library;

/// Üye listesinden dolu koltuk numaralarını çıkarır.
///
/// `seatIndex` null olan üyeler dinleyicidir (koltukta değil) ve sayılmaz.
Set<int> takenSeats(List<Map<String, dynamic>> members) {
  final out = <int>{};
  for (final m in members) {
    final v = m['seatIndex'];
    if (v is num) out.add(v.toInt());
  }
  return out;
}

/// Misafirlere açık boş koltuk sayısı.
///
/// 0 numaralı koltuk sahibinindir ve sayıma **girmez** — bu yüzden döngü 1'den başlar.
/// Kilitli koltuklar da boş sayılmaz: yönetici onları bilerek kapatmıştır.
int freeGuestSeats({
  required List<Map<String, dynamic>> members,
  required int seatCount,
  required Set<int> lockedSeats,
}) {
  final taken = takenSeats(members);
  var n = 0;
  for (var i = 1; i < seatCount; i++) {
    if (!taken.contains(i) && !lockedSeats.contains(i)) n++;
  }
  return n;
}

/// Misafire açık koltuk kalmadı mı.
bool noFreeSeat({
  required List<Map<String, dynamic>> members,
  required int seatCount,
  required Set<int> lockedSeats,
}) =>
    freeGuestSeats(members: members, seatCount: seatCount, lockedSeats: lockedSeats) == 0;

/// Kullanıcının oturduğu koltuk; koltukta değilse null.
int? seatIndexOf(List<Map<String, dynamic>> members, String userId) {
  if (userId.isEmpty) return null;
  for (final m in members) {
    if (m['userId']?.toString() == userId) {
      final v = m['seatIndex'];
      return v is num ? v.toInt() : null;
    }
  }
  return null;
}

/// Kullanıcının mikrofonu yönetici tarafından kapatılmış mı.
///
/// Koltukta değilse false: koltuksuz birinin mikrofonu zaten yoktur.
bool seatMuted({
  required List<Map<String, dynamic>> members,
  required String userId,
  required Set<int> mutedSeats,
}) {
  final i = seatIndexOf(members, userId);
  return i != null && mutedSeats.contains(i);
}

/// Bu kişi çıkınca oda kapanır mı.
///
/// Kapanır: kişi sahip ya da yardımcı sahip **ve** odada başka sahip/yardımcı sahip yok.
/// Yani odayı yönetecek kimse kalmıyor.
///
/// Normal üyeler ve dinleyiciler bu kararı hiç etkilemez — biri çıktı diye oda kapanmaz.
bool closesOnLeave({
  required String myRole,
  required String myUserId,
  required List<Map<String, dynamic>> members,
}) {
  if (myRole != 'owner' && myRole != 'cohost') return false;
  for (final m in members) {
    if (m['userId']?.toString() == myUserId) continue;
    final r = m['role'];
    if (r == 'owner' || r == 'cohost') return false;
  }
  return true;
}
