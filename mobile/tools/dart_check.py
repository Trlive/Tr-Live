#!/usr/bin/env python3
"""Dart için yerel ön denetim — `flutter analyze` olmadan yakalanabilecekler.

Bu ortamda Dart derleyicisi yok. Ama CI'da çıkan hataların bir kısmı derleyici gerektirmiyordu:

* **Tanımsız ad** — `WebViewPolicy` kullanılıyor ama import yok. (room_tek_dock.dart:65)
  Sebebi: satır numarasıyla kör silme yapılmış ve yanlış satır silinmişti.
* **Kullanılmayan import** — `media_cache.dart`, `foundation.dart`. Kod değişince kalan artık.
* **Tip uyuşmazlığı** — `List<int>` verilip `Set<int>` beklenen yer. (room_screen.dart:552)
  Bunun tamamı derleyici işi; buradaki sürüm yalnızca BİLİNEN imzalarla karşılaştırır.

Amaç `flutter analyze`'ın yerini almak DEĞİL — onun yakaladığı ucuz hataları, ona gitmeden
önce yakalamak. Kör noktası açıkça yazılıdır (aşağıda).

    python3 tools/dart_check.py
"""
import re
import sys
import pathlib

LIB = pathlib.Path(__file__).resolve().parent.parent / 'lib'
TEST = pathlib.Path(__file__).resolve().parent.parent / 'test'

problems = []


def strip(src: str) -> str:
    """Dize ve yorumları boşlukla değiştirir (içlerindeki adlar kullanım sayılmasın)."""
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == '/' and src[i:i + 2] == '//':
            j = src.find('\n', i)
            i = n if j < 0 else j
        elif c == '/' and src[i:i + 2] == '/*':
            j = src.find('*/', i + 2)
            i = n if j < 0 else j + 2
        elif c in '"\'':
            triple = src[i:i + 3] in ('"""', "'''")
            q = src[i:i + 3] if triple else c
            j = i + len(q)
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j:j + len(q)] == q:
                    j += len(q)
                    break
                j += 1
            out.append(' ' * (j - i))
            i = j
        else:
            out.append(c)
            i += 1
    return ''.join(out)


def strip_keep_interp(src: str) -> str:
    """Yorumları ve dizeleri siler AMA dize icindeki $ad / ${...} ifadelerini KORUR.

    strip() dize icini tamamen siliyor. Kullanilmayan alan denetimi onunla yapilinca
    '$_prefix$screen' gibi interpolasyonlarda gecen alanlar "hic okunmuyor" sanildi:
    11 bulgunun 10'u sahteydi. Dart'ta interpolasyon KODDUR; silinmemeli.
    """
    out, i, n = [], 0, len(src)
    while i < n:
        c = src[i]
        if c == '/' and src[i:i + 2] == '//':
            j = src.find(chr(10), i)
            j = n if j < 0 else j
            out.append(' ' * (j - i))
            i = j
        elif c == '/' and src[i:i + 2] == '/*':
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            out.append(' ' * (j - i))
            i = j
        elif c == '"' or c == "'":
            triple = src[i:i + 3] in ('"' * 3, "'" * 3)
            q = src[i:i + 3] if triple else c
            j = i + len(q)
            out.append(' ' * len(q))
            while j < n:
                if src[j] == '\\':
                    out.append('  ')
                    j += 2
                    continue
                if src[j:j + len(q)] == q:
                    out.append(' ' * len(q))
                    j += len(q)
                    break
                if src[j] == '$':
                    if j + 1 < n and src[j + 1] == '{':
                        depth, k = 0, j + 1
                        while k < n:
                            if src[k] == '{':
                                depth += 1
                            elif src[k] == '}':
                                depth -= 1
                                if depth == 0:
                                    k += 1
                                    break
                            k += 1
                        out.append(src[j:k])
                        j = k
                        continue
                    k = j + 1
                    while k < n and (src[k].isalnum() or src[k] == '_'):
                        k += 1
                    out.append(src[j:k])
                    j = k
                    continue
                out.append(' ')
                j += 1
            i = j
        else:
            out.append(c)
            i += 1
    return ''.join(out)


