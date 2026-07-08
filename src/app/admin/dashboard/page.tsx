"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Calendar,
    DollarSign,
    UserPlus,
    UserRoundX,
    Scissors,
    TrendingUp,
    TrendingDown,
    Package,
    Clock,
    Filter,
    Activity,
    ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS, INACTIVE_DAYS, ROUTES } from "@/lib/constants";
import { fetchClientsOverviewPage } from "@/lib/crm";
import { createClient } from "@/lib/supabase/client";
import type { Appointment, Service, Barber, Branch, ClientOverview } from "@/types/database.types";
import { CrmCards, type RankingItem } from "@/components/admin/crm-cards";
import { usePermissions } from "@/lib/usePermissions";
import { useFeatures } from "@/lib/features";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { endOfMonth, format, parseISO, startOfMonth, startOfToday, subDays, subMonths } from "date-fns";
import { es } from "date-fns/locale";

interface DashboardStats {
    citasMes: number;
    citasMesAnterior: number;
    ingresosMes: number;
    ingresosMesAnterior: number;
    productosLowStock: number;
    clientesNuevos: number;
    clientesInactivos: number;
    caidasMes: number;
}

type ServiceMetric = Pick<Service, "name" | "price">;
type BarberMetric = Pick<Barber, "name">;

interface CompletedMetricRow {
    service: ServiceMetric | ServiceMetric[] | null;
    barber: BarberMetric | BarberMetric[] | null;
}

interface DailySeriesRow {
    appointment_date: string;
    status: Appointment["status"];
    service: Pick<Service, "price"> | Pick<Service, "price">[] | null;
}

interface StatCardConfig {
    title: string;
    value: string | number;
    icon: typeof TrendingUp;
    tone: "green" | "gold" | "blue" | "amber" | "red";
    meta: string;
    series: number[] | null;
    href: string | null;
}

