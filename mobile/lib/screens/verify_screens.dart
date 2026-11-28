import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../data/countries.dart';
import '../l10n/l10n.dart';
import '../services/api.dart';
import '../services/phone_verify.dart';
import '../services/session.dart';
import '../widgets/app_theme.dart';
import '../widgets/common.dart';

/// Doğrulama ekranları (uygulama renkleri: koyu zemin + altın):
///  - [verifyPhone]: SMS kodu (Firebase) → sunucuya gönderilecek kimlik token'ı.
///  - [linkPhone]: giriş yapmış kullanıcının telefonunu doğrulayıp hesaba bağlar.
///  - [EmailVerifyScreen]: e-posta ekleme / doğrulama (6 haneli kod, sunucu gönderir).
///  - [ForgotPasswordScreen]: şifremi unuttum (SMS ya da e-posta kodu ile yeni şifre).

/// SMS kodu ekranını açar; doğrulanırsa Firebase kimlik token'ını döndürür (vazgeçilirse null).
Future<String?> verifyPhone(BuildContext context, String phoneE164) => Navigator.of(context).push<String>(
      MaterialPageRoute(builder: (_) => PhoneCodeScreen(phone: phoneE164)),
    );

/// Telefon numarası sorar (ülke kodu seçilebilir), SMS ile doğrular ve hesaba bağlar. Başarılıysa true.
Future<bool> linkPhone(BuildContext context) async {
  final phone = await askPhone(context, title: tx('Telefon numaranı doğrula'));
  if (phone == null || !context.mounted) return false;
  final token = await verifyPhone(context, phone);
  if (token == null || !context.mounted) return false;
  final r = await guard(context, () => Api.post('/api/verify/phone/link', {'idToken': token}));
  if (r == null || !context.mounted) return false;
  await Session.refresh().catchError((_) {});
  if (context.mounted) toast(context, tx('Telefon numaran doğrulandı.'));
  return true;
}

/// Ülke kodu + numara sorar; uluslararası biçimde (+90555...) döndürür.
Future<String?> askPhone(BuildContext context, {required String title}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (c) => _PhoneSheet(title: title),
  );
}

class _PhoneSheet extends StatefulWidget {
  final String title;
  const _PhoneSheet({required this.title});

  @override
  State<_PhoneSheet> createState() => _PhoneSheetState();
}

class _PhoneSheetState extends State<_PhoneSheet> {
  final _num = TextEditingController();
  late Country _country = countryByCode(Session.me.value?['countryCode']?.toString()) ?? kCountries.first;
  String? _err;

  @override
  void dispose() {
    _num.dispose();
    super.dispose();
  }

  void _ok() {
    final e164 = toE164(_num.text, dial: _country.dial);
    if (e164 == null) {
      setState(() => _err = tx('Telefon numarası geçersiz.'));
      return;
    }
    Navigator.pop(context, e164);
  }

  Future<void> _pickCountry() async {
    final c = await showModalBottomSheet<Country>(
      context: context,
      backgroundColor: Pal.surface,
      showDragHandle: true,
      builder: (c) => ListView(children: [
        for (final x in kCountries)
          ListTile(
            leading: Text(x.flag, style: const TextStyle(fontSize: 22)),
            title: Text(x.label, style: const TextStyle(color: Pal.text)),
            trailing: Text(x.dial, style: const TextStyle(color: Pal.textDim)),
            onTap: () => Navigator.pop(c, x),
          ),
      ]),
    );
    if (c != null && mounted) setState(() => _country = c);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: Container(
        decoration: const BoxDecoration(color: Pal.surface, borderRadius: BorderRadius.vertical(top: Radius.circular(22)), border: Border(top: BorderSide(color: Pal.outline))),
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 18),
        child: SafeArea(
          top: false,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(widget.title, style: const TextStyle(color: Pal.cyan, fontSize: 18, fontWeight: FontWeight.w900)),
            const SizedBox(height: 6),
            Text(tx('Numarana 6 haneli bir kod göndereceğiz.'), style: const TextStyle(color: Pal.textDim, fontSize: 13)),
            const SizedBox(height: 14),
            Row(children: [
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: _pickCountry,
                child: Container(
                  height: 52,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  decoration: BoxDecoration(borderRadius: BorderRadius.circular(12), border: Border.all(color: Pal.outline)),
                  child: Row(children: [
                    Text(_country.flag, style: const TextStyle(fontSize: 20)),
                    const SizedBox(width: 6),
                    Text(_country.dial, style: const TextStyle(color: Pal.text, fontWeight: FontWeight.w700)),
                    const Icon(Icons.arrow_drop_down, color: Pal.textDim),
                  ]),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: _num,
                  autofocus: true,
                  keyboardType: TextInputType.phone,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  style: const TextStyle(color: Pal.text, fontSize: 16),
                  cursorColor: Pal.cyan,
                  onSubmitted: (_) => _ok(),
                  decoration: _input(tx('Telefon numarası'), hint: _country.code == 'TR' ? '555 123 45 67' : null),
                ),
              ),
            ]),
            if (_err != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_err!, style: const TextStyle(color: Pal.red, fontSize: 13))),
            const SizedBox(height: 16),
            GoldButton(label: tx('Kod gönder'), onTap: _ok),
          ]),
        ),
      ),
    );
  }
}

