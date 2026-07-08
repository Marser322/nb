import type { createClient } from "@/lib/supabase/client";

/**
 * Resuelve la cadena auth user → profile → barbero vinculado, usada tanto
 * en el layout del portal (identidad en el sidebar) como en mi-agenda
 * (carga de citas). Evita duplicar las mismas 3 consultas en ambos lugares.
 */
export type BarberSession =
    | { status: "unauthenticated" }
    | { status: "not-linked" }
    | { status: "ok"; barberId: string; barberName: string };

export async function resolveBarberSession(
    supabase: ReturnType<typeof createClient>
): Promise<BarberSession> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { status: "unauthenticated" };
    }

    // auth user → profiles → barbers.profile_id
    const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();

    const { data: barber } = profile
        ? await supabase
            .from("barbers")
            .select("id, name")
            .eq("profile_id", profile.id)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle()
        : { data: null };

    if (!barber) {
        return { status: "not-linked" };
    }

    return { status: "ok", barberId: barber.id, barberName: barber.name };
}