# Her dosyanın tanımladığı üst düzey adlar (sınıf, enum, mixin, extension, üst düzey işlev/sabit)
# ÜST DÜZEY tanım = satır başında, GİRİNTİSİZ. Girintiyi de eşleştiren bir desen, gövdedeki
# widget çağrılarını (`SizedBox(...)`) tanım sanar ve araç yanlış alarm üretir — ki yanlış alarm
# üreten araca kimse bakmaz, yani olmamasından beterdir. İlk sürümde tam bu oldu: 24 sahte uyarı.
TOP = re.compile(r'^(?:abstract |final |sealed |base |interface )*'
                 r'(?:class|mixin|enum|extension|typedef)\s+(\w+)', re.M)
# Parametre listesi ÇOK SATIRLI olabilir (`Future<void> showBirthdaySheet(\n  ...`).
# İlk sürüm tek satır varsayıyordu ve bu işlevleri "tanımsız" sanıp sahte uyarı üretiyordu.
# Jenerik işlevler de (`Future<T?> guard<T>(...)`) addan sonra <T> alır.
TOP_FN = re.compile(r'^(?![ \t])(?:[\w<>,\[\]?.]+(?:[ \t]+[\w<>,\[\]?.]+)*[ \t]+)?(\w+)(?:<[^<>()]*>)?[ \t]*\((?:[^()]|\([^()]*\))*\)[\s\w]*?[{=]', re.M | re.S)
TOP_VAR = re.compile(r'^(?![ \t])(?:const|final|late)\s+(?:[\w<>,\[\]?.]+\s+)?(\w+)\s*=', re.M)

defines = {}          # dosya -> tanımladığı adlar
files = sorted(list(LIB.rglob('*.dart')) + list(TEST.rglob('*.dart')))
for p in files:
    s = strip(p.read_text(encoding='utf-8'))
    names = set(TOP.findall(s)) | set(TOP_FN.findall(s)) | set(TOP_VAR.findall(s))
    defines[p] = names

IMPORT = re.compile(r"^import\s+'([^']+)'(?:\s+as\s+(\w+))?(?:\s+show\s+([^;]+))?;", re.M)
EXPORT = re.compile(r"^export\s+'([^']+)'(?:\s+show\s+([^;]+))?;", re.M)


def exported(path, seen=None):
    """Bir dosyanın sağladığı TÜM adlar: kendi tanımları + `export` ile yeniden açtıkları.

    Bunu takip etmemek yanlış alarm üretiyordu: `common.dart` içinde `export 'net_image.dart';`
    var, yani onu import eden dosya `NetImg`e erişiyor. Araç bunu görmeyince 30'dan fazla sahte
    "import edilmemiş" uyarısı verdi.
    """
    seen = seen if seen is not None else set()
    if path in seen or path not in defines:
        return set()
    seen.add(path)
    names = set(defines[path])
    try:
        src = path.read_text(encoding='utf-8')
    except OSError:
        return names
    for m in EXPORT.finditer(src):
        spec, show = m.group(1), m.group(2)
        if spec.startswith('dart:') or spec.startswith('package:'):
            continue
        sub = exported((path.parent / spec).resolve(), seen)
        # `export 'x.dart' show Foo;` yalnızca Foo'yu açar — hepsini saymak yanlış olurdu,
        # saymamak ise sahte uyarı üretirdi (ilk sürümde CropSpec'te tam bu oldu).
        names |= {n.strip() for n in show.split(',')} if show else sub
    return names