InputDecoration _input(String? label, {String? hint, Widget? prefix}) => InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: prefix,
      labelStyle: const TextStyle(color: Pal.textDim),
      hintStyle: const TextStyle(color: Color(0x66B3A584)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.outline)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.cyan, width: 1.6)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.red)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: Pal.red, width: 1.6)),
    );

/// Altın degrade ana düğme (uygulama renkleri).
class GoldButton extends StatelessWidget {
  final String label;
  final VoidCallback? onTap;
  final bool busy;
  const GoldButton({super.key, required this.label, required this.onTap, this.busy = false});

  @override
  Widget build(BuildContext context) {
    final off = onTap == null || busy;
    return SizedBox(
      height: 50,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: off ? const [Pal.outline, Pal.outline] : const [Pal.amber, Pal.cyan]),
          borderRadius: BorderRadius.circular(25),
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(25),
            onTap: off ? null : onTap,
            child: Center(
              child: busy
                  ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Pal.onBright))
                  : Text(label, style: TextStyle(color: off ? Pal.textDim : Pal.onBright, fontWeight: FontWeight.w900, fontSize: 16)),
            ),
          ),
        ),
      ),
    );
  }
}

/// 6 haneli kod alanı (büyük, aralıklı rakamlar). 6 hane girilince [onFull] çağrılır.
class CodeField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onFull;
  const CodeField({super.key, required this.controller, required this.onFull});

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: true,
      keyboardType: TextInputType.number,
      textAlign: TextAlign.center,
      maxLength: 6,
      autofillHints: const [AutofillHints.oneTimeCode],
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      style: const TextStyle(color: Pal.gold, fontSize: 30, fontWeight: FontWeight.w900, letterSpacing: 12),
      cursorColor: Pal.cyan,
      onChanged: (v) {
        if (v.length == 6) onFull(v);
      },
      decoration: _input(null, hint: '••••••').copyWith(counterText: ''),
    );
  }
}

/// SMS kodu ekranı: açılınca kodu gönderir; 6 hane girilince doğrular ve kimlik token'ıyla kapanır.
class PhoneCodeScreen extends StatefulWidget {
  final String phone;
  const PhoneCodeScreen({super.key, required this.phone});

  @override
  State<PhoneCodeScreen> createState() => _PhoneCodeScreenState();
}

