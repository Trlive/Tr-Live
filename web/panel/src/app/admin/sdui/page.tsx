"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
// Eski adres: "Ana ekran sekmeleri" artık Ekran Düzenleri sayfasının bir sekmesi.
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/screens");
  }, [router]);
  return null;
}