for p in files:
    raw = p.read_text(encoding='utf-8')
    code = strip(raw)
    body = IMPORT.sub('', code)  # import satırları kullanım sayılmaz

    imported = {}   # ad -> import yolu
    for m in IMPORT.finditer(raw):
        spec, alias, show = m.group(1), m.group(2), m.group(3)
        if spec.startswith('package:tr_live/'):
            # Kendi paketimiz: proje dosyasıdır, lib/ altına çözülür. Testler bu biçimi kullanıyor
            # ve çözmezsek her test dosyası sahte "import edilmemiş" uyarısı üretir.
            target = (LIB / spec[len('package:tr_live/'):]).resolve()
        elif spec.startswith('dart:') or spec.startswith('package:'):
            # Dış paketlerin hangi adı getirdiğini bilmiyoruz: yalnızca ön ekli (as) ve
            # show'lu olanlar denetlenebilir.
            if alias:
                imported[alias] = spec
            elif show:
                for nm in show.split(','):
                    imported[nm.strip()] = spec
            continue
        else:
            target = (p.parent / spec).resolve()
        if not target.exists():
            problems.append(f'{p}: import yok → {spec}')
            continue
        if alias:
            imported[alias] = spec
        else:
            for nm in exported(target):
                imported[nm] = spec

    # 1) Kullanılmayan yerel import
    by_spec = {}
    for nm, spec in imported.items():
        by_spec.setdefault(spec, []).append(nm)
    for spec, names in by_spec.items():
        if spec.startswith('dart:') or spec.startswith('package:'):
            continue
        if not any(re.search(r'\b' + re.escape(nm) + r'\b', body) for nm in names):
            problems.append(f'{p}: kullanılmayan import → {spec}')

    # 2) Tanımsız ad: büyük harfle başlayan tip adı kullanılıyor ama ne burada ne import'ta var.
    local = defines[p]
    known = set(imported) | local
    for m in re.finditer(r'\b([A-Z][A-Za-z0-9_]{2,})\b\s*(?=\.|\()', body):
        nm = m.group(1)
        if nm in known:
            continue
        # Flutter/Dart çekirdeği ve paketlerden gelenler bilinemez: yalnızca PROJE içinde
        # tanımlı ama bu dosyaya import EDİLMEMİŞ adları bildiririz. Böylece yanlış alarm olmaz.
        owners = [f for f, ns in defines.items() if nm in ns and f != p]
        if owners:
            line = body[:m.start()].count('\n') + 1
            problems.append(f'{p}:{line}: "{nm}" kullanılıyor ama import edilmemiş '
                            f'(tanımı: {owners[0].relative_to(LIB.parent)})')

# ---------------------------------------------------------------------------
# Tanımsız FONKSİYON çağrısı (küçük harfle başlayan çıplak çağrılar)
# ---------------------------------------------------------------------------
#
# NEDEN: `showSnack(context, ...)` yazdım. Öyle bir fonksiyon YOK — doğrusu `toast`.
# Yukarıdaki tanımsız-ad denetimi yalnızca BÜYÜK harfle başlayan tip adlarına bakıyordu,
# üstelik yalnızca "projede tanımlı ama import edilmemiş" olanları bildiriyordu. Hiçbir
# yerde tanımlı olmayan bir ad, tasarım gereği görünmezdi. CI'da `flutter analyze` yakaladı
# ve APK derlemesi durdu.
#
# Bunun yanlış alarmsız yapılabileceğini ÖLÇEREK doğruladım: depodaki 1373 farklı çıplak
# çağrıdan yalnızca 17'si projede tanımsız ve bunların 10'u Flutter/Dart'ın kendi
# fonksiyonu. Geri kalan 7'si tarayıcının kaçırdığı yerel kapanış/parametre adları.
#
# BU DENETİMİN GÖREMEDİĞİ: nesne üzerinden çağrılar (`x.foo()`), paketlerden gelen ve
# aşağıdaki listede olmayan üst düzey fonksiyonlar (yeni biri kullanılırsa listeye eklenir).

