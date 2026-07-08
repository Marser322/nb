"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";
import { isDemoMode } from "@/lib/demo";

export { isDemoMode };

export function useDemoAdminLogin(): {
  loginAsDemoAdmin: () => Promise<void>;
  isDemoLoading: boolean;
} {
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const router = useRouter();

  const loginAsDemoAdmin = async () => {
    if (!isDemoMode) {
      toast.error("El modo demo no está activo");
      return;
    }

    setIsDemoLoading(true);

    try {
      const response = await fetch("/api/demo-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        toast.error(payload?.message || "No se pudo iniciar la demo");
        setIsDemoLoading(false);
        return;
      }

      toast.success("¡Bienvenido, Admin demo!");
      router.push(ROUTES.ADMIN_DASHBOARD);
      router.refresh();
    } catch {
      toast.error("Ocurrió un error al iniciar la demo");
      setIsDemoLoading(false);
    }
  };

  return { loginAsDemoAdmin, isDemoLoading };
}
