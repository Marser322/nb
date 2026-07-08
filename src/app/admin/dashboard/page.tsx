"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Calendar,
    DollarSign,
    UserPlus,
    UserRoundX,
    Scissors,
    TrendingUp,
    Package,
    Clock,
    Filter,
    Activity,
    ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS, INACTIVE_DAYS } from "@/lib/constants";
import { fetchClientsOverviewPage } from "@/lib/crm";
import { createClient } from "@/lib/supabase/client";
import type { Appointment, Service, Barber, Branch, ClientOverview } from "@/types/database.types";
import { CrmCards, type RankingItem } from "@/components/admin/crm-cards";
import { usePermissions } from "@/lib/usePermissions";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { endOfMonth, format, parseISO, startOfMonth, startOfToday, subDays } from "date-fns";
import { es } from "date-fns/locale";

interface DashboardStats {
    citasMes: number;
    ingresosMes: number;
    productosLowStock: number;
    clientesNuevos: number;
    clientesInactivos: number;
}

type ServiceMetric = Pick<Service, "name" | "price">;
type BarberMetric = Pick<Barber, "name">;

interface CompletedMetricRow {
    service: ServiceMetric | ServiceMetric[] | null;
    barber: BarberMetric | BarberMetric[] | null;
}

interface StatCardConfig {
    title: string;
    value: string | number;
    icon: typeof TrendingUp;
    tone: "green" | "gold" | "blue" | "amber" | "red";
    meta: string;
    sparkline: keyof typeof SPARKLINE_PATHS;
}

