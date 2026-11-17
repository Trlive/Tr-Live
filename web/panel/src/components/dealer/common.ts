export type DealerTx = { id: string; type: string; coinAmount: string; description?: string | null; username?: string | null; createdAt: string };
export type DealerMe = { dealer: { id: string; name: string; coinBalance: string }; transactions: DealerTx[] };

export const txText: Record<string, string> = {
  sale: "Satış",
  admin_topup: "Bakiye talebi onayı",
  credit: "Yönetici yüklemesi",
  usd_transfer: "Fasulye ile gelen",
};

/** Satış ve iade gibi bakiyeden düşen hareketler eksi gösterilir. */
export const isOut = (t: DealerTx) => t.type === "sale";
