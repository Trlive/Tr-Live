import 'package:flutter/material.dart';
import '../data/countries.dart';
import '../services/api.dart';
import '../services/session.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/image_pick.dart';
import '../widgets/net_image.dart';

/// Kayıt ekranı (yeni hesap, bir kez): profil fotoğrafı, takma ad, cinsiyet, doğum günü, isteğe bağlı şifre, ülke.
/// Uygulamanın koyu zemin + altın renkleriyle. Tamamlanınca hesap "setupDone" olur ve bir daha gösterilmez.
class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  Map<String, dynamic> get _me => Session.me.value ?? const {};
  late final _name = TextEditingController(text: _initialName());
  final _password = TextEditingController();
  late String? _gender = _me['gender'] == 'female' ? 'female' : (_me['gender'] == 'male' ? 'male' : null);
  late DateTime? _birth = DateTime.tryParse('${_me['birthDate'] ?? ''}');
  late Country _country = countryByCode(_me['countryCode']?.toString()) ?? kCountries.first;
  bool _showPassword = false;
  bool _busy = false;
  bool _uploading = false;

  bool get _hasPassword => _me['hasPassword'] == true;

  String _initialName() {
    final n = (_me['displayName'] ?? '').toString();
    // Otomatik verilen ad (ör. g_48392011) gösterilmez; kişi kendi adını yazsın.
    return RegExp(r'^[a-z]_\d{6,}$').hasMatch(n) ? '' : n;
  }

  @override
  void dispose() {
    _name.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final img = await pickImage(context, crop: CropSpec.avatar);
    if (img == null || !mounted) return;
    setState(() => _uploading = true);
    final r = await guard(context, () => Api.putBytes('/api/me/avatar', img.bytes, img.mime));
    if (r != null) await Session.refresh();
    if (mounted) setState(() => _uploading = false);
  }

  Future<void> _pickBirth() async {
    final now = DateTime.now();
    final last = DateTime(now.year - 18, now.month, now.day);
    final d = await showDatePicker(
      context: context,
      initialDate: _birth ?? DateTime(now.year - 25, 1, 1),
      firstDate: DateTime(now.year - 100),
      lastDate: last,
      helpText: 'Doğum günü',
      initialEntryMode: DatePickerEntryMode.calendarOnly,
    );
    if (d != null) setState(() => _birth = d);
  }

  Future<void> _pickCountry() async {
    final c = await showModalBottomSheet<Country>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Pal.bg,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => const _CountrySheet(),
    );
    if (c != null) setState(() => _country = c);
  }

  String _fmtDate(DateTime d) => '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';

  Future<void> _submit() async {
    final name = _name.text.trim();
    final pw = _password.text;
    String? err;
    if (name.isEmpty) {
      err = 'Takma adını yaz.';
    } else if (_gender == null) {
      err = 'Cinsiyetini seç.';
    } else if (_birth == null) {
      err = 'Doğum gününü seç.';
    } else if (!_hasPassword && pw.isNotEmpty && pw.length < 6) {
      err = 'Şifre en az 6 karakter olmalı (ya da boş bırak).';
    }
    if (err != null) {
      toast(context, err, error: true);
      return;
    }
    final b = _birth!;
    setState(() => _busy = true);
    final r = await guard(
      context,
      () => Api.patch('/api/me', {
        'displayName': name,
        'gender': _gender,
        'birthDate': '${b.year.toString().padLeft(4, '0')}-${b.month.toString().padLeft(2, '0')}-${b.day.toString().padLeft(2, '0')}',
        'countryCode': _country.code,
        'country': _country.name,
        if (!_hasPassword && pw.isNotEmpty) 'password': pw,
        'setupDone': true,
      }),
    );
    if (!mounted) return;
    if (r == null) {
      setState(() => _busy = false);
      return;
    }
    await Session.refresh();
    if (mounted) Navigator.of(context).pop(true);
  }

  // ---------------- görünüm ----------------
  InputDecoration _field(String hint, {Widget? suffix}) => InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Pal.textDim),
        filled: true,
        fillColor: Pal.surface,
        counterText: '',
        contentPadding: const EdgeInsets.symmetric(horizontal: 22, vertical: 18),
        suffixIcon: suffix,
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(30), borderSide: const BorderSide(color: Pal.outline, width: 1.4)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(30), borderSide: const BorderSide(color: Pal.cyan, width: 1.6)),
      );

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 22, 4, 10),
        child: Text(t, style: const TextStyle(color: Pal.text, fontSize: 16, fontWeight: FontWeight.w800)),
      );

  Widget _pill({required Widget child, required VoidCallback onTap}) => Material(
        color: Pal.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30), side: const BorderSide(color: Pal.outline, width: 1.4)),
        child: InkWell(
          customBorder: RoundedRectangleBorder(borderRadius: BorderRadius.circular(30)),
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 17), child: child),
        ),
      );

  Widget _genderOption(String value, String label, IconData icon) {
    final sel = _gender == value;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _gender = value),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.symmetric(vertical: 13),
          decoration: BoxDecoration(
            color: sel ? Pal.cyan.withValues(alpha: 0.14) : Pal.surface,
            borderRadius: BorderRadius.circular(30),
            border: Border.all(color: sel ? Pal.cyan : Pal.outline, width: sel ? 1.8 : 1.4),
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(sel ? Icons.check_circle : Icons.circle_outlined, size: 20, color: sel ? Pal.cyan : Pal.textDim),
            const SizedBox(width: 8),
            Icon(icon, size: 18, color: sel ? Pal.text : Pal.textDim),
            const SizedBox(width: 4),
            Text(label, style: TextStyle(color: sel ? Pal.text : Pal.textDim, fontSize: 15, fontWeight: FontWeight.w700)),
          ]),
        ),
      ),
    );
  }

  Widget _avatar() {
    final url = Api.absoluteUrl(_me['avatarUrl']?.toString());
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final src = _name.text.trim().isNotEmpty ? _name.text.trim() : (_me['displayName'] ?? '').toString().trim();
    final letter = src.isEmpty ? '?' : src.characters.first.toUpperCase();
    return Column(children: [
      GestureDetector(
        onTap: _uploading ? null : _pickPhoto,
        child: Stack(alignment: Alignment.center, children: [
          Container(
            width: 132,
            height: 132,
            padding: const EdgeInsets.all(4),
            decoration: const BoxDecoration(shape: BoxShape.circle, gradient: LinearGradient(colors: kGoldLight, begin: Alignment.topLeft, end: Alignment.bottomRight)),
            child: ClipOval(
              child: url != null
                  ? Image(image: NetImage(url, targetW: NetImage.px(124, dpr), targetH: NetImage.px(124, dpr)), fit: BoxFit.cover)
                  : Container(
                      color: Pal.surfaceHi,
                      alignment: Alignment.center,
                      child: Text(letter, style: const TextStyle(color: Pal.gold, fontSize: 56, fontWeight: FontWeight.w900)),
                    ),
            ),
          ),
          Positioned(
            right: 4,
            bottom: 4,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: Pal.cyan, shape: BoxShape.circle, border: Border.all(color: Pal.bg, width: 3)),
              child: const Icon(Icons.photo_camera, size: 18, color: Pal.onBright),
            ),
          ),
          if (_uploading)
            const SizedBox(width: 132, height: 132, child: CircularProgressIndicator(strokeWidth: 3, color: Pal.cyan)),
        ]),
      ),
      const SizedBox(height: 12),
      const Text('Profil fotoğrafı yükle', style: TextStyle(color: Pal.text, fontSize: 17, fontWeight: FontWeight.w800)),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false, // kayıt bitmeden geri dönülmez
      child: Scaffold(
        backgroundColor: Pal.bg,
        body: Stack(children: [
          // Üstte hafif altın ışık (ekran görüntüsündeki degrade, uygulama renginde).
          const Positioned(
            left: -80,
            right: -80,
            top: -160,
            height: 420,
            child: DecoratedBox(decoration: BoxDecoration(gradient: RadialGradient(colors: [Color(0x40F2B92A), Color(0x00F2B92A)]))),
          ),
          SafeArea(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(22, 18, 22, 28),
              children: [
                _avatar(),
                _label('Takma ad'),
                TextField(
                  controller: _name,
                  maxLength: 30,
                  style: const TextStyle(color: Pal.text, fontSize: 16),
                  textInputAction: TextInputAction.done,
                  onChanged: (_) => setState(() {}),
                  decoration: _field('Adını yaz'),
                ),
                _label('Cinsiyet'),
                Row(children: [
                  _genderOption('male', 'Erkek', Icons.male),
                  const SizedBox(width: 12),
                  _genderOption('female', 'Kadın', Icons.female),
                ]),
                _label('Doğum günü'),
                _pill(
                  onTap: _pickBirth,
                  child: Row(children: [
                    Expanded(
                      child: Text(_birth == null ? 'Doğum gününü seç' : _fmtDate(_birth!), style: TextStyle(color: _birth == null ? Pal.textDim : Pal.text, fontSize: 16)),
                    ),
                    const Icon(Icons.keyboard_arrow_down_rounded, color: Pal.textDim),
                  ]),
                ),
                if (!_hasPassword) ...[
                  _label('Giriş şifresi'),
                  TextField(
                    controller: _password,
                    obscureText: !_showPassword,
                    maxLength: 72,
                    style: const TextStyle(color: Pal.text, fontSize: 16),
                    decoration: _field(
                      'Şifre belirle',
                      suffix: IconButton(
                        onPressed: () => setState(() => _showPassword = !_showPassword),
                        icon: Icon(_showPassword ? Icons.visibility_outlined : Icons.visibility_off_outlined, color: Pal.textDim),
                      ),
                    ),
                  ),
                  const Padding(
                    padding: EdgeInsets.fromLTRB(6, 8, 6, 0),
                    child: Text('*Şifre en az 6 karakter olmalı. İstersen boş bırakabilirsin.', style: TextStyle(color: Pal.gold, fontSize: 13)),
                  ),
                ],
                _label('Ülke'),
                _pill(
                  onTap: _pickCountry,
                  child: Row(children: [
                    Text(_country.flag, style: const TextStyle(fontSize: 22)),
                    const SizedBox(width: 10),
                    Expanded(child: Text('${_country.name}  (${_country.code}) ${_country.dial}', style: const TextStyle(color: Pal.text, fontSize: 16))),
                    const Icon(Icons.arrow_drop_down, color: Pal.textDim),
                  ]),
                ),
                const SizedBox(height: 34),
                SizedBox(
                  height: 56,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(30),
                      gradient: const LinearGradient(colors: kGoldLight, begin: Alignment.topCenter, end: Alignment.bottomCenter),
                      boxShadow: const [BoxShadow(color: Color(0x55F2B92A), blurRadius: 16, offset: Offset(0, 6))],
                    ),
                    child: Material(
                      color: Colors.transparent,
                      child: InkWell(
                        borderRadius: BorderRadius.circular(30),
                        onTap: _busy ? null : _submit,
                        child: Center(
                          child: _busy
                              ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2.6, color: Pal.onBright))
                              : const Text('Devam et', style: TextStyle(color: Pal.onBright, fontSize: 18, fontWeight: FontWeight.w900)),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

/// Ülke seçimi: arama + bayrak + telefon kodu.
class _CountrySheet extends StatefulWidget {
  const _CountrySheet();

  @override
  State<_CountrySheet> createState() => _CountrySheetState();
}

class _CountrySheetState extends State<_CountrySheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final q = _q.trim().toLowerCase();
    final list = q.isEmpty
        ? kCountries
        : kCountries.where((c) => c.name.toLowerCase().contains(q) || c.code.toLowerCase() == q || c.dial.contains(q)).toList();
    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.8,
      child: Column(children: [
        const SizedBox(height: 8),
        Container(width: 38, height: 4, decoration: BoxDecoration(color: Pal.outline, borderRadius: BorderRadius.circular(2))),
        const Padding(
          padding: EdgeInsets.fromLTRB(20, 14, 20, 8),
          child: Align(alignment: Alignment.centerLeft, child: Text('Ülke seç', style: TextStyle(color: Pal.text, fontSize: 20, fontWeight: FontWeight.w900))),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _q = v),
            style: const TextStyle(color: Pal.text),
            decoration: InputDecoration(
              hintText: 'Ülke ara',
              hintStyle: const TextStyle(color: Pal.textDim),
              prefixIcon: const Icon(Icons.search, color: Pal.textDim),
              filled: true,
              fillColor: Pal.surface,
              isDense: true,
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Pal.outline)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: const BorderSide(color: Pal.cyan)),
            ),
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: list.length,
            itemBuilder: (_, i) {
              final c = list[i];
              return ListTile(
                leading: Text(c.flag, style: const TextStyle(fontSize: 26)),
                title: Text(c.name, style: const TextStyle(color: Pal.text, fontWeight: FontWeight.w600)),
                trailing: Text(c.dial, style: const TextStyle(color: Pal.gold, fontWeight: FontWeight.w700)),
                onTap: () => Navigator.pop(context, c),
              );
            },
          ),
        ),
      ]),
    );
  }
}
