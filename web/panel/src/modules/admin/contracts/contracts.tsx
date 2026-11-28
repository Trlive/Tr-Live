"use client";

import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { api } from "@/core/api/api";
import { useApi } from "@/core/api/use-api";
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputCls } from "@/shared/components/ui";
import { ActionMsg, Field, btnSmall, fmtRel, useAction } from "@/shared/components/kit";
import { useConfirm } from "@/shared/components/confirm";

type Kind = "broadcaster" | "agency" | "dealer";
type Template = { id: string; kind: Kind; version: string; title: string; body: string; sha256: string; publishedAt: string; publishedBy: string | null; acceptances: number };
type TemplatesRes = { kinds: { kind: Kind; title: string; prefix: string }[]; templates: Template[]; drafts: Record<Kind, string> };
type Acceptance = { id: string; contractNo: string; kind: Kind; version: string; method: string; via: string | null; phone: string | null; ip: string | null; acceptedAt: string; name: string | null; username: string | null; publicId: string | null };
const viaText: Record<string, string> = { panel: "Sözleşme ekranı", agency_invite: "Ajans davetini kabul", self_join: "Ajans sahibi kendini ekledi" };
type PendingUser = { id: string; username: string; displayName: string | null; publicId: string | null };

const kindText: Record<Kind, string> = { broadcaster: "Yayıncı", agency: "Ajans sahibi", dealer: "Coin bayisi" };
const karar = (s: string) => /\[KARAR:/i.test(s);

/** Sözleşmeler: yayımlama (değiştirilemez sürümler), kabul kayıtları, kabul bekleyenler. Karar: işlemle birlikte tek dokunuşla kabul. */
export default function AdminContracts() {
  const [kind, setKind] = useState<Kind>("broadcaster");
  const t = useApi<TemplatesRes>("/api/admin/contracts/templates");
  const [q, setQ] = useState("");
  const acc = useApi<{ acceptances: Acceptance[] }>(`/api/admin/contracts/acceptances?kind=${kind}&q=${encodeURIComponent(q)}`);
  const pending = useApi<{ users: PendingUser[] }>(`/api/admin/contracts/pending?kind=${kind}`);
  const { busy, msg, run } = useAction();
  const { ask, confirmNode } = useConfirm();

  const versions = (t.data?.templates ?? []).filter((x) => x.kind === kind);
  const current = versions[0] ?? null;
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  // Tür değişince form o türün son sürümüyle (yoksa taslakla) dolar.
  useEffect(() => {
    if (!t.data) return;
    const last = t.data.templates.find((x) => x.kind === kind);
    setBody(last?.body ?? t.data.drafts[kind] ?? "");
    setTitle(last?.title ?? t.data.kinds.find((k) => k.kind === kind)?.title ?? "");
    setVersion("");
  }, [kind, t.data]);

  const publish = () =>
    run("Sözleşme yayımlandı.", async () => {
      const ok = await ask({
        title: `${kindText[kind]} sözleşmesi ${version} yayımlansın mı?`,
        body: "Yayımlanan metin değiştirilemez ve silinemez. Bu türdeki taraflar uygulamada kabule çağrılır; kabul edene kadar ödemeleri bekletilir ve panelleri açılmaz (önceki sürümü kabul etmiş olanlar etkilenmez). Metnin avukat tarafından incelendiğinden emin olun.",
        danger: true,
      });
      if (!ok) return false;
      await api("/api/admin/contracts/templates", { method: "POST", body: { kind, version, title, body } });
      t.reload();
      pending.reload();
    });

  return (
    <div>
      {confirmNode}
      <PageHeader icon={<FileSignature size={18} />} kicker="Sistem" title="Sözleşmeler" description="Yayıncı, ajans sahibi ve Coin bayisi sözleşmeleri. Yayıncı sözleşmesi ajans davetini kabul ederken, ajans ve bayi sözleşmesi panel ilk açılırken tek dokunuşla kabul edilir. Yayımlanan sürümler ve kabul kayıtları değiştirilemez." />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["broadcaster", "agency", "dealer"] as Kind[]).map((k) => (
          <button key={k} type="button" className={`${btnSmall} ${k === kind ? "border-[#8c713d] text-[#e5c77e]" : ""}`} onClick={() => setKind(k)}>
            {kindText[k]}
          </button>
        ))}
      </div>
      {t.error && <ErrorBox message={t.error} onRetry={t.reload} />}
      {t.loading && !t.data && <Loading />}
      {t.data && (
        <div className="space-y-4">
          <Card title="Yeni sürüm yayımla" subtitle={current ? `Yürürlükteki sürüm: ${current.version} · ${current.acceptances} onay` : "Bu türde henüz yayımlanmış sözleşme yok: kapılar kapalı, sistem eskisi gibi çalışıyor."}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Sürüm" hint="Örn. 1.2. Yayımlanan sürüm tekrar kullanılamaz.">
                <input id="contract-version" className={inputCls} value={version} onChange={(e) => setVersion(e.target.value.trim())} placeholder="1.2" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Başlık">
                  <input id="contract-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
                </Field>
              </div>
            </div>
            <div className="mt-3">
              <Field label="Metin (Markdown)" hint="[KARAR: …] notu kalmış metin yayımlanamaz.">
                <textarea id="contract-body" className={`${inputCls} h-80 font-mono text-xs`} value={body} onChange={(e) => setBody(e.target.value)} />
              </Field>
            </div>
            {karar(body) && <p className="mt-2 text-xs text-[#e8c88a]">Metinde doldurulmamış [KARAR: …] notu var. Kararı verip notu silmeden yayımlanamaz.</p>}
            <div className="mt-3 flex items-center gap-3">
              <button type="button" className={btnSmall} disabled={busy || !version || body.length < 100 || karar(body)} onClick={publish}>Yayımla</button>
              <ActionMsg msg={msg} />
            </div>
          </Card>

          <Card title="Yayımlanmış sürümler">
            {versions.length === 0 ? <Empty title="Yayımlanmış sürüm yok" /> : (
              <div className="divide-y divide-[#30291e] text-sm">
                {versions.map((v) => (
                  <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="text-white">{v.title} · Sürüm {v.version}</span>
                    <span className="text-xs text-gray-400">{fmtRel(v.publishedAt)} · {v.publishedBy ?? "-"} · {v.acceptances} onay · <span className="font-mono">{v.sha256.slice(0, 12)}…</span></span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Kabul bekleyenler" subtitle="Yürürlükte sözleşme varken hiçbir sürümü kabul etmemiş taraflar. Ödemeleri bekletilir (kaybolmaz).">
            {pending.loading && !pending.data ? <Loading /> : (pending.data?.users.length ?? 0) === 0 ? <Empty title="Bekleyen yok" /> : (
              <div className="flex flex-wrap gap-2 text-sm">
                {pending.data!.users.map((u) => <Badge key={u.id} tone="gray">{u.displayName ?? u.username} · {u.publicId ?? u.username}</Badge>)}
              </div>
            )}
          </Card>

          <Card title="Kabul kayıtları" action={<input id="contract-search" className={`${inputCls} w-56`} placeholder="Sözleşme no, kullanıcı adı, ID" value={q} onChange={(e) => setQ(e.target.value)} />}>
            {acc.error && <ErrorBox message={acc.error} onRetry={acc.reload} />}
            {acc.loading && !acc.data ? <Loading /> : (acc.data?.acceptances.length ?? 0) === 0 ? <Empty title="Kayıt yok" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-gray-500"><tr><th className="py-2">No</th><th>Taraf</th><th>Sürüm</th><th>Nerede</th><th>Zaman</th><th>IP</th></tr></thead>
                  <tbody className="divide-y divide-[#30291e]">
                    {acc.data!.acceptances.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2 font-mono text-[#e5c77e]">{a.contractNo}</td>
                        <td>{a.name ?? "-"}<div className="text-xs text-gray-500">{a.username} · {a.publicId}</div></td>
                        <td>{a.version}</td>
                        <td>{viaText[a.via ?? ""] ?? (a.method === "sms" ? "SMS" : a.method === "password" ? "Şifre" : "-")}</td>
                        <td className="whitespace-nowrap">{new Date(a.acceptedAt).toLocaleString("tr-TR")}</td>
                        <td className="font-mono text-xs">{a.ip ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
