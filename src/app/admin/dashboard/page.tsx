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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS, INACTIVE_DAYS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Appointment, Service, Barber, Branch, ClientOverview } from "@/types/database.types";
import { CrmCards, type RankingItem } from "@/components/admin/crm-cards";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { differenceInDays, endOfMonth, format, parseISO, startOfMonth, startOfToday, subDays } from "date-fns";
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

    const loadDashboard = useCallback(async () => {
        setIsLoading(true);

        // Invocación oportunista del generador de turnos fijos (fire-and-forget)
        const isDummy = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("dummy") || false;
        if (!isDummy) {
            (async () => {
                try {
                    await supabase.rpc("generate_subscription_appointments");
                } catch (err) {
                    console.error("Error generating subscription appointments:", err);
                }
            })();
        }

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
            clientsOverviewRes,
            topPerformersRes,
        ] = await Promise.all([
            supabase.from("appointments").select("*, service:services(*), barber:barbers(*)").eq("appointment_date", today).order("start_time"),
            supabase.from("barbers").select("*").eq("is_active", true).order("name"),
            supabase.from("branches").select("*").eq("active", true).order("name"),
            supabase.from("appointments").select("*", { count: "exact", head: true }).gte("appointment_date", monthStart).lte("appointment_date", monthEnd),
            supabase.from("products").select("*", { count: "exact", head: true }).lte("stock", 5).eq("is_active", true),
            supabase.from("appointments").select("service:services(price)").eq("status", "completed").gte("appointment_date", monthStart).lte("appointment_date", monthEnd),
            supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "cliente").gte("created_at", monthStartDate.toISOString()),
            supabase.rpc("get_clients_overview"),
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
        const clientsOverview = (clientsOverviewRes.data || []) as ClientOverview[];
        const inactiveAll = clientsOverview.filter((client) => isInactiveClient(client.last_visit));
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
            clientesInactivos: inactiveAll.length,
        });

        setCitasHoy(citasHoyData);
        setBarbers(barbersData);
        setBranches(branchesData);
        setInactiveClients([...inactiveAll].sort(sortInactiveClients).slice(0, 8));
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

    const statCards = [
        {
            title: "Citas este Mes",
            value: stats.citasMes,
            icon: TrendingUp,
            color: "text-green-400",
            bgColor: "bg-green-400/10",
        },
        {
            title: "Ingresos del Mes",
            value: formatPrice(stats.ingresosMes),
            icon: DollarSign,
            color: "text-primary",
            bgColor: "bg-primary/10",
        },
        {
            title: "Clientes Nuevos",
            value: stats.clientesNuevos,
            icon: UserPlus,
            color: "text-blue-400",
            bgColor: "bg-blue-400/10",
        },
        {
            title: "Clientes Inactivos",
            value: stats.clientesInactivos,
            icon: UserRoundX,
            color: stats.clientesInactivos > 0 ? "text-amber-400" : "text-green-400",
            bgColor: stats.clientesInactivos > 0 ? "bg-amber-400/10" : "bg-green-400/10",
        },
        {
            title: "Productos Bajo Stock",
            value: stats.productosLowStock,
            icon: Package,
            color: stats.productosLowStock > 0 ? "text-red-400" : "text-green-400",
            bgColor: stats.productosLowStock > 0 ? "bg-red-400/10" : "bg-green-400/10",
        },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">
                    {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                </p>
            </div>

            {/* Stats Grid */}
            <div id="admin-stats" className="grid grid-cols-2 xl:grid-cols-5 gap-4">
                {statCards.map((stat) => (
                    <Card key={stat.title} className="border-border/50">
                        <CardContent className="p-4 md:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                                </div>
                            </div>
                            <p className="text-2xl md:text-3xl font-bold">{stat.value}</p>
                            <p className="text-sm text-muted-foreground">{stat.title}</p>
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
            <Card className="border-border/50">
                <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                            <SelectTrigger className="w-[160px] h-9 text-xs">
                                <Filter className="h-3 w-3 mr-1" />
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
                            <SelectTrigger className="w-[160px] h-9 text-xs">
                                <Filter className="h-3 w-3 mr-1" />
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
                                <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
                            ))}
                        </div>
                    ) : filteredCitasHoy.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                            <p>No hay citas programadas para hoy con los filtros seleccionados</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredCitasHoy.map((cita) => (
                                <div
                                    key={cita.id}
                                    className="flex items-center justify-between p-4 rounded-lg bg-card border border-border/50"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="text-center min-w-[60px]">
                                            <p className="text-lg font-bold">{cita.start_time.slice(0, 5)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {cita.end_time.slice(0, 5)}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="font-medium">{cita.service?.name || "Servicio"}</p>
                                            <p className="text-sm text-muted-foreground">
                                                <Scissors className="inline h-3 w-3 mr-1" />
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
                                            <p className="text-sm font-semibold text-primary mt-1">
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

function isInactiveClient(lastVisit: string | null) {
    if (!lastVisit) return true;
    return differenceInDays(new Date(), parseISO(lastVisit)) > INACTIVE_DAYS;
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