const VALID_APPOINTMENT_STATUSES = ["pending", "confirmed", "completed"] as const;

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<DashboardStats>({
        citasMes: 0,
        citasMesAnterior: 0,
        ingresosMes: 0,
        ingresosMesAnterior: 0,
        productosLowStock: 0,
        clientesNuevos: 0,
        clientesInactivos: 0,
        caidasMes: 0,
    });
    const [citasHoy, setCitasHoy] = useState<(Appointment & { service?: Service; barber?: Barber })[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [inactiveClients, setInactiveClients] = useState<ClientOverview[]>([]);
    const [topServices, setTopServices] = useState<RankingItem[]>([]);
    const [topBarbers, setTopBarbers] = useState<RankingItem[]>([]);
    const [citasSeries, setCitasSeries] = useState<number[]>([]);
    const [ingresosSeries, setIngresosSeries] = useState<number[]>([]);
    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [barberFilter, setBarberFilter] = useState<string>("all");
    const [isLoading, setIsLoading] = useState(true);
    const supabase = useMemo(() => createClient(), []);
    const { can: canSee } = usePermissions();
    const { features } = useFeatures();

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
        const prevMonthDate = subMonths(now, 1);
        const prevMonthStart = format(startOfMonth(prevMonthDate), "yyyy-MM-dd");
        const prevMonthEnd = format(endOfMonth(prevMonthDate), "yyyy-MM-dd");
        const ninetyDaysAgo = format(subDays(now, 90), "yyyy-MM-dd");
        const fourteenDaysAgo = format(subDays(now, 13), "yyyy-MM-dd");

        const [
            citasHoyRes,
            barbersRes,
            branchesRes,
            citasMesRes,
            citasMesAnteriorRes,
            caidasMesRes,
            lowStockRes,
            completedRes,
            completedAnteriorRes,
            newClientsRes,
            inactiveClientsRes,
            topPerformersRes,
            seriesRes,
        ] = await Promise.all([
            supabase.from("appointments").select("*, service:services(*), barber:barbers(*), client:profiles(full_name)").eq("appointment_date", today).order("start_time"),
            supabase.from("barbers").select("*").eq("is_active", true).order("name"),
            supabase.from("branches").select("*").eq("is_active", true).order("name"),
            supabase.from("appointments").select("*", { count: "exact", head: true }).in("status", VALID_APPOINTMENT_STATUSES).gte("appointment_date", monthStart).lte("appointment_date", monthEnd),
            supabase.from("appointments").select("*", { count: "exact", head: true }).in("status", VALID_APPOINTMENT_STATUSES).gte("appointment_date", prevMonthStart).lte("appointment_date", prevMonthEnd),
            supabase.from("appointments").select("*", { count: "exact", head: true }).in("status", ["cancelled", "no_show"]).gte("appointment_date", monthStart).lte("appointment_date", monthEnd),
            supabase.from("products").select("*", { count: "exact", head: true }).lte("stock", 5).eq("is_active", true),
            supabase.from("appointments").select("service:services(price)").eq("status", "completed").gte("appointment_date", monthStart).lte("appointment_date", monthEnd),
            supabase.from("appointments").select("service:services(price)").eq("status", "completed").gte("appointment_date", prevMonthStart).lte("appointment_date", prevMonthEnd),
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
            supabase
                .from("appointments")
                .select("appointment_date, status, service:services(price)")
                .gte("appointment_date", fourteenDaysAgo)
                .lte("appointment_date", today),
        ]);

        const citasHoyData = citasHoyRes.data || [];
        const barbersData = barbersRes.data || [];
        const branchesData = branchesRes.data || [];
        const citasMesCount = citasMesRes.count || 0;
        const citasMesAnteriorCount = citasMesAnteriorRes.count || 0;
        const caidasMesCount = caidasMesRes.count || 0;
        const lowStockCount = lowStockRes.count || 0;
        const completedAppointments = completedRes.data || [];
        const completedAnteriorAppointments = completedAnteriorRes.data || [];
        const { services, barbers: barberRanking } = aggregateRankings((topPerformersRes.data || []) as CompletedMetricRow[]);

        type PriceOnly = Pick<Service, "price">;
        const sumRevenue = (rows: { service: PriceOnly | PriceOnly[] | null }[]) =>
            rows.reduce((sum, apt) => {
                const service = Array.isArray(apt.service) ? apt.service[0] : apt.service;
                return sum + (service?.price || 0);
            }, 0);

        const ingresosMes = sumRevenue(completedAppointments);
        const ingresosMesAnterior = sumRevenue(completedAnteriorAppointments);

        const { citas: citasSeriesData, ingresos: ingresosSeriesData } = buildDailySeries(
            (seriesRes.data || []) as DailySeriesRow[],
            fourteenDaysAgo,
            today
        );

        setStats({
            citasMes: citasMesCount,
            citasMesAnterior: citasMesAnteriorCount,
            ingresosMes,
            ingresosMesAnterior,
            productosLowStock: lowStockCount,
            clientesNuevos: newClientsRes.count || 0,
            clientesInactivos: inactiveClientsRes.total,
            caidasMes: caidasMesCount,
        });

        setCitasHoy(citasHoyData);
        setBarbers(barbersData);
        setBranches(branchesData);
        setInactiveClients([...inactiveClientsRes.clients].sort(sortInactiveClients));
        setTopServices(services);
        setTopBarbers(barberRanking);
        setCitasSeries(citasSeriesData);
        setIngresosSeries(ingresosSeriesData);
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
            meta: formatDelta(stats.citasMes, stats.citasMesAnterior),
            series: citasSeries,
            href: ROUTES.ADMIN_CITAS,
        },
        // Las ganancias del dueño solo se muestran a quien tenga finances.view
        // (admin siempre; gerente no, por defecto).
        ...(canSee("finances.view")
            ? [
                  {
                      title: "Ingresos por servicios",
                      value: formatPrice(stats.ingresosMes),
                      icon: DollarSign,
                      tone: "gold" as const,
                      meta: formatDelta(stats.ingresosMes, stats.ingresosMesAnterior),
                      series: ingresosSeries,
                      href: features.contabilidad ? ROUTES.ADMIN_CAJA : null,
                  },
              ]
            : []),
        {
            title: "Clientes Nuevos",
            value: stats.clientesNuevos,
            icon: UserPlus,
            tone: "blue",
            meta: "Alta de perfiles",
            series: null,
            href: ROUTES.ADMIN_CLIENTES,
        },
        {
            title: "Clientes Inactivos",
            value: stats.clientesInactivos,
            icon: UserRoundX,
            tone: stats.clientesInactivos > 0 ? "amber" : "green",
            meta: stats.clientesInactivos > 0 ? "Reactivar ahora" : "Base saludable",
            series: null,
            href: `${ROUTES.ADMIN_CLIENTES}?filtro=inactivos`,
        },
        {
            title: "Productos Bajo Stock",
            value: stats.productosLowStock,
            icon: Package,
            tone: stats.productosLowStock > 0 ? "red" : "green",
            meta: stats.productosLowStock > 0 ? "Atención stock" : "Stock cubierto",
            series: null,
            href: ROUTES.ADMIN_PRODUCTOS,
        },
        {
            title: "Caídas del Mes",
            value: stats.caidasMes,
            icon: TrendingDown,
            tone: stats.caidasMes > 0 ? "red" : "green",
            meta: stats.caidasMes > 0 ? "Canceladas + no-shows" : "Sin caídas",
            series: null,
            href: ROUTES.ADMIN_CITAS,
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
            <div id="admin-stats" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
                {statCards.map((stat) => {
                    const cardContent = (
                        <CardContent className="relative z-10 p-4">
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div className="admin-stat-icon rounded-xl p-2">
                                    <stat.icon className="h-5 w-5" />
                                </div>
                                <span className={`admin-chip inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] ${deltaToneClass(stat.meta)}`}>
                                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                                    {stat.meta}
                                </span>
                            </div>
                            <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
                            <p className="text-sm text-muted-foreground">{stat.title}</p>
                            {stat.series && (
                                <div className="mt-4 h-14">
                                    <MiniSparkline values={stat.series} />
                                </div>
                            )}
                        </CardContent>
                    );

                    return (
                        <Card key={stat.title} data-tone={stat.tone} className="admin-kpi-card border-border/50 py-0">
                            {stat.href ? (
                                <Link href={stat.href} aria-label={`${stat.title}: ${stat.value}. Ver más`} className="block">
                                    {cardContent}
                                </Link>
                            ) : (
                                cardContent
                            )}
                        </Card>
                    );
                })}
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
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5 text-primary" />
                                Agenda de Hoy
                            </CardTitle>
                            <CardDescription>
                                {filteredCitasHoy.length} {filteredCitasHoy.length === 1 ? "cita" : "citas"} programadas en la selección
                            </CardDescription>
                        </div>
                        <Button asChild variant="outline" size="sm" className="admin-chip shrink-0 border-border">
                            <Link href={ROUTES.ADMIN_CITAS}>Gestionar agenda</Link>
                        </Button>
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
                                            <p className="font-medium">
                                                {cita.client?.full_name || "Walk-in / sin registro"}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                <Scissors className="mr-1 inline h-3 w-3" />
                                                {cita.service?.name || "Servicio"} · {cita.barber?.name || "Barbero"}
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

function MiniSparkline({ values }: { values: number[] }) {
    const path = buildSparklinePath(values);

    return (
        <svg className="h-full w-full" viewBox="0 0 140 54" preserveAspectRatio="none" aria-hidden="true">
            <path className="admin-sparkline-fill" d={`${path} L138 54 L2 54 Z`} />
            <path className="admin-sparkline-line" d={path} />
        </svg>
    );
}

/**
 * Normaliza una serie de valores diarios a un path SVG (líneas rectas) dentro
 * del viewBox indicado. Series vacías o constantes devuelven una línea plana baja.
 */
function buildSparklinePath(values: number[], width = 140, height = 54): string {
    const padding = 4;
    const usableHeight = height - padding * 2;

    if (values.length === 0) {
        return `M2 ${height - padding} L${width - 2} ${height - padding}`;
    }

    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min;

    const step = values.length > 1 ? (width - 4) / (values.length - 1) : 0;

    const points = values.map((value, index) => {
        const x = 2 + step * index;
        const y = range === 0
            ? height - padding - usableHeight * 0.15
            : height - padding - ((value - min) / range) * usableHeight;
        return `${x.toFixed(1)} ${y.toFixed(1)}`;
    });

    return `M${points.join(" L")}`;
}

/** Deriva series diarias de citas válidas e ingresos completados entre startDate y endDate (inclusive, yyyy-MM-dd). */
function buildDailySeries(rows: DailySeriesRow[], startDate: string, endDate: string) {
    const dayKeys: string[] = [];
    let cursor = parseISO(startDate);
    const end = parseISO(endDate);
    while (cursor.getTime() <= end.getTime()) {
        dayKeys.push(format(cursor, "yyyy-MM-dd"));
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }

    const citasPorDia = new Map<string, number>(dayKeys.map((day) => [day, 0]));
    const ingresosPorDia = new Map<string, number>(dayKeys.map((day) => [day, 0]));

    rows.forEach((row) => {
        if (!citasPorDia.has(row.appointment_date)) return;

        if (VALID_APPOINTMENT_STATUSES.includes(row.status as (typeof VALID_APPOINTMENT_STATUSES)[number])) {
            citasPorDia.set(row.appointment_date, (citasPorDia.get(row.appointment_date) || 0) + 1);
        }

        if (row.status === "completed") {
            const service = Array.isArray(row.service) ? row.service[0] : row.service;
            ingresosPorDia.set(
                row.appointment_date,
                (ingresosPorDia.get(row.appointment_date) || 0) + (service?.price || 0)
            );
        }
    });

    return {
        citas: dayKeys.map((day) => citasPorDia.get(day) || 0),
        ingresos: dayKeys.map((day) => ingresosPorDia.get(day) || 0),
    };
}

/** Formatea el delta de un KPI contra el mismo período del mes anterior. */
function formatDelta(actual: number, anterior: number): string {
    if (anterior === 0) {
        return "— sin datos previos";
    }

    const diff = actual - anterior;
    const pct = Math.round((diff / anterior) * 100);
    const mesAnteriorLabel = format(subMonths(new Date(), 1), "MMMM", { locale: es });

    if (diff === 0) {
        return `= vs ${mesAnteriorLabel}`;
    }

    const sign = diff > 0 ? "+" : "";
    return `${sign}${pct}% vs ${mesAnteriorLabel}`;
}

function deltaToneClass(meta: string): string {
    if (meta.startsWith("+")) return "text-green-400";
    if (meta.startsWith("-") || meta.startsWith("−")) return "text-red-400";
    return "text-muted-foreground";
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