# Dart/Flutter'ın üst düzey fonksiyonları. Proje dışından gelirler, tanımları depoda yoktur.
SDK_FUNCS = {
    'applyBoxFit', 'axisDirectionToAxis', 'compute', 'createTicker', 'jsonDecode', 'jsonEncode',
    'min', 'max', 'showDatePicker', 'showTimePicker', 'showLicensePage', 'showDialog',
    'showModalBottomSheet', 'showMenu', 'showAboutDialog', 'showSearch', 'runApp', 'debugPrint',
    'test', 'group', 'expect', 'setUp', 'tearDown', 'testWidgets', 'identical', 'lerpDouble',
    # flutter_test eşleştiricileri
    'equals', 'greaterThan', 'lessThan', 'isNot', 'contains', 'isTrue', 'isFalse', 'isNull',
    'closeTo', 'anyOf', 'allOf', 'throwsA', 'predicate', 'same', 'inInclusiveRange',
    'precacheImage', 'decodeImageFromList', 'scheduleMicrotask', 'unawaited', 'base64Encode',
    'base64Decode', 'utf8', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'atan2', 'exp', 'log',
}

_DEF_PATTERNS = [
    # yöntem / üst düzey fonksiyon:  "Tip ad("  ya da "void ad("
    # Tip kısmı EN AZ BİR gerçek simge içermeli.
    #
    # İlk sürümde tip sınıfı `\s` içeriyordu ve `\s*` sıfır karakter de eşleşebildiği için
    # satır başındaki HER çağrı ("    showSnack(") tanım sanılıyordu: girinti boşlukları
    # "tip" yerine geçiyordu. Bu yüzden araç, tam da yakalaması gereken uydurma fonksiyon
    # adını "tanımlı" sayıp sessizce geçiyordu.
    re.compile(r'(?:^|\n)[ \t]*(?:@\w+\s*)*(?:static\s+|external\s+|abstract\s+)*'
               r'[\w<>,\[\]\?]+[\w<>,\[\]\?\s]*?\s+([a-z_][\w]*)\s*\('),
    # kapanış / değişken:  "final ad =", "var ad =", "const ad ="
    re.compile(r'\b(?:var|final|const|late)\s+(?:[\w<>,\[\]\?]+\s+)?([a-z_][\w]*)\s*='),
    # adlandırılmış parametre olarak verilen kapanış:  "ad: (" 
    re.compile(r'\b([a-z_][\w]*)\s*:\s*\('),
    # parametre listesindeki adlar:  "(Tip ad", ", Tip ad", "{Tip ad", "required Tip ad"
    re.compile(r'[(,{]\s*(?:required\s+)?(?:final\s+)?[\w<>,\[\]\?]+\s+([a-z_][\w]*)\s*[,){=]'),
    # alan:  "this.ad"
    re.compile(r'\bthis\.([a-z_][\w]*)'),
    # Gövdesi olan fonksiyon tanımı: satır `{` ya da `=>` ile bitiyor.
    #
    # Bu, PARANTEZLİ dönüş tiplerini yakalamak için gerekli:
    #   (String, Color, int) securityLevel(Map<String, dynamic> p) {
    #   static ({String title, String artist}) parseName(String fileName) {
    #   Future<({int added, int skipped, String? error})> addTracksToRoom(...) async {
    # Bunlarda dönüş tipi parantez içeriyor, bu yüzden "Tip ad(" kalıbı tutmuyordu.
    # `[^=;]*?` atamaları dışarıda tutuyor (`final x = foo(...) ...` tanım değildir).
    re.compile(r'(?m)^\s*(?!if\b|for\b|while\b|switch\b|catch\b|return\b|await\b)'
               r'[^=;\n]*\b([a-z_][\w]*)\s*\([^;\n]*\)\s*(?:async\s*\*?\s*)?(?:\{|=>)'),
    # Virgül / parantez / süslü parantez ÖNÜNDE geçen her ad.
    #
    # Bu kasıtlı olarak GENİŞ: parametre adlarını (`ValueChanged<String> onSel)`,
    # `Future<void> Function() job)`) ve kapanışları yakalamak için. Çağrı argümanlarını
    # da "tanımlı" sayıyor; bu bir MİSS üretir ama YANLIŞ ALARM üretmez. Yanlış alarm
    # veren araç, hiç araç olmamasından kötüdür — eksik yakalayan ise yine de değerlidir.
    #
    # Aranan hata buradan kaçamaz: uydurulmuş bir fonksiyon adı yalnızca `ad(` biçiminde
    # geçer, hiçbir zaman `ad,` ya da `ad)` biçiminde geçmez.
    re.compile(r'\b([a-z_][\w]*)\s*[,)}\]]'),
]