class _PhoneCodeScreenState extends State<PhoneCodeScreen> {
  final _code = TextEditingController();
  String? _verificationId;
  int? _resendToken;
  String? _error;
  bool _sending = true;
  bool _checking = false;
  int _wait = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _send();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _wait = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() => _wait = _wait > 0 ? _wait - 1 : 0);
      if (_wait == 0) t.cancel();
    });
  }

  Future<void> _send() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    await Verify.sendSms(
      widget.phone,
      resendToken: _resendToken,
      language: L10n.lang.value,
      onSent: (id, token) {
        if (!mounted) return;
        setState(() {
          _verificationId = id;
          _resendToken = token;
          _sending = false;
        });
        _startTimer();
      },
      onAuto: (idToken) {
        if (mounted) Navigator.pop(context, idToken); // Android kodu kendisi okudu
      },
      onError: (m) {
        if (!mounted) return;
        setState(() {
          _error = tx(m);
          _sending = false;
          _checking = false;
        });
      },
    );
  }

  Future<void> _check(String code) async {
    final id = _verificationId;
    if (id == null || _checking || code.length != 6) return;
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      final token = await Verify.confirmCode(id, code);
      if (mounted) Navigator.pop(context, token);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _checking = false;
        _error = tx('Kod hatalı. Tekrar dene.');
        _code.clear();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: AppBar(backgroundColor: Pal.bg, title: Text(tx('SMS doğrulama'))),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(22, 18, 22, 22), children: [
          const Center(child: CircleAvatar(radius: 34, backgroundColor: Pal.surfaceHi, child: Icon(Icons.sms_outlined, color: Pal.cyan, size: 34))),
          const SizedBox(height: 16),
          Text(
            _sending ? tx('Kod gönderiliyor…') : tx('{phone} numarasına gönderilen 6 haneli kodu yaz.', {'phone': widget.phone}),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Pal.text, fontSize: 15, height: 1.4),
          ),
          const SizedBox(height: 22),
          CodeField(controller: _code, onFull: _check),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 10), child: Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Pal.red))),
          const SizedBox(height: 18),
          GoldButton(label: tx('Doğrula'), busy: _checking || _sending, onTap: _verificationId == null ? null : () => _check(_code.text)),
          const SizedBox(height: 10),
          TextButton(
            onPressed: _wait > 0 || _sending ? null : _send,
            child: Text(_wait > 0 ? tx('Yeni kod {n} sn sonra', {'n': _wait}) : tx('Kodu tekrar gönder'), style: TextStyle(color: _wait > 0 ? Pal.textDim : Pal.cyan)),
          ),
        ]),
      ),
    );
  }
}

/// E-posta ekleme / doğrulama (giriş yapmış kullanıcı). Başarılıysa true ile kapanır.
class EmailVerifyScreen extends StatefulWidget {
  final String? current;
  const EmailVerifyScreen({super.key, this.current});

  @override
  State<EmailVerifyScreen> createState() => _EmailVerifyScreenState();
}

class _EmailVerifyScreenState extends State<EmailVerifyScreen> {
  late final _email = TextEditingController(text: widget.current ?? '');
  final _code = TextEditingController();
  bool _sent = false;
  bool _busy = false;
  int _wait = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _wait = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      setState(() => _wait = _wait > 0 ? _wait - 1 : 0);
      if (_wait == 0) t.cancel();
    });
  }

  Future<void> _send() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      toast(context, tx('Geçerli bir e-posta adresi girin.'), error: true);
      return;
    }
    setState(() => _busy = true);
    final r = await guard(context, () => Api.post('/api/verify/email/send', {'email': email, 'lang': L10n.lang.value}));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (r != null) _sent = true;
    });
    if (r != null) {
      _startTimer();
      toast(context, tx('Kod e-postana gönderildi. Gelen kutunu ve spam klasörünü kontrol et.'));
    }
  }

  Future<void> _confirm(String code) async {
    if (_busy || code.length != 6) return;
    setState(() => _busy = true);
    final r = await guard(context, () => Api.post('/api/verify/email/confirm', {'email': _email.text.trim(), 'code': code}));
    if (!mounted) return;
    setState(() => _busy = false);
    if (r == null) {
      _code.clear();
      return;
    }
    await Session.refresh().catchError((_) {});
    if (!mounted) return;
    toast(context, tx('E-posta adresin doğrulandı.'));
    Navigator.pop(context, true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: AppBar(backgroundColor: Pal.bg, title: Text(tx('E-posta doğrulama'))),
      body: SafeArea(
        child: ListView(padding: const EdgeInsets.fromLTRB(22, 18, 22, 22), children: [
          const Center(child: CircleAvatar(radius: 34, backgroundColor: Pal.surfaceHi, child: Icon(Icons.mark_email_read_outlined, color: Pal.cyan, size: 34))),
          const SizedBox(height: 16),
          Text(tx('E-postana 6 haneli bir kod göndereceğiz. Şifreni unutursan bu adresle sıfırlayabilirsin.'),
              textAlign: TextAlign.center, style: const TextStyle(color: Pal.textDim, fontSize: 14, height: 1.4)),
          const SizedBox(height: 20),
          TextField(
            controller: _email,
            enabled: !_sent,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            style: const TextStyle(color: Pal.text, fontSize: 16),
            cursorColor: Pal.cyan,
            decoration: _input(tx('E-posta adresi'), prefix: const Icon(Icons.alternate_email, color: Pal.amber)),
          ),
          const SizedBox(height: 14),
          if (!_sent)
            GoldButton(label: tx('Kod gönder'), busy: _busy, onTap: _send)
          else ...[
            CodeField(controller: _code, onFull: _confirm),
            const SizedBox(height: 14),
            GoldButton(label: tx('Doğrula'), busy: _busy, onTap: () => _confirm(_code.text)),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              TextButton(
                onPressed: _busy ? null : () => setState(() => _sent = false),
                child: Text(tx('Adresi değiştir'), style: const TextStyle(color: Pal.textDim)),
              ),
              TextButton(
                onPressed: _wait > 0 || _busy ? null : _send,
                child: Text(_wait > 0 ? tx('Yeni kod {n} sn sonra', {'n': _wait}) : tx('Kodu tekrar gönder'), style: TextStyle(color: _wait > 0 ? Pal.textDim : Pal.cyan)),
              ),
            ]),
          ],
        ]),
      ),
    );
  }
}

