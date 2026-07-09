import { differenceInDays, parseISO } from "date-fns";
import { INACTIVE_DAYS } from "@/lib/constants";
import type { createClient } from "@/lib/supabase/client";
import type { ClientOverview, ClientOverviewPage, ClientSort, ClientSegment } from "@/types/database.types";

type SupabaseClient = ReturnType<typeof createClient>;

type FetchClientsOverviewPageOptions = {
    search?: string;
    inactiveOnly?: boolean;
    inactiveDays?: number;
    limit?: number;
    offset?: number;
    sort?: ClientSort;
    segment?: ClientSegment | null;
};

export function isInactiveClient(lastVisit: string | null, inactiveDays = INACTIVE_DAYS) {
    if (!lastVisit) return true;
    return differenceInDays(new Date(), parseISO(lastVisit)) > inactiveDays;
}

export function isBirthdayThisMonth(birthDate: string | null) {
    if (!birthDate) return false;
    // birth_date llega como "YYYY-MM-DD"; parseISO evita corrimientos de timezone.
    return parseISO(birthDate).getMonth() === new Date().getMonth();
}

/**
 * true cuando el fallback legacy (get_clients_overview, sin p_sort/p_segment) está activo.
 * El segmento "cumple_mes" no es soportado por esa RPC vieja (no trae birth_date confiable
 * en todas las instalaciones), así que la lista queda vacía con aviso en vez de romper.
 */
export async function fetchClientsOverviewPage(
    supabase: SupabaseClient,
    {
        search = "",
        inactiveOnly = false,
        inactiveDays = INACTIVE_DAYS,
        limit = 20,
        offset = 0,
        sort = "recent",
        segment = null,
    }: FetchClientsOverviewPageOptions = {}
): Promise<{ clients: ClientOverview[]; total: number; usedLegacyFallback: boolean }> {
    const { data, error } = await supabase.rpc("get_clients_overview_page", {
        p_search: search.trim() || null,
        p_inactive_only: inactiveOnly || segment === "inactivos",
        p_inactive_days: inactiveDays,
        p_limit: limit,
        p_offset: offset,
        p_sort: sort,
        p_segment: segment,
    });

    if (!error) {
        const page = (data || []) as ClientOverviewPage[];
        return {
            clients: page,
            total: page[0]?.total_count ? Number(page[0].total_count) : 0,
            usedLegacyFallback: false,
        };
    }

    if (error.code !== "PGRST202" && error.code !== "42883") {
        throw error;
    }

    // Fallback legacy: la RPC vieja no tiene p_sort/p_segment/birth_date. El segmento
    // cumpleaños no se puede resolver sin birth_date, así que devuelve lista vacía.
    if (segment === "cumple_mes") {
        return { clients: [], total: 0, usedLegacyFallback: true };
    }

    const fallback = await supabase.rpc("get_clients_overview");
    if (fallback.error) throw fallback.error;

    const query = search.toLowerCase().trim();
    let filtered = ((fallback.data || []) as ClientOverview[]).filter((client) => {
        if ((inactiveOnly || segment === "inactivos") && !isInactiveClient(client.last_visit, inactiveDays)) return false;
        if (segment === "nuevos" && differenceInDays(new Date(), parseISO(client.created_at)) > 30) return false;
        if (!query) return true;

        const nameMatches = client.full_name?.toLowerCase().includes(query) ?? false;
        const phoneMatches = client.phone?.includes(query) ?? false;
        return nameMatches || phoneMatches;
    });

    filtered = sortClientsInMemory(filtered, sort, inactiveOnly || segment === "inactivos");

    return {
        clients: filtered.slice(offset, offset + limit),
        total: filtered.length,
        usedLegacyFallback: true,
    };
}

function sortClientsInMemory(clients: ClientOverview[], sort: ClientSort, inactiveOnly: boolean): ClientOverview[] {
    const sorted = [...clients];
    switch (sort) {
        case "spent":
            return sorted.sort((a, b) => Number(b.total_spent) - Number(a.total_spent));
        case "visits":
            return sorted.sort((a, b) => Number(b.total_appointments) - Number(a.total_appointments));
        case "name":
            return sorted.sort((a, b) => (a.full_name || "").localeCompare(b.full_name || "", "es"));
        case "recent":
        default:
            return sorted.sort((a, b) => {
                const aTime = a.last_visit ? parseISO(a.last_visit).getTime() : null;
                const bTime = b.last_visit ? parseISO(b.last_visit).getTime() : null;
                if (aTime === null && bTime === null) return 0;
                if (aTime === null) return 1;
                if (bTime === null) return -1;
                return inactiveOnly ? aTime - bTime : bTime - aTime;
            });
    }
}