_known_funcs = set(SDK_FUNCS)
for _f in files:
    _src = strip(_f.read_text(encoding='utf-8'))
    for _re in _DEF_PATTERNS:
        for _m in _re.finditer(_src):
            _known_funcs.add(_m.group(1))

_KEYWORDS = {
    'if', 'for', 'while', 'switch', 'catch', 'return', 'await', 'assert', 'print', 'super',
    'this', 'new', 'case', 'do', 'else', 'in', 'is', 'as', 'set', 'get', 'void', 'final',
    'const', 'var', 'rethrow', 'throw', 'yield', 'typedef', 'extends', 'with', 'on', 'when',
    # Değiştiriciler: "static ({...}) parseName(" satırında "static (" çağrı sanılıyordu.
    'static', 'external', 'abstract', 'factory', 'operator', 'late', 'required', 'covariant',
    # Üst sınıftan MİRAS ALINAN yöntemler. Çıplak çağrılırlar ve tanımları Flutter'da
    # olduğu için depoda görünmezler. Bu araç sınıf hiyerarşisini izlemiyor; miras alınan
    # yeni bir yöntem kullanılırsa buraya eklenmesi gerekir (görünür bir yanlış alarmla).
    'notifyListeners', 'setState', 'markNeedsBuild', 'didChangeDependencies', 'deactivate',
    'initState', 'dispose', 'createState', 'build', 'didUpdateWidget', 'reassemble',
}
_CALL_RE = re.compile(r'(?:^|[^.\w$\'"])([a-z][\w]*)\s*\(', re.M)

for _f in files:
    _raw = _f.read_text(encoding='utf-8')
    _src = strip(_raw)
    for _m in _CALL_RE.finditer(_src):
        _n = _m.group(1)
        if _n in _KEYWORDS or _n in _known_funcs:
            continue
        _line = _src[:_m.start()].count('\n') + 1
        problems.append(
            f'{_f}:{_line}: "{_n}(...)" diye bir fonksiyon YOK (ne projede ne de bilinen '
            f'Dart/Flutter işlevlerinde) → flutter analyze HATA verir, APK derlenmez'
        )

# ---- Hiçbir yerden çağrılmayan dosyalar ----
#
# `flutter analyze` kullanılmayan IMPORT'u görür, kullanılmayan DOSYAYI görmez.
# v2.147.1'de böyle iki dosya bulundu: biri Ludo oyununun uygulama içi sürümüydü
# (418 satır) ve "oyunlar kodlarda olmayacak" kuralına aykırı olarak kodda duruyordu.
# Ölü dosya yalnızca yer kaplamaz: bakarken gerçek sanılır, satılan kodun içinde gider.
import os as _os
from pathlib import Path
_imported = set()
for _f in files:
    _d = _f.parent
    for _m in re.finditer(r"""(?:import|export)\s+'([^']+)'""", _f.read_text(encoding='utf-8')):
        _spec = _m.group(1)
        if _spec.startswith('package:tr_live/'):
            _imported.add((LIB / _spec[len('package:tr_live/'):]).resolve())
        elif not _spec.startswith(('package:', 'dart:')):
            _imported.add(Path(_os.path.normpath(_d / _spec)).resolve())
for _f in sorted(files):
    # Test dosyalarını kimse import etmez; onlar ölü değildir.
    if _f.name == 'main.dart' or str(TEST) in str(_f) or _f.resolve() in _imported:
        continue
    _n = len(_f.read_text(encoding='utf-8').split('\n'))
    problems.append(f'{_f}: hiçbir yerden çağrılmıyor ({_n} satır) — ölü dosya')

