#!/usr/bin/env python3
"""Bir Dart dosyasındaki sınıf üyelerini listeler.

Niçin: room_screen.dart tek bir 5.191 satırlık State sınıfı. Böyle bir dosyayı bölerken en büyük
tehlike, bir metodun ya da alanın sessizce kaybolması / adının değişmesidir. Dart derleyicisi bu
ortamda yok; bu araç, taşıma öncesi ve sonrası üye listesini karşılaştırmak için üretiyor.

Backend tarafındaki route_map.mjs ile aynı fikir: taşıma dosyayı değiştirir, API yüzeyini değil.

    python3 tools/dart_members.py lib/screens/room_screen.dart > /tmp/before.txt
    ... taşıma ...
    python3 tools/dart_members.py lib/screens/room_screen.dart lib/screens/room/*.dart > /tmp/after.txt
    diff /tmp/before.txt /tmp/after.txt
"""
import re
import sys

# Dize ve yorumları temizler: içlerindeki süslü parantez ve 'class' kelimeleri sayımı bozar.
def strip_noise(src: str) -> str:
    out = []
    i, n = 0, len(src)
    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            i = n if j < 0 else j
        elif c == '/' and i + 1 < n and src[i + 1] == '*':
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


# Üye YALNIZCA sınıf gövdesinin ilk seviyesinde (2 boşluk) olur. Daha derin girintiler metot
# gövdesindeki yerel değişkenlerdir; onları üye saymak, bir metot gövdesi değişince envanterin
# sahte fark üretmesine yol açar (araç gürültü üretirse kimse bakmaz).
MEMBER = re.compile(
    r'^\s{2}(?!\s)'                               # tam iki boşluk girinti
    r'(?:@\w+\s+)*'                               # ek açıklamalar
    r'(?:static\s+|final\s+|const\s+|late\s+|covariant\s+)*'
    r'(?:[\w<>,\[\]?\s\.]+?\s+)?'                 # dönüş tipi (varsa)
    r'(get\s+|set\s+)?'
    r'(\w+)'                                      # ad
    r'\s*(\(|=|;|=>|\{)'                          # imza başlangıcı
)

KEYWORDS = {'return', 'if', 'for', 'while', 'switch', 'case', 'await', 'yield', 'throw',
            'else', 'try', 'catch', 'finally', 'do', 'new', 'const', 'final', 'var', 'assert',
            'break', 'continue', 'super', 'this', 'in', 'is', 'as'}


def members(path: str):
    src = strip_noise(open(path, encoding='utf-8').read())
    out = []
    cls = None
    depth = 0      # sınıf gövdesindeki süslü parantez derinliği
    for line in src.split('\n'):
        m = re.match(r'^(?:abstract\s+)?(class|mixin|enum|extension)\s+(\w+)', line)
        if m:
            cls = m.group(2)
            depth = 0
        before = depth   # satırın KENDİ süslü parantezi sayılmadan önceki derinlik:
                         # "void foo() {" satırı üyenin kendisidir, gövdesi değil.
        if cls:
            depth += line.count('{') - line.count('}')
            if depth <= 0 and '}' in line and '{' not in line:
                cls = None
                continue
        # depth 1 = sınıf gövdesinin ilk seviyesi. Metot gövdesinin içindeyken (depth > 1)
        # eşleşme aranmaz.
        mm = MEMBER.match(line) if before <= 1 else None
        if mm and cls:
            name = mm.group(2)
            if name in KEYWORDS:
                continue
            kind = (mm.group(1) or '').strip() or ('method' if mm.group(3) == '(' else 'field')
            out.append(f'{cls}.{name} [{kind}]')
    return out


if __name__ == '__main__':
    seen = set()
    for p in sys.argv[1:]:
        for m in members(p):
            seen.add(m)
    for m in sorted(seen):
        print(m)
