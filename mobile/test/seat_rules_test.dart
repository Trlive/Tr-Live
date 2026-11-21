import 'package:flutter_test/flutter_test.dart';
import 'package:tr_live/features/live_rooms/domain/rules/seat_rules.dart';

/// Oda koltuk kuralları.
///
/// Bu testler `room_screen.dart`'ı bölebilmek için var. 5.191 satırlık tek bir State sınıfını
/// testsiz yeniden yazmak, hatayı ilk gören kişinin kullanıcı olması demektir. Kurallar tek tek
/// buraya çıkarıldıkça davranışları sabitleniyor; bölme işi ancak o zaman güvenli hale geliyor.

Map<String, dynamic> m(String uid, {int? seat, String role = 'member'}) =>
    {'userId': uid, 'seatIndex': seat, 'role': role};

void main() {
  group('boş koltuk sayımı', () {
    test('0 numaralı koltuk (sahip) sayıma girmez', () {
      // 4 koltuklu odada 0 sahibindir: misafire açık koltuk en fazla 3'tür.
      expect(freeGuestSeats(members: [], seatCount: 4, lockedSeats: {}), 3);
    });

    test('dolu koltuklar düşülür', () {
      final members = [m('a', seat: 0), m('b', seat: 1), m('c', seat: 2)];
      expect(freeGuestSeats(members: members, seatCount: 6, lockedSeats: {}), 3);
    });

    test('kilitli koltuk boş sayılmaz', () {
      // Yönetici bilerek kapatmıştır; "boş koltuk var" demek kullanıcıyı boşuna uğraştırır.
      expect(freeGuestSeats(members: [], seatCount: 4, lockedSeats: {1, 2}), 1);
    });

    test('koltuksuz üyeler (dinleyiciler) sayımı etkilemez', () {
      final members = [m('a'), m('b'), m('c'), m('d', seat: 1)];
      expect(freeGuestSeats(members: members, seatCount: 4, lockedSeats: {}), 2);
    });

    test('seatIndex sayı değilse yok sayılır (bozuk veri koltuğu dolu göstermesin)', () {
      final members = [
        {'userId': 'a', 'seatIndex': 'iki'},
        {'userId': 'b'},
      ];
      expect(freeGuestSeats(members: members, seatCount: 4, lockedSeats: {}), 3);
    });

    test('noFreeSeat, sayımın sıfır olmasıyla birebir aynı', () {
      // İkisi ayrı yazılmıştı ve aynı kümeyi aynı şekilde hesaplıyordu; tek işleve indirildi.
      for (final locked in [<int>{}, {1}, {1, 2}, {1, 2, 3}]) {
        final members = [m('a', seat: 0)];
        final free = freeGuestSeats(members: members, seatCount: 4, lockedSeats: locked);
        expect(noFreeSeat(members: members, seatCount: 4, lockedSeats: locked), free == 0,
            reason: 'kilitli: $locked');
      }
    });

    test('bütün koltuklar doluyken boş yok', () {
      final members = [m('a', seat: 0), m('b', seat: 1), m('c', seat: 2), m('d', seat: 3)];
      expect(noFreeSeat(members: members, seatCount: 4, lockedSeats: {}), isTrue);
    });
  });

  group('koltuk bulma', () {
    test('kendi koltuğunu bulur', () {
      expect(seatIndexOf([m('a', seat: 0), m('ben', seat: 3)], 'ben'), 3);
    });

    test('koltuksuz üye için null', () {
      expect(seatIndexOf([m('ben')], 'ben'), isNull);
    });

    test('listede yoksa null', () {
      expect(seatIndexOf([m('a', seat: 1)], 'ben'), isNull);
    });

    test('boş kullanıcı kimliği null döner (oturum açılmadan koltuk aranmaz)', () {
      expect(seatIndexOf([m('', seat: 2)], ''), isNull);
    });
  });

  group('mikrofon kapalı mı', () {
    test('koltuğu susturulmuşsa true', () {
      expect(seatMuted(members: [m('ben', seat: 2)], userId: 'ben', mutedSeats: {2}), isTrue);
    });

    test('başka koltuk susturulmuşsa false', () {
      expect(seatMuted(members: [m('ben', seat: 2)], userId: 'ben', mutedSeats: {1, 3}), isFalse);
    });

    test('koltukta değilse false (koltuksuzun mikrofonu yok)', () {
      expect(seatMuted(members: [m('ben')], userId: 'ben', mutedSeats: {0, 1, 2}), isFalse);
    });
  });

  group('çıkınca oda kapanır mı', () {
    test('tek sahip çıkarsa kapanır', () {
      final members = [m('ben', seat: 0, role: 'owner'), m('a', seat: 1)];
      expect(closesOnLeave(myRole: 'owner', myUserId: 'ben', members: members), isTrue);
    });

    test('odada başka yardımcı sahip varsa kapanmaz', () {
      final members = [m('ben', seat: 0, role: 'owner'), m('a', seat: 1, role: 'cohost')];
      expect(closesOnLeave(myRole: 'owner', myUserId: 'ben', members: members), isFalse);
    });

    test('normal üye çıkarsa kapanmaz', () {
      final members = [m('ben', seat: 1), m('a', seat: 0, role: 'owner')];
      expect(closesOnLeave(myRole: 'member', myUserId: 'ben', members: members), isFalse);
    });

    test('yardımcı sahip tek yönetici kalmışsa kapanır', () {
      final members = [m('ben', seat: 1, role: 'cohost'), m('a', seat: 2)];
      expect(closesOnLeave(myRole: 'cohost', myUserId: 'ben', members: members), isTrue);
    });

    test('kendisi listede iki kez görünse de kendini yönetici saymaz', () {
      // Üye listesi anlık olarak kopya satır içerebilir (eşzamanlı güncelleme). Kendi satırını
      // "başka bir yönetici" sanmak, odanın kapanması gerekirken açık kalmasına yol açardı.
      final members = [m('ben', seat: 0, role: 'owner'), m('ben', seat: 0, role: 'owner')];
      expect(closesOnLeave(myRole: 'owner', myUserId: 'ben', members: members), isTrue);
    });
  });
}
