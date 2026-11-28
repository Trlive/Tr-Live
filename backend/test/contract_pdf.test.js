import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeText, wrapLines, plainText, buildContractPdf, CHARS_PER_LINE } from '../src/modules/contracts/contract_pdf.js';
import { renderContract, sha256 } from '../src/modules/contracts/contracts.service.js';

test('Türkçe harfler özel kodlara, Latin-1 olduğu gibi, diğerleri yaklaşığına', () => {
  assert.deepEqual(encodeText('ğşıİĞŞ'), [129, 133, 131, 130, 128, 132]);
  assert.deepEqual(encodeText('çöüÇÖÜ'), [0xe7, 0xf6, 0xfc, 0xc7, 0xd6, 0xdc]);
  assert.deepEqual(encodeText('–→'), [45, 45, 62]);
  assert.deepEqual(encodeText('😀'), [63]);
});

test('satır kırma: genişliği aşmaz, sözcük bölmez, madde girintisini korur', () => {
  const long = `a) ${'kelime '.repeat(40)}`;
  const lines = wrapLines(long, 30);
  assert.ok(lines.every((l) => [...l].length <= 30));
  assert.ok(lines.slice(1).every((l) => l.startsWith('   ')), 'girinti');
  assert.deepEqual(wrapLines('x'.repeat(65), 30).map((l) => l.length), [30, 30, 5], 'tek uzun sözcük bölünür');
  assert.ok(CHARS_PER_LINE >= 80);
});

test('markdown düz metne iner', () => {
  assert.equal(plainText('## MADDE 1\n**kalın** ve `kod`\n> alıntı'), 'MADDE 1\nkalın ve kod\nalıntı');
});

test('PDF yapısı: başlık, sayfa sayısı, xref ofsetleri doğru', () => {
  const pdf = buildContractPdf({ title: 'Deneme', body: 'satır\n'.repeat(200), footer: 'YAY-000001' });
  const s = pdf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const xref = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.equal(s.slice(xref, xref + 4), 'xref');
  // Her nesnenin xref'teki ofseti gerçekten "N 0 obj" başlangıcını gösterir.
  const offs = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offs.forEach((o, i) => assert.equal(s.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  assert.ok(/\/Count (\d+)/.exec(s)[1] >= 3, '200 satır birden çok sayfa');
});

test('kişiye metin deterministik: aynı girdi aynı özet, taraf değişince özet değişir', () => {
  const template = { title: 'T', version: '1.0', sha256: 'a'.repeat(64), body: 'Metin '.repeat(30) };
  const user = { id: 'u1', username: 'ali', display_name: 'Ali', public_id: '12345678', phone: '+905551112233' };
  const a = renderContract({ kind: 'broadcaster', template, user, relation: { extra: [] }, company: '' });
  const b = renderContract({ kind: 'broadcaster', template, user, relation: { extra: [] }, company: '' });
  assert.equal(sha256(a), sha256(b));
  const c = renderContract({ kind: 'broadcaster', template, user: { ...user, display_name: 'Veli' }, relation: { extra: [] }, company: '' });
  assert.notEqual(sha256(a), sha256(c));
  assert.match(a, /Yayıncı adı: Ali/);
  assert.match(a, /Madde 1\.1'de belirtilen işletmeci/, 'şirket belli değilken');
});