/// Şifremi unuttum: SMS (Firebase) ya da e-posta kodu ile yeni şifre. Sunucuda açık olan yöntemler gösterilir.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  bool _loading = true;
  bool _phoneOn = false;
  bool _emailOn = false;
  String _mode = 'phone'; // phone | email
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _pass = TextEditingController();
  final _pass2 = TextEditingController();
  String? _phoneToken; // SMS doğrulandıktan sonra
  String? _phone;
  bool _emailSent = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_email, _code, _pass, _pass2]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final p = await Verify.phoneOn();
    final e = await Verify.emailOn();
    if (!mounted) return;
    setState(() {
      _phoneOn = p;
      _emailOn = e;
      _mode = p ? 'phone' : 'email';
      _loading = false;
    });
  }

  Future<void> _verifyPhone() async {
    final phone = await askPhone(context, title: tx('Hesabındaki telefon numarası'));
    if (phone == null || !mounted) return;
    final t = await verifyPhone(context, phone);
    if (t == null || !mounted) return;
    setState(() {
      _phone = phone;
      _phoneToken = t;
    });
  }

  Future<void> _sendEmail() async {
    final email = _email.text.trim();
    if (!email.contains('@')) {
      toast(context, tx('Geçerli bir e-posta adresi girin.'), error: true);
      return;
    }
    setState(() => _busy = true);
    final r = await guard(context, () => Api.post('/api/verify/reset/email/send', {'email': email, 'lang': L10n.lang.value}));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (r != null) _emailSent = true;
    });
    if (r != null) toast(context, tx('Bu adres bir hesaba bağlıysa kod gönderildi. Gelen kutunu ve spam klasörünü kontrol et.'));
  }

  Future<void> _save() async {
    if (_pass.text.length < 8) {
      toast(context, tx('Şifre en az 8 karakter olmalı.'), error: true);
      return;
    }
    if (_pass.text != _pass2.text) {
      toast(context, tx('Şifreler aynı değil.'), error: true);
      return;
    }
    setState(() => _busy = true);
    final r = await guard(
      context,
      () => _mode == 'phone'
          ? Api.post('/api/verify/reset/phone', {'idToken': _phoneToken, 'password': _pass.text})
          : Api.post('/api/verify/reset/email', {'email': _email.text.trim(), 'code': _code.text.trim(), 'password': _pass.text}),
    );
    if (!mounted) return;
    setState(() => _busy = false);
    if (r == null) return;
    toast(context, tx('Şifren değişti. Yeni şifrenle giriş yapabilirsin.'));
    Navigator.pop(context, true);
  }

  Widget _tab(String id, IconData icon, String label) {
    final sel = _mode == id;
    return Expanded(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => setState(() => _mode = id),
        child: Container(
          height: 46,
          decoration: BoxDecoration(
            color: sel ? Pal.surfaceHi : Pal.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: sel ? Pal.cyan : Pal.outline, width: sel ? 1.6 : 1),
          ),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(icon, color: sel ? Pal.cyan : Pal.textDim, size: 20),
            const SizedBox(width: 6),
            Text(label, style: TextStyle(color: sel ? Pal.cyan : Pal.textDim, fontWeight: FontWeight.w800)),
          ]),
        ),
      ),
    );
  }

  List<Widget> _passwordFields() => [
        const SizedBox(height: 14),
        TextField(controller: _pass, obscureText: true, style: const TextStyle(color: Pal.text), cursorColor: Pal.cyan, decoration: _input(tx('Yeni şifre (en az 8 karakter)'), prefix: const Icon(Icons.lock_outline, color: Pal.amber))),
        const SizedBox(height: 12),
        TextField(controller: _pass2, obscureText: true, style: const TextStyle(color: Pal.text), cursorColor: Pal.cyan, decoration: _input(tx('Yeni şifre (tekrar)'), prefix: const Icon(Icons.lock_outline, color: Pal.amber))),
        const SizedBox(height: 16),
        GoldButton(label: tx('Şifreyi değiştir'), busy: _busy, onTap: _save),
      ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Pal.bg,
      appBar: AppBar(backgroundColor: Pal.bg, title: Text(tx('Şifremi unuttum'))),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: Pal.cyan))
            : ListView(padding: const EdgeInsets.fromLTRB(22, 18, 22, 22), children: [
                if (!_phoneOn && !_emailOn)
                  Text(tx('Şifre sıfırlama şu an kullanılamıyor. Müşteri hizmetlerine yazabilirsin.'), style: const TextStyle(color: Pal.textDim, height: 1.4))
                else ...[
                  if (_phoneOn && _emailOn)
                    Row(children: [
                      _tab('phone', Icons.sms_outlined, tx('SMS ile')),
                      const SizedBox(width: 10),
                      _tab('email', Icons.alternate_email, tx('E-posta ile')),
                    ]),
                  const SizedBox(height: 18),
                  if (_mode == 'phone') ...[
                    Text(tx('Hesabına bağlı telefon numarasını SMS koduyla doğrula, sonra yeni şifreni belirle.'), style: const TextStyle(color: Pal.textDim, height: 1.4)),
                    const SizedBox(height: 14),
                    if (_phoneToken == null)
                      GoldButton(label: tx('Telefonu doğrula'), onTap: _verifyPhone)
                    else ...[
                      Row(children: [
                        const Icon(Icons.check_circle, color: Pal.green),
                        const SizedBox(width: 8),
                        Expanded(child: Text(tx('{phone} doğrulandı.', {'phone': _phone ?? ''}), style: const TextStyle(color: Pal.text))),
                      ]),
                      ..._passwordFields(),
                    ],
                  ] else ...[
                    Text(tx('Hesabında doğrulanmış e-posta adresine kod göndereceğiz.'), style: const TextStyle(color: Pal.textDim, height: 1.4)),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _email,
                      enabled: !_emailSent,
                      keyboardType: TextInputType.emailAddress,
                      style: const TextStyle(color: Pal.text),
                      cursorColor: Pal.cyan,
                      decoration: _input(tx('E-posta adresi'), prefix: const Icon(Icons.alternate_email, color: Pal.amber)),
                    ),
                    const SizedBox(height: 14),
                    if (!_emailSent)
                      GoldButton(label: tx('Kod gönder'), busy: _busy, onTap: _sendEmail)
                    else ...[
                      CodeField(controller: _code, onFull: (_) {}),
                      ..._passwordFields(),
                    ],
                  ],
                ],
              ]),
      ),
    );
  }
}
