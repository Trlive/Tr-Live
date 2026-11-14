/// Kayıt ekranındaki ülke seçimi: ISO kodu, Türkçe ad, telefon kodu. Bayrak, koddan emoji olarak üretilir (görsel yok).
class Country {
  final String code;
  final String name;
  final String dial;
  const Country(this.code, this.name, this.dial);

  /// "TR" → 🇹🇷 (bölgesel gösterge harfleri).
  String get flag => String.fromCharCodes(code.toUpperCase().codeUnits.map((c) => 0x1F1E6 + c - 65));
}

/// Türkiye başta; ardından bölgelere göre sık kullanılanlar, sonra diğerleri (alfabetik).
const kCountries = <Country>[
  Country('TR', 'Türkiye', '+90'),
  Country('AZ', 'Azerbaycan', '+994'),
  Country('CY', 'Kıbrıs', '+357'),
  // Arap ülkeleri
  Country('SA', 'Suudi Arabistan', '+966'),
  Country('AE', 'Birleşik Arap Emirlikleri', '+971'),
  Country('QA', 'Katar', '+974'),
  Country('KW', 'Kuveyt', '+965'),
  Country('BH', 'Bahreyn', '+973'),
  Country('OM', 'Umman', '+968'),
  Country('YE', 'Yemen', '+967'),
  Country('IQ', 'Irak', '+964'),
  Country('SY', 'Suriye', '+963'),
  Country('LB', 'Lübnan', '+961'),
  Country('JO', 'Ürdün', '+962'),
  Country('PS', 'Filistin', '+970'),
  Country('EG', 'Mısır', '+20'),
  Country('LY', 'Libya', '+218'),
  Country('TN', 'Tunus', '+216'),
  Country('DZ', 'Cezayir', '+213'),
  Country('MA', 'Fas', '+212'),
  Country('SD', 'Sudan', '+249'),
  // Güney Asya
  Country('IN', 'Hindistan', '+91'),
  Country('PK', 'Pakistan', '+92'),
  Country('BD', 'Bangladeş', '+880'),
  Country('NP', 'Nepal', '+977'),
  Country('LK', 'Sri Lanka', '+94'),
  Country('AF', 'Afganistan', '+93'),
  // Avrupa
  Country('DE', 'Almanya', '+49'),
  Country('NL', 'Hollanda', '+31'),
  Country('BE', 'Belçika', '+32'),
  Country('FR', 'Fransa', '+33'),
  Country('AT', 'Avusturya', '+43'),
  Country('CH', 'İsviçre', '+41'),
  Country('GB', 'Birleşik Krallık', '+44'),
  Country('IT', 'İtalya', '+39'),
  Country('ES', 'İspanya', '+34'),
  Country('PT', 'Portekiz', '+351'),
  Country('SE', 'İsveç', '+46'),
  Country('NO', 'Norveç', '+47'),
  Country('DK', 'Danimarka', '+45'),
  Country('FI', 'Finlandiya', '+358'),
  Country('PL', 'Polonya', '+48'),
  Country('GR', 'Yunanistan', '+30'),
  Country('BG', 'Bulgaristan', '+359'),
  Country('RO', 'Romanya', '+40'),
  Country('HU', 'Macaristan', '+36'),
  Country('CZ', 'Çekya', '+420'),
  Country('IE', 'İrlanda', '+353'),
  Country('UA', 'Ukrayna', '+380'),
  Country('RU', 'Rusya', '+7'),
  // Diğer
  Country('AL', 'Arnavutluk', '+355'),
  Country('AU', 'Avustralya', '+61'),
  Country('BA', 'Bosna-Hersek', '+387'),
  Country('BR', 'Brezilya', '+55'),
  Country('CA', 'Kanada', '+1'),
  Country('CN', 'Çin', '+86'),
  Country('GE', 'Gürcistan', '+995'),
  Country('ID', 'Endonezya', '+62'),
  Country('IR', 'İran', '+98'),
  Country('JP', 'Japonya', '+81'),
  Country('KZ', 'Kazakistan', '+7'),
  Country('KG', 'Kırgızistan', '+996'),
  Country('KR', 'Güney Kore', '+82'),
  Country('XK', 'Kosova', '+383'),
  Country('MK', 'Kuzey Makedonya', '+389'),
  Country('MY', 'Malezya', '+60'),
  Country('MX', 'Meksika', '+52'),
  Country('NG', 'Nijerya', '+234'),
  Country('PH', 'Filipinler', '+63'),
  Country('RS', 'Sırbistan', '+381'),
  Country('SO', 'Somali', '+252'),
  Country('TJ', 'Tacikistan', '+992'),
  Country('TM', 'Türkmenistan', '+993'),
  Country('US', 'Amerika Birleşik Devletleri', '+1'),
  Country('UZ', 'Özbekistan', '+998'),
  Country('ZA', 'Güney Afrika', '+27'),
];

Country? countryByCode(String? code) {
  if (code == null) return null;
  for (final c in kCountries) {
    if (c.code == code.toUpperCase()) return c;
  }
  return null;
}