const SPARKLINE_PATHS = {
    steady: "M2 38 C18 30 24 34 38 24 C52 14 66 22 78 17 C94 10 104 18 118 10 C128 5 134 9 138 6",
    revenue: "M2 42 C15 38 22 40 34 30 C47 18 56 28 68 21 C82 12 92 18 104 15 C118 12 126 8 138 10",
    clients: "M2 36 C16 28 28 33 42 24 C55 16 66 25 80 18 C94 12 104 21 118 14 C129 9 134 15 138 12",
    alert: "M2 26 C15 18 25 42 38 32 C51 20 62 40 76 26 C90 12 101 36 114 22 C126 10 134 30 138 24",
    stock: "M2 18 C14 34 27 16 40 32 C54 48 66 22 80 36 C94 50 104 26 118 40 C128 50 134 35 138 44",
} as const;

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<DashboardStats>({
        citasMes: 0,
        ingresosMes: 0,
        productosLowStock: 0,
        clientesNuevos: 0,
        clientesInactivos: 0,
    });
    const [citasHoy, setCitasHoy] = useState<(Appointment & { service?: Service; barber?: Barber })[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [inactiveClients, setInactiveClients] = useState<ClientOverview[]>([]);
    const [topServices, setTopServices] = useState<RankingItem[]>([]);
    const [topBarbers, setTopBarbers] = useState<RankingItem[]>([]);
    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [barberFilter, setBarberFilter] = useState<string>("all");
    const [isLoading, setIsLoading] = useState(true);
    const supabase = useMemo(() => createClient(), []);
    const { can: canSee } = usePermissions();

    const loadDashboard = useCallback(async () => {
        setIsLoading(true);

        // Invocación oportunista del generador de turnos fijos (fire-and-forget)
        (async () => {
            try {
                await supabase.rpc("generate_subscription_appointments");
            } catch (err) {
                console.error("Error generating subscription appointments:", err);
            }
        })();

        const now = new Date();
        const today = format(startOfToday(), "yyyy-MM-dd");
        const monthStartDate = startOfMonth(now);
        const monthStart = format(monthStartDate, "yyyy-MM-dd");
        const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
        const ninetyDaysAgo = format(subDays(now, 90), "yyyy-MM-dd");

        const [
            citasHoyRes,
            barbersRes,
            branchesRes,
            citasMesRes,
            lowStockRes,
            completedRes,
            newClientsRes,
            inactiveClientsRes,
            topPerformersRes,
        ] = await Promise.all([
            supabase.from("appointments").select("*, service:services(*), barber:barbers(*)").eq("appointment_date", today).order("start_time"),
            supabase.from("barbers").select("*").eq("is_active", true).order("name"),
            supabase.from("branches").select("*").eq("is_active", true).order("name"),
            supabase.from("appointments").select("*", { count: "exact", head: true }).gte("appointment_date", monthStart).lte("appointment_date", monthEnd),
            supabase.from("products").select("*", { count: "exact", head: true }).lte("stock", 5).eq("is_active", true),
            supabase.from("appointments").select("service:services(price)").eq("status", "completed").gte("appointment_date", monthStart).lte("appointment_date", monthEnd),
            supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "cliente").gte("created_at", monthStartDate.toISOString()),
            fetchClientsOverviewPage(supabase, {
                inactiveOnly: true,
                inactiveDays: INACTIVE_DAYS,
                limit: 8,
                offset: 0,
            }),
            supabase
                .from("appointments")
                .select("service:services(name, price), barber:barbers(name)")
                .eq("status", "completed")
                .gte("appointment_date", ninetyDaysAgo),
        ]);

        const citasHoyData = citasHoyRes.data || [];
        const barbersData = barbersRes.data || [];
        const branchesData = branchesRes.data || [];
        const citasMesCount = citasMesRes.count || 0;
        const lowStockCount = lowStockRes.count || 0;
        const completedAppointments = completedRes.data || [];
        const { services, barbers: barberRanking } = aggregateRankings((topPerformersRes.data || []) as CompletedMetricRow[]);

        const ingresosMes = completedAppointments.reduce((sum, apt) => {
            const service = Array.isArray(apt.service) ? apt.service[0] : apt.service;
            return sum + (service?.price || 0);
        }, 0) || 0;

        setStats({
            citasMes: citasMesCount,
            ingresosMes,
            productosLowStock: lowStockCount,
            clientesNuevos: newClientsRes.count || 0,
            clientesInactivos: inactiveClientsRes.total,
        });

        setCitasHoy(citasHoyData);
        setBarbers(barbersData);
        setBranches(branchesData);
        setInactiveClients([...inactiveClientsRes.clients].sort(sortInactiveClients));
        setTopServices(services);
        setTopBarbers(barberRanking);
        setIsLoading(false);
    }, [supabase]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadDashboard();
    }, [loadDashboard]);

    // Reset de barbero si ya no es compatible con la sucursal elegida
    useEffect(() => {
        if (branchFilter !== "all" && barberFilter !== "all") {
            const barber = barbers.find((b) => b.id === barberFilter);
            if (barber && barber.branch_id !== branchFilter) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setBarberFilter("all");
            }
        }
    }, [branchFilter, barberFilter, barbers]);

    // Filtrar citas en memoria
    const filteredCitasHoy = citasHoy.filter((cita) => {
        if (branchFilter !== "all" && cita.barber?.branch_id !== branchFilter) {
            return false;
        }
        if (barberFilter !== "all" && cita.barber_id !== barberFilter) {
            return false;
        }
        return true;
    });

    const statCards: StatCardConfig[] = [
        {
            title: "Citas este Mes",
            value: stats.citasMes,
            icon: TrendingUp,
            tone: "green",
            meta: "Flujo de agenda",
            sparkline: "steady",
        },
        // Las ganancias del dueño solo se muestran a quien tenga finances.view
        // (admin siempre; gerente no, por defecto).
        ...(canSee("finances.view")
            ? [
                  {
                      title: "Ingresos del Mes",
                      value: formatPrice(stats.ingresosMes),
                      icon: DollarSign,
                      tone: "gold" as const,
                      meta: "Caja mensual",
                      sparkline: "revenue" as const,
                  },
              ]
            : []),
        {
            title: "Clientes Nuevos",
            value: stats.clientesNuevos,
            icon: UserPlus,
            tone: "blue",
            meta: "Alta de perfiles",
            sparkline: "clients",
        },
        {
            title: "Clientes Inactivos",
            value: stats.clientesInactivos,
            icon: UserRoundX,
            tone: stats.clientesInactivos > 0 ? "amber" : "green",
            meta: stats.clientesInactivos > 0 ? "Reactivar ahora" : "Base saludable",
            sparkline: "alert",
        },
        {
            title: "Productos Bajo Stock",
            value: stats.productosLowStock,
            icon: Package,
            tone: stats.productosLowStock > 0 ? "red" : "green",
            meta: stats.productosLowStock > 0 ? "Atención stock" : "Stock cubierto",
            sparkline: "stock",
        },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="admin-hero rounded-2xl p-5 md:p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl space-y-3">
                        <div className="admin-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                            Centro de mando
                        </div>
                        <div>
                            <h1 className="font-display text-3xl font-bold leading-tight md:text-5xl">
                                Dashboard
                            </h1>
                            <p className="mt-2 max-w-xl text-sm text-muted-foreground md:text-base">
                                {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}. Una vista compacta para leer agenda, caja, clientes y stock sin perder ritmo.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[420px]">
                        <div className="admin-chip rounded-xl p-3">
                            <p className="text-xs text-muted-foreground">Citas hoy</p>
                            <p className="mt-1 text-2xl font-bold">{filteredCitasHoy.length}</p>
                        </div>
                        <div className="admin-chip rounded-xl p-3">
                            <p className="text-xs text-muted-foreground">Barberos activos</p>
                            <p className="mt-1 text-2xl font-bold">{barbers.length}</p>
                        </div>
                        <div className="admin-chip col-span-2 rounded-xl p-3 sm:col-span-1">
                            <p className="text-xs text-muted-foreground">Sucursales</p>
                            <p className="mt-1 text-2xl font-bold">{branches.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div id="admin-stats" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {statCards.map((stat) => (
                    <Card key={stat.title} data-tone={stat.tone} className="admin-kpi-card border-border/50 py-0">
                        <CardContent className="relative z-10 p-4">
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div className="admin-stat-icon rounded-xl p-2">
                                    <stat.icon className="h-5 w-5" />
                                </div>
                                <span className="admin-chip inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground">
                                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                                    {stat.meta}
                                </span>
                            </div>
                            <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                            <p className="text-sm text-muted-foreground">{stat.title}</p>
                            <div className="mt-4 h-14">
                                <MiniSparkline variant={stat.sparkline} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <CrmCards
                inactiveClients={inactiveClients}
                topServices={topServices}
                topBarbers={topBarbers}
                isLoading={isLoading}
                onLogAdded={loadDashboard}
            />

            {/* Citas de Hoy */}
            <Card className="admin-section-card border-border/50">
                <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            Agenda de Hoy
                        </CardTitle>
                        <CardDescription>
                            {filteredCitasHoy.length} {filteredCitasHoy.length === 1 ? "cita" : "citas"} programadas en la selección
                        </CardDescription>
                    </div>

                    {/* Filtros rápidos */}
                    <div className="flex flex-wrap gap-2">
                        {/* Selector de Sucursal */}
                        <Select value={branchFilter} onValueChange={setBranchFilter}>
                            <SelectTrigger className="w-[160px] text-base md:h-9 md:text-xs">
                                <Filter className="mr-1 h-3 w-3" />
                                <SelectValue placeholder="Sucursal" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las sucursales</SelectItem>
                                {branches.map((b) => (
                                    <SelectItem key={b.id} value={b.id}>
                                        {b.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        {/* Selector de Barbero */}
                        <Select value={barberFilter} onValueChange={setBarberFilter}>
                            <SelectTrigger className="w-[160px] text-base md:h-9 md:text-xs">
                                <Filter className="mr-1 h-3 w-3" />
                                <SelectValue placeholder="Barbero" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos los barberos</SelectItem>
                                {barbers
                                    .filter((b) => branchFilter === "all" || b.branch_id === branchFilter)
                                    .map((b) => (
                                        <SelectItem key={b.id} value={b.id}>
                                            {b.name}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/50" />
                            ))}
                        </div>
                    ) : filteredCitasHoy.length === 0 ? (
                        <div className="admin-empty-state rounded-xl py-8 text-center text-muted-foreground">
                            <Calendar className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
                            <p>No hay citas programadas para hoy con los filtros seleccionados</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredCitasHoy.map((cita) => (
                                <div
                                    key={cita.id}
                                    className="admin-list-row flex items-center justify-between rounded-xl border p-4"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="admin-chip min-w-[64px] rounded-xl px-3 py-2 text-center">
                                            <p className="text-lg font-bold">{cita.start_time.slice(0, 5)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {cita.end_time.slice(0, 5)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="font-medium">{cita.service?.name || "Servicio"}</p>
                                            <p className="text-sm text-muted-foreground">
                                                <Scissors className="mr-1 inline h-3 w-3" />
                                                {cita.barber?.name || "Barbero"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <Badge
                                            variant="outline"
                                            className={APPOINTMENT_STATUS_COLORS[cita.status]}
                                        >
                                            {APPOINTMENT_STATUS_LABELS[cita.status]}
                                        </Badge>
                                        {cita.service && (
                                            <p className="mt-1 text-sm font-semibold text-primary">
                                                {formatPrice(cita.service.price)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function MiniSparkline({ variant }: { variant: keyof typeof SPARKLINE_PATHS }) {
    const path = SPARKLINE_PATHS[variant];

    return (
        <svg className="h-full w-full" viewBox="0 0 140 54" preserveAspectRatio="none" aria-hidden="true">
            <path className="admin-sparkline-fill" d={`${path} L138 54 L2 54 Z`} />
            <path className="admin-sparkline-line" d={path} />
        </svg>
    );
}

function sortInactiveClients(a: ClientOverview, b: ClientOverview) {
    if (!a.last_visit && !b.last_visit) {
        return Number(b.total_spent) - Number(a.total_spent);
    }
    if (!a.last_visit) return 1;
    if (!b.last_visit) return -1;

    return parseISO(b.last_visit).getTime() - parseISO(a.last_visit).getTime();
}

function aggregateRankings(rows: CompletedMetricRow[]) {
    const serviceMap = new Map<string, RankingItem>();
    const barberMap = new Map<string, RankingItem>();

    rows.forEach((row) => {
        const service = getRelation(row.service);
        const barber = getRelation(row.barber);
        const price = Number(service?.price || 0);

        if (service?.name) {
            addRankingItem(serviceMap, service.name, price);
        }

        if (barber?.name) {
            addRankingItem(barberMap, barber.name, price);
        }
    });

    return {
        services: sortRankings(serviceMap),
        barbers: sortRankings(barberMap),
    };
}

function getRelation<T>(relation: T | T[] | null | undefined) {
    if (Array.isArray(relation)) return relation[0] || null;
    return relation || null;
}

function addRankingItem(map: Map<string, RankingItem>, name: string, revenue: number) {
    const current = map.get(name) || { name, count: 0, revenue: 0 };

    map.set(name, {
        name,
        count: current.count + 1,
        revenue: current.revenue + revenue,
    });
}

function sortRankings(map: Map<string, RankingItem>) {
    return Array.from(map.values())
        .sort((a, b) => b.revenue - a.revenue || b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 5);
}
