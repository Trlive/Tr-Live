// Çözümlenmemiş tanımlayıcı denetimi (ayrıştırıcı olmadan, temkinli):
// Her dosyada kullanılan büyük/küçük harfli adların, dosyada import edilen ya da herhangi bir yerde
// tanımlanan adlar arasında olup olmadığına bakar. Yanlış alarm vermemek için yerel olabilecek her
// şeyi (parametre, const, let, function, catch, destructuring) toplar.
import { readFileSync } from 'node:fs';
const GLOBALS = new Set(['console','process','JSON','Math','Date','Object','Array','String','Number','Boolean','BigInt','Promise','Error','Map','Set','RegExp','Buffer','URL','URLSearchParams','TextEncoder','TextDecoder','globalThis','undefined','null','true','false','NaN','Infinity','setTimeout','setInterval','clearTimeout','clearInterval','fetch','structuredClone','AbortController','Symbol','WeakMap','Intl','parseInt','parseFloat','isNaN','encodeURIComponent','decodeURIComponent','require','module','exports','__dirname','__filename','import','export','this','arguments','await','async','function','return','const','let','var','if','else','for','while','try','catch','finally','throw','new','typeof','instanceof','delete','in','of','class','extends','super','yield','do','switch','case','default','break','continue','void','static','get','set','from','as']);
let bad = 0;
for (const f of process.argv.slice(2)) {
  const s = readFileSync(f, 'utf8');
  const defined = new Set(GLOBALS);
  // import'lar
  for (const m of s.matchAll(/import\s+([^;]+?)\s+from/g)) {
    const spec = m[1];
    const br = spec.match(/\{([^}]*)\}/);
    if (br) for (const p of br[1].split(',')) { const t = p.trim().split(/\s+as\s+/).pop().trim(); if (t) defined.add(t); }
    const lead = spec.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
    for (const t of lead.split(/\s+/)) if (t && t !== '*' && t !== 'as') defined.add(t);
  }
  // her türlü bağlama: const/let/var/function/class/parametre/catch/destructuring
  for (const m of s.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
  for (const m of s.matchAll(/([A-Za-z_$][\w$]*)\s*(?:,\s*[A-Za-z_$][\w$]*\s*)*=>/g)) defined.add(m[1]);
  for (const m of s.matchAll(/\(([^)]*)\)\s*=>/g)) for (const p of m[1].split(',')) { const t = p.trim().replace(/[=:].*/, '').replace(/[{}\[\].]/g, '').trim(); if (/^[A-Za-z_$][\w$]*$/.test(t)) defined.add(t); }
  for (const m of s.matchAll(/function\s*\w*\s*\(([^)]*)\)/g)) for (const p of m[1].split(',')) { const t = p.trim().replace(/[=:].*/, '').trim(); if (/^[A-Za-z_$][\w$]*$/.test(t)) defined.add(t); }
  for (const m of s.matchAll(/(?:const|let|var)\s*[{\[]([^}\]]*)[}\]]/g)) for (const p of m[1].split(',')) { const t = p.trim().split(':').pop().split('=')[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(t)) defined.add(t); }
  for (const m of s.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) defined.add(m[1]);
  // kullanılan adlar: nokta/özellik adı ve dize içi olmayanlar
  const stripped = s.replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, '""').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of stripped.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)(?![\w$])/g)) {
    const n = m[1];
    if (defined.has(n)) continue;
    // nesne anahtarı (n:) ya da etiket değil
    const after = stripped.slice(m.index + n.length, m.index + n.length + 2);
    if (/^\s*:/.test(after)) continue;
    console.log(`${f}: ÇÖZÜMLENMEMİŞ "${n}"`);
    bad++;
  }
}
console.log(bad === 0 ? 'çözümlenmemiş ad yok' : `${bad} çözümlenmemiş ad`);
