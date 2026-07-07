"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export function useDemoAdminLogin(): {
  loginAsDemoAdmin: () => Promise<void>;
  isDemoLoading: boolean;
} {
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const loginAsDemoAdmin = async () => {
    const demoEmail = process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL;
    const demoPassword = process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD;
    if (!demoEmail || !demoPassword) {
      toast.error("Credenciales demo no configuradas");
      return;
    }

    setIsDemoLoading(true);

    const {
      data: { user },
      error,
    } = await supabase.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    });

    if (error || !user) {
      toast.error("No se pudo iniciar la demo (¿el usuario demo existe en Supabase?)");
      setIsDemoLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .limit(1)
      .maybeSingle();

    if (profile?.role !== "admin") {
      await supabase.auth.signOut();
      toast.error("No tenés permisos de administrador");
      setIsDemoLoading(false);
      return;
    }

    toast.success("¡Bienvenido, Admin demo!");
    router.push(ROUTES.ADMIN_DASHBOARD);
    router.refresh();
  };

  return { loginAsDemoAdmin, isDemoLoading };
}
