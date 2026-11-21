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
  • Kullanılmayan değişken / ölü kod uyarıları""")

sys.exit(1 if problems else 0)