# ---- Hiç OKUNMAYAN özel alan (unused_field) ----
#
# `flutter analyze` bunu "warning: The value of the field '_x' isn't used" diye bildirir ve
# CI'ı kırar. v2.148.0'da SDUI ekranında `_loading` alanı dört kez YAZILIP hiç OKUNMAMIŞTI;
# bu araç göremediği için hata ancak CI'da çıktı.
#
# Ölçüt analyze ile aynı: yazmak kullanmak değildir. Bir alan yalnızca atama sol tarafında
# geçiyorsa okunmuyordur ve gereksizdir.
# Satır bazlı ve iç içe niceleyicisiz: tip kısmında boşluk sınıfı geçmiyor.
# İlk sürüm `(?:[\w<>,\s?\[\]]+?\s+)?` kullanıyordu ve room_format.dart'ta
# katastrofik geri izlemeye girip aracı KİLİTLİYORDU — denetim hiç bitmiyordu.
_FIELD = re.compile(r'^[ \t]{2,}(?:(?:static|late|final|const|covariant)[ \t]+)*'
                    r'(?:[A-Za-z_][\w<>,?\[\]]*[ \t]+)?(_[A-Za-z]\w*)[ \t]*(?:=(?![=>])|;)')
for _f in sorted(files):
    _code = strip_keep_interp(_f.read_text(encoding='utf-8'))
    _lines = _code.split('\n')
    # Okuma sayımı için tüm adların konumlarını BİR KEZ çıkar (alan başına dosya taramak yerine).
    _uses = {}
    # Önceki karakterde $ DIŞLANMAZ: Dart'ta '$_prefix' interpolasyonu alanın OKUNMASIDIR.
    # Dışlandığında 11 bulgunun 7'si sahte çıkmıştı.
    # $ ne önde ne ARKADA dışlanır: '$_prefix$screen' iki interpolasyon yan yanadır ve
    # ikisi de okumadır. Arkadaki $ dışlandığında bu kullanımlar görünmez kalıyordu.
    for _u in re.finditer(r'(?<![\w])(_[A-Za-z]\w*)(?![\w])', _code):
        _uses.setdefault(_u.group(1), []).append(_u)
    for _i, _l in enumerate(_lines):
        _m = _FIELD.match(_l)
        if not _m:
            continue
        _name = _m.group(1)
        _declPos = sum(len(x) + 1 for x in _lines[:_i]) + _m.start(1)
        _reads = 0
        for _u in _uses.get(_name, []):
            if _u.start() == _declPos:
                continue  # bildirimin kendisi
            # Yalnızca atama SOL TARAFI ise okuma değildir: `_x = 1` yazmadır,
            # `_x == 1`, `_x => 1`, `_x += 1` okumadır.
            if re.match(r'[ \t]*=(?![=>])', _code[_u.end():_u.end() + 3]):
                continue
            _reads += 1
        if _reads == 0:
            problems.append(f'{_f}:{_i + 1}: "{_name}" alanı hiç OKUNMUYOR (yalnızca yazılıyor) — flutter analyze bunu hata sayar')

# ---- Hiç kullanılmayan özel metot (unused_element) ----
#
# `flutter analyze` bunu da hata sayar (CI uyarıları hata kabul ediyor). Alan denetimiyle
# aynı mantık; burada okuma/yazma ayrımı gerekmez: metodun adı başka hiçbir yerde geçmiyorsa
# kullanılmıyordur.
_METHOD = re.compile(r'^[ \t]*(?:(?:static|final|const|external|@override)[ \t]+)*'
                     r'(?:[A-Za-z_][\w<>,?\[\]]*[ \t]+)?(_[A-Za-z]\w*)(?:<[^<>]*>)?[ \t]*\(')
