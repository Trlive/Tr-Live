"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Eski adres: bayi ana sayfasına yönlendirilir.
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dealer/dashboard");
  }, [router]);
  return null;
}
