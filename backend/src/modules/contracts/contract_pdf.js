// Onaylanmış sözleşmenin PDF kopyası (bağımlılık yok, saf fonksiyon, test edilebilir).
//
// Neden kendi yazıcımız: PDF kütüphanesi + Türkçe karakterli TTF font eklemek, imaj boyutunu ve bağımlılık yüzeyini büyütür.
// PDF'in standart 14 fontundan Courier, Türkçe harflerin hepsini (ğ ş ı İ Ğ Ş ç ö ü) içerir; kodlama tablosunda bunlara yer
// açmak (Differences) yeterlidir. Sabit genişlikli olduğu için satır kırma da kesin hesaplanır.
//
// Belgenin kendisi değiştirilemez değildir (PDF düzenlenebilir); bütünlüğü veritabanındaki SHA-256 özetiyle kanıtlanır:
// contract_acceptances.pdf_sha256 ve metnin özeti (rendered_sha256) belgenin içinde de yazılıdır.

const FONT_SIZE = 9;
const LEADING = 11.5;
const MARGIN_X = 42;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 48;
const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
// Courier: her karakter 0,6 em.
export const CHARS_PER_LINE = Math.floor((PAGE_W - 2 * MARGIN_X) / (FONT_SIZE * 0.6));
const LINES_PER_PAGE = Math.floor((PAGE_H - MARGIN_TOP - MARGIN_BOTTOM) / LEADING) - 2; // 2 satır alt bilgi

// WinAnsi'de olmayan Türkçe harfler 128–133 kodlarına yerleştirilir (Differences).
const TR = { 'Ğ': 128, 'ğ': 129, 'İ': 130, 'ı': 131, 'Ş': 132, 'ş': 133 };
const DIFFERENCES = '[128 /Gbreve /gbreve /Idotaccent /dotlessi /Scedilla /scedilla]';
const FALLBACK = {
  '–': '-', '—': '-', '‒': '-', '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '•': '-', '●': '*', '→': '->', '←': '<-',
  '…': '...', ' ': ' ', '₺': 'TL', '≤': '<=', '≥': '>=', '×': 'x',
};

/** Metni PDF bayt dizisine çevirir: Türkçe harfler özel kodlara, Latin-1 olduğu gibi, diğerleri yaklaşığına ya da '?'. */
export function encodeText(s) {
  const out = [];
  for (const ch of String(s)) {
    if (TR[ch] !== undefined) { out.push(TR[ch]); continue; }
    const f = FALLBACK[ch];
    if (f !== undefined) { for (const c of f) out.push(c.charCodeAt(0)); continue; }
    const code = ch.codePointAt(0);
    if (code === 9) { out.push(32, 32); continue; }
    if (code >= 32 && code <= 126) { out.push(code); continue; }
    if (code >= 160 && code <= 255) { out.push(code); continue; }
    out.push(63); // ?
  }
  return out;
}

/** PDF metin dizesi: ( ) \ kaçışlı, 128 üstü sekizlik. */
function pdfString(bytes) {
  let s = '(';
  for (const b of bytes) {
    if (b === 40 || b === 41 || b === 92) s += `\\${String.fromCharCode(b)}`;
    else if (b < 32 || b > 126) s += `\\${b.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(b);
  }
  return `${s})`;
}

/** Markdown'ı düz metne indirger (başlık işaretleri, kalın/kod işaretleri, alıntı). Satır yapısı korunur. */
export function plainText(md) {
  return String(md)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s?/, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/`([^`]*)`/g, '$1'))
    .join('\n');
}

/** Satırları sözcük sınırından kırar; tek başına uzun sözcük bölünür. Girintili madde satırları girintisini korur. */
export function wrapLines(text, width = CHARS_PER_LINE) {
  const out = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if ([...line].length <= width) { out.push(line); continue; }
    const indent = /^(\s*(?:[-*]|\d+[.)]|[a-zğüşıöç]\))?\s*)/i.exec(line)[1].replace(/\S/g, ' ');
    let cur = '';
    for (const word of line.split(/(\s+)/)) {
      if (!word) continue;
      if ([...(cur + word)].length <= width) { cur += word; continue; }
      if (cur.trim()) out.push(cur.replace(/\s+$/, ''));
      cur = /^\s+$/.test(word) ? indent : indent + word;
      while ([...cur].length > width) {
        const chars = [...cur];
        out.push(chars.slice(0, width).join(''));
        cur = indent + chars.slice(width).join('');
      }
    }
    if (cur.trim()) out.push(cur.replace(/\s+$/, ''));
  }
  return out;
}

/**
 * header: başlıkta gösterilecek [etiket, değer] çiftleri; body: sözleşme metni (Markdown); footer: her sayfanın altında.
 * Dönüş: Buffer (geçerli PDF 1.4).
 */
export function buildContractPdf({ title, header = [], body, footer = '', createdAt = new Date() }) {
  const lines = [];
  lines.push(...wrapLines(String(title).toLocaleUpperCase('tr-TR')));
  lines.push('');
  for (const [k, v] of header) lines.push(...wrapLines(`${k}: ${v}`));
  lines.push('-'.repeat(CHARS_PER_LINE));
  lines.push('');
  lines.push(...wrapLines(plainText(body)));

  const pages = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));
  if (!pages.length) pages.push([]);

  const objects = []; // index 0 → nesne 1
  const add = (s) => { objects.push(s); return objects.length; };
  const catalogId = add(null);
  const pagesId = add(null);
  const fontId = add(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${DIFFERENCES} >> >>`);
  const pageIds = [];
  pages.forEach((pageLines, i) => {
    let content = `BT /F1 ${FONT_SIZE} Tf ${LEADING} TL ${MARGIN_X} ${(PAGE_H - MARGIN_TOP).toFixed(2)} Td\n`;
    for (const l of pageLines) content += `${pdfString(encodeText(l))} Tj T*\n`;
    content += 'ET\n';
    const foot = `${footer}${footer ? '  ·  ' : ''}Sayfa ${i + 1}/${pages.length}`;
    content += `BT /F1 7 Tf ${MARGIN_X} ${(MARGIN_BOTTOM - 22).toFixed(2)} Td ${pdfString(encodeText(foot))} Tj ET\n`;
    const bytes = Buffer.from(content, 'latin1');
    const contentId = add(`<< /Length ${bytes.length} >>\nstream\n${content}endstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const d = new Date(createdAt);
  const pdfDate = `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
  // Belge bilgisi (başlık) yazı tipini değil PDF'in kendi kodlamasını kullanır: Unicode (UTF-16BE, BOM ile) yazılır.
  const utf16 = (str) => `<FEFF${[...String(str)].map((ch) => {
    const cp = ch.codePointAt(0);
    const hex = (n) => n.toString(16).toUpperCase().padStart(4, '0');
    if (cp <= 0xffff) return hex(cp);
    const v = cp - 0x10000;
    return hex(0xd800 + (v >> 10)) + hex(0xdc00 + (v & 0x3ff));
  }).join('')}>`;
  const infoId = add(`<< /Title ${utf16(title)} /Producer (TR LIVE) /CreationDate (${pdfDate}) >>`);

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