for _f in sorted(files):
    _code = strip_keep_interp(_f.read_text(encoding='utf-8'))
    _lines = _code.split('\n')
    _uses = {}
    for _u in re.finditer(r'(?<![\w])(_[A-Za-z]\w*)(?![\w])', _code):
        _uses.setdefault(_u.group(1), []).append(_u.start())
    for _i, _l in enumerate(_lines):
        _m = _METHOD.match(_l)
        if not _m:
            continue
        # Gerçekten gövdesi olan bir bildirim mi (çağrı değil)?
        if not re.search(r'\)[\s\w]*[{=]', '\n'.join(_lines[_i:_i + 6])):
            continue
        _name = _m.group(1)
        _pos = sum(len(x) + 1 for x in _lines[:_i]) + _m.start(1)
        if not [o for o in _uses.get(_name, []) if o != _pos]:
            problems.append(f'{_f}:{_i + 1}: "{_name}" metodu hiç kullanılmıyor — flutter analyze bunu hata sayar')

# ---------------------------------------------------------------------------
# Nullable dönen yardımcıya DOĞRUDAN indeksleme.
#
# `mapOf(x)` imzası `Map<String, dynamic>?` — null dönebilir. `mapOf(x)['k']` yazmak
# flutter analyze'da hata: "The method '[]' can't be unconditionally invoked because the
# receiver can be null." CI'da derleme durur. Bu araç null güvenliğini genel olarak
# göremiyor ama bu KALIBI görebiliyor, çünkü hangi yardımcının nullable olduğu belli.
#
# Doğrusu: `mapOf(x)?['k']` ya da `(mapOf(x) ?? const <String, dynamic>{})['k']`.
NULLABLE_HELPERS = ('mapOf',)

for _f in files:
    _src = strip(_f.read_text(encoding='utf-8'))
    _lines = _src.split('\n')
    for _i, _ln in enumerate(_lines):
        for _h in NULLABLE_HELPERS:
            _at = 0
            while True:
                _at = _ln.find(_h + '(', _at)
                if _at < 0:
                    break
                # Ad bir başka adın kuyruğu olmasın (örn. "myMapOf(").
                if _at > 0 and (_ln[_at - 1].isalnum() or _ln[_at - 1] in '_$.'):
                    _at += 1
                    continue
                # Eşleşen kapanış parantezini bul.
                _d, _j = 0, _at + len(_h)
                while _j < len(_ln):
                    if _ln[_j] == '(':
                        _d += 1
                    elif _ln[_j] == ')':
                        _d -= 1
                        if _d == 0:
                            break
                    _j += 1
                if _j >= len(_ln):
                    break  # parantez satıra sığmıyor: karar vermiyoruz
                if _j + 1 < len(_ln) and _ln[_j + 1] == '[':
                    problems.append(
                        f'{_f}:{_i + 1}: "{_h}(...)[...]" — {_h} null dönebilir, '
                        f"koşulsuz indeksleme flutter analyze'da HATA. "
                        f"`{_h}(...)?[...]` ya da `({_h}(...) ?? const <String, dynamic>{{}})[...]` yaz"
                    )
                _at = _j + 1

for x in sorted(set(problems)):
    print('  - ' + str(x).replace(str(LIB.parent) + '/', ''))

print()
if problems:
    print(f'{len(set(problems))} sorun bulundu.')
else:
    print('Dart ön denetimi: tamam')

print("""
BU DENETİM ŞUNLARI YAKALAMAZ — yalnızca CI'daki `flutter analyze` görür:
  • Tip uyuşmazlıkları (List<int> ↔ Set<int> gibi)
  • Null güvenliği hataları
  • Paketlerden gelen adların yanlış kullanımı
  • Fonksiyon İÇİNDEKİ kullanılmayan yerel değişkenler

Bu araç artık şunları da görüyor (eskiden yalnızca CI görüyordu):
  • Hiç okunmayan özel ALAN   (unused_field)
  • Hiç kullanılmayan özel METOT (unused_element)
  • Hiçbir yerden çağrılmayan DOSYA — flutter analyze bunu HİÇ görmez""")

sys.exit(1 if problems else 0)
