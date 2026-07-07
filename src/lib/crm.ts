import { differenceInDays, parseISO } from "date-fns";
import { INACTIVE_DAYS } from "@/lib/constants";
import type { createClient } from "@/lib/supabase/client";
import type { ClientOverview, ClientOverviewPage } from "@/types/database.types";

type SupabaseClient = ReturnType<typeof createClient>;

type FetchClientsOverviewPageOptions = {
    search?: string;
    inactiveOnly?: boolean;
    inactiveDays?: number;
    limit?: number;
    offset?: number;
};

export function isInactiveClient(lastVisit: string | null, inactiveDays = INACTIVE_DAYS) {
    if (!lastVisit) return true;
    return differenceInDays(new Date(), parseISO(lastVisit)) > inactiveDays;
}

export async function fetchClientsOverviewPage(
    supabase: SupabaseClient,
    {
        search = "",
        inactiveOnly = false,
        inactiveDays = INACTIVE_DAYS,
        limit = 20,
        offset = 0,
    }: FetchClientsOverviewPageOptions = {}
): Promise<{ clients: ClientOverview[]; total: number }> {
    const { data, error } = await supabase.rpc("get_clients_overview_page", {
        p_search: search.trim() || null,
        p_inactive_only: inactiveOnly,
        p_inactive_days: inactiveDays,
        p_limit: limit,
        p_offset: offset,
    });

    if (!error) {
        const page = (data || []) as ClientOverviewPage[];
        return {
            clients: page,
            total: page[0]?.total_count ? Number(page[0].total_count) : 0,
        };
    }

    if (error.code !== "PGRST202" && error.code !== "42883") {
        throw error;
    }

    const fallback = await supabase.rpc("get_clients_overview");
    if (fallback.error) throw fallback.error;

    const query = search.toLowerCase().trim();
    const filtered = ((fallback.data || []) as ClientOverview[]).filter((client) => {
        if (inactiveOnly && !isInactiveClient(client.last_visit, inactiveDays)) return false;
        if (!query) return true;

        const nameMatches = client.full_name?.toLowerCase().includes(query) ?? false;
        const phoneMatches = client.phone?.includes(query) ?? false;
        return nameMatches || phoneMatches;
    });

    return {
        clients: filtered.slice(offset, offset + limit),
        total: filtered.length,
    };
}
