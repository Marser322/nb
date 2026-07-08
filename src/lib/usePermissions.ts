"use client";

// Hook de cliente: carga rol + permisos del staff logueado para gating de UI
// (sidebar, montos de finanzas, etc). Mismo patrón que useFeatures() en
// src/lib/features.ts. La lógica pura (tipos, defaults, `can()`) vive en
// src/lib/permissions.ts, que también se importa desde rutas server — por
// eso el hook (que depende de React) está separado en este archivo.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { can, type Permission, type PermissionProfile } from "@/lib/permissions";

export function usePermissions() {
    const [profile, setProfile] = useState<PermissionProfile | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        let active = true;

        async function loadProfile() {
            try {
                const supabase = createClient();
                const {
                    data: { user },
                } = await supabase.auth.getUser();

                if (!user) {
                    if (active) {
                        setProfile(null);
                        setIsLoaded(true);
                    }
                    return;
                }

                const { data } = await supabase
                    .from("profiles")
                    .select("role, permissions")
                    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
                    .limit(1)
                    .maybeSingle();

                if (active) {
                    setProfile(
                        data ? { role: data.role, permissions: data.permissions } : null
                    );
                    setIsLoaded(true);
                }
            } catch (err) {
                console.error("Error loading profile for permissions:", err);
                if (active) {
                    setProfile(null);
                    setIsLoaded(true);
                }
            }
        }

        loadProfile();

        return () => {
            active = false;
        };
    }, []);

    return {
        profile,
        isLoaded,
        can: (perm: Permission) => can(profile, perm),
    };
}
