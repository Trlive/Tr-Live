import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';

/**
 * Küçük SMTP gönderici (ek paket gerektirmez). Brevo, Gmail (uygulama şifresi), Yandex, Zoho vb. ile çalışır.
 * secure=true → 465 (doğrudan TLS); secure=false → 587 (STARTTLS zorunlu; sunucu desteklemezse gönderilmez).
 * Yalnızca düz metin + basit HTML gövdeli tek alıcılı ileti gönderir (doğrulama kodları için yeterli).
 */
export async function sendMail(smtp, { to, subject, text, html }, { timeoutMs = 20000, allowPlain = false } = {}) {
  const host = String(smtp?.host ?? '').trim();
  const port = Number(smtp?.port) || (smtp?.secure ? 465 : 587);
  const user = String(smtp?.user ?? '');
  const pass = String(smtp?.pass ?? '');
  const from = String(smtp?.from || user).trim();
  if (!host || !from) throw new Error('SMTP ayarları eksik.');
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(extractAddr(from)) || !/^[^\s@<>]+@[^\s@<>]+$/.test(to)) throw new Error('Geçersiz e-posta adresi.');

  let sock = smtp.secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port });
  sock.setTimeout(timeoutMs);
  const conn = new LineReader(sock);
  try {
    await once(sock, smtp.secure ? 'secureConnect' : 'connect');
    await expect(conn, 220);
    const helo = `EHLO ${os.hostname().replace(/[^A-Za-z0-9.-]/g, '') || 'trlive'}`;
    let caps = await command(conn, helo, 250);
    if (!smtp.secure) {
      if (/STARTTLS/i.test(caps)) {
        await command(conn, 'STARTTLS', 220);
        conn.detach();
        sock = tls.connect({ socket: sock, servername: host });
        sock.setTimeout(timeoutMs);
        await once(sock, 'secureConnect');
        conn.attach(sock);
        caps = await command(conn, helo, 250);
      } else if (!allowPlain) {
        throw new Error('SMTP sunucusu şifreli bağlantıyı (STARTTLS) desteklemiyor.');
      }
    }
    if (user) {
      if (/AUTH[^\n]*PLAIN/i.test(caps)) {
        await command(conn, `AUTH PLAIN ${Buffer.from(`\u0000${user}\u0000${pass}`).toString('base64')}`, 235);
      } else {
        await command(conn, 'AUTH LOGIN', 334);
        await command(conn, Buffer.from(user).toString('base64'), 334);
        await command(conn, Buffer.from(pass).toString('base64'), 235);
      }
    }
    await command(conn, `MAIL FROM:<${extractAddr(from)}>`, 250);
    await command(conn, `RCPT TO:<${to}>`, [250, 251]);
    await command(conn, 'DATA', 354);
    const body = buildMessage({ from, to, subject, text, html });
    await command(conn, `${body}\r\n.`, 250);
    await command(conn, 'QUIT', 221).catch(() => {});
  } finally {
    sock.destroy();
  }
}

function extractAddr(from) {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
const b64Lines = (s) => Buffer.from(s).toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();

/** RFC 5322 ileti (UTF-8, base64 gövde). "." ile başlayan satırlar base64'te oluşmaz. */
export function buildMessage({ from, to, subject, text, html }) {
  const m = /^(.*)<([^>]+)>\s*$/.exec(from);
  const fromHeader = m ? `${encodeWord(m[1].trim().replace(/^"|"$/g, ''))} <${m[2].trim()}>` : from;
  const boundary = `trlive_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const head = [
    `From: ${fromHeader}`,
    `To: <${to}>`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${boundary}@${extractAddr(from).split('@')[1] ?? 'trlive'}>`,
    'MIME-Version: 1.0',
  ];
  if (!html) {
    return [...head, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Lines(text ?? '')].join('\r\n');
  }
  return [
    ...head,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Lines(text ?? ''),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64Lines(html),
    `--${boundary}--`,
  ].join('\r\n');
}

/** SMTP yanıtlarını satır satır okur (çok satırlı "250-..." yanıtları birleştirir). */
class LineReader {
  constructor(sock) { this.buf = ''; this.waiters = []; this.lines = []; this.err = null; this.attach(sock); }
  attach(sock) {
    this.sock = sock;
    this.onData = (d) => { this.buf += d.toString('utf8'); this.pump(); };
    this.onErr = (e) => { this.err = e; this.flushErr(); };
    this.onTimeout = () => { this.err = new Error('SMTP zaman aşımı.'); this.flushErr(); sock.destroy(); };
    this.onClose = () => { if (!this.err) { this.err = new Error('SMTP bağlantısı kapandı.'); this.flushErr(); } };
    sock.on('data', this.onData); sock.on('error', this.onErr); sock.on('timeout', this.onTimeout); sock.on('close', this.onClose);
  }
  detach() {
    const s = this.sock;
    s.off('data', this.onData); s.off('error', this.onErr); s.off('timeout', this.onTimeout); s.off('close', this.onClose);
  }
  pump() {
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      this.lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const all = this.lines.join('\n');
        this.lines = [];
        const w = this.waiters.shift();
        if (w) w.resolve(all); else this.pending = all;
      }
    }
  }
  flushErr() { while (this.waiters.length) this.waiters.shift().reject(this.err); }
  read() {
    if (this.pending) { const p = this.pending; this.pending = null; return Promise.resolve(p); }
    if (this.err) return Promise.reject(this.err);
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
  write(s) { this.sock.write(`${s}\r\n`); }
}

async function expect(conn, codes) {
  const res = await conn.read();
  const code = Number(res.slice(0, 3));
  const ok = Array.isArray(codes) ? codes.includes(code) : code === codes;
  if (!ok) throw new Error(`SMTP hatası: ${res.split('\n').pop()}`);
  return res;
}

async function command(conn, line, codes) {
  conn.write(line);
  return expect(conn, codes);
}

const once = (emitter, ev) => new Promise((resolve, reject) => {
  const ok = () => { emitter.off('error', bad); resolve(); };
  const bad = (e) => { emitter.off(ev, ok); reject(e); };
  emitter.once(ev, ok);
  emitter.once('error', bad);
});
