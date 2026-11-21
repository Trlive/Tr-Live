// Web paneli ve uygulama içi (WebView) sayfaları için çeviri. Anahtar Türkçe kaynak metindir (uygulamadaki tx() ile aynı).
// Dil: adresteki ?lang= (uygulama gönderir) → bu sekmede saklanan → tarayıcı dili → Türkçe.
import en from "./i18n/en.json";
import ar from "./i18n/ar.json";
import hi from "./i18n/hi.json";

export type Lang = "tr" | "en" | "ar" | "hi";
const DICTS: Record<Exclude<Lang, "tr">, Record<string, string>> = { en, ar, hi };
const KEY = "trlive.lang";
let current: Lang | null = null;

const valid = (v: unknown): v is Lang => v === "tr" || v === "en" || v === "ar" || v === "hi";

export function lang(): Lang {
  if (current) return current;
  if (typeof window === "undefined") return "tr";
  try {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (valid(q)) {
      window.sessionStorage.setItem(KEY, q);
      current = q;
      return q;
    }
    const s = window.sessionStorage.getItem(KEY);
    if (valid(s)) {
      current = s;
      return s;
    }
  } catch {
    /* gizli sekme */
  }
  current = "tr";
  return current;
}

export const isRtl = () => lang() === "ar";

/** Metni seçili dile çevirir. args: {ad} biçimindeki yer tutucular. */
export function t(tr: string, args?: Record<string, string | number | null | undefined>): string {
  const l = lang();
  let s = l === "tr" ? tr : DICTS[l][tr] ?? DICTS.en[tr] ?? tr;
  if (args) for (const [k, v] of Object.entries(args)) s = s.split(`{${k}}`).join(String(v ?? ""));
  return s;
}

/** Tarih / sayı biçimi için yerel ayar. */
export function locale(): string {
  return { tr: "tr-TR", en: "en-GB", ar: "ar", hi: "hi-IN" }[lang()];
}
