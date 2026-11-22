"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { inputCls } from "@/shared/components/ui";
import { btnDanger, btnGhost, btnOk } from "@/shared/components/kit";

/**
 * Sayfa içi onay ve metin kutusu — tarayıcının `window.confirm` / `window.prompt`
 * kutularının yerine.
 *
 * NEDEN VAR: Ajans ve Yayıncı Merkezi sayfaları uygulamanın İÇİNDE WebView'de açılıyor.
 * Orada `window.confirm` çağırmak Android'in kendi kutusunu açıyor ve kutunun başlığında
 * sunucu adresi yazıyor:
 *
 *     "https://130-61-222-48.sslip.io" adresindeki sayfada şunlar belirtiliyor:
 *
 * Kullanıcıya altyapı adresi gösterilmemeli; hem çirkin hem de sunucuyu ele veriyor.
 * Ayrıca tarayıcı kutusu uygulamanın temasına hiç benzemiyor ve WebView'de tüm olayları
 * bloke ediyor.
 *
 * KULLANIM:
 *
 *   const { ask, askText, confirmNode } = useConfirm();
 *   ...
 *   if (!(await ask({ title: "Silinsin mi?", danger: true }))) return;
 *   ...
 *   return <div>{...}{confirmNode}</div>;   // node'u render etmeyi UNUTMA
 *
 * `ask` → true/false. `askText` → girilen metin, iptalde null (boş metin "" olabilir).
 */

type Req = {
  title: string;
  body?: ReactNode;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Metin girişi istenirse (askText). */
  input?: { label?: string; placeholder?: string; optional?: boolean; maxLength?: number };
};

export function useConfirm() {
  const [req, setReq] = useState<Req | null>(null);
  const [value, setValue] = useState("");
  // Açık kutunun sözünü tutan çözümleyici. Kutu kapanırken MUTLAKA çağrılır, yoksa
  // `await ask(...)` sonsuza kadar bekler ve düğme sonsuza kadar "işleniyor" kalır.
  const resolve = useRef<((v: unknown) => void) | null>(null);

  const finish = useCallback((out: unknown) => {
    const r = resolve.current;
    resolve.current = null;
    setReq(null);
    setValue("");
    r?.(out);
  }, []);

  const open = useCallback((r: Req) => {
    // Üst üste iki kutu açılırsa öncekini iptal olarak kapat: bekleyen söz kalmasın.
    resolve.current?.(r.input ? null : false);
    setValue("");
    setReq(r);
    return new Promise<unknown>((res) => {
      resolve.current = res;
    });
  }, []);

  const ask = useCallback(async (r: Omit<Req, "input">) => (await open(r)) === true, [open]);
  const askText = useCallback(
    async (r: Req & { input: NonNullable<Req["input"]> }) => {
      const out = await open(r);
      return typeof out === "string" ? out : null;
    },
    [open],
  );

  const confirmNode = req ? (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={req.title}
      onClick={(e) => {
        // Yalnızca karartmaya tıklayınca kapat; kutunun içine tıklamak kapatmasın.
        if (e.target === e.currentTarget) finish(req.input ? null : false);
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-[#30291e] bg-[#15120c] p-5 shadow-2xl"
        onKeyDown={(e) => {
          if (e.key === "Escape") finish(req.input ? null : false);
          // Çok satırlı metinde Enter'ı yemeyelim; tek satır ve onayda Enter = tamam.
          if (e.key === "Enter" && !e.shiftKey) {
            const ok = req.input ? (req.input.optional || value.trim().length > 0) : true;
            if (ok) finish(req.input ? value : true);
          }
        }}
      >
        <div className="text-base font-semibold text-white">{req.title}</div>
        {req.body && <div className="mt-2 text-sm leading-relaxed text-gray-400">{req.body}</div>}
        {req.input && (
          <div className="mt-4">
            {req.input.label && <div className="mb-1 text-xs text-gray-500">{req.input.label}</div>}
            <input
              className={inputCls}
              autoFocus
              value={value}
              maxLength={req.input.maxLength ?? 300}
              placeholder={req.input.placeholder}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={btnGhost} onClick={() => finish(req.input ? null : false)}>
            {req.cancelLabel ?? "Vazgeç"}
          </button>
          <button
            type="button"
            className={req.danger ? btnDanger : btnOk}
            autoFocus={!req.input}
            disabled={!!req.input && !req.input.optional && value.trim().length === 0}
            onClick={() => finish(req.input ? value : true)}
          >
            {req.okLabel ?? "Onayla"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { ask, askText, confirmNode };
}
