"use client";

import { useState, useEffect } from "react";
import {
    Calendar,
    DollarSign,
    Users,
    Scissors,
    TrendingUp,
    Package,
    Clock,
    Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatDate } from "@/lib/utils";
import { APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_COLORS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Appointment, Service, Barber, Branch } from "@/types/database.types";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { format, startOfToday, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

interface DashboardStats {
    citasHoy: number;
    citasMes: number;
    ingresosMes: number;
    productosLowStock: number;
}

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<DashboardStats>({
        citasHoy: 0,
        citasMes: 0,
        ingresosMes: 0,
        productosLowStock: 0,
    });
    const [citasHoy, setCitasHoy] = useState<(Appointment & { service?: Service; barber?: Barber })[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [barberFilter, setBarberFilter] = useState<string>("all");
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        async function loadDashboard() {
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

            const today = format(startOfToday(), "yyyy-MM-dd");
            const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
            const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

            // Citas de hoy, barberos y sucursales
            const [citasHoyRes, barbersRes, branchesRes, citasMesRes, lowStockRes, completedRes] = await Promise.all([
                supabase.from("appointments").select("*, service:services(*), barber:barbers(*)").eq("appointment_date", today).order("start_time"),
                supabase.from("barbers").select("*").eq("is_active", true).order("name"),
                supabase.from("branches").select("*").eq("active", true).order("name"),
                supabase.from("appointments").select("*", { count: "exact", head: true }).gte("appointment_date", monthStart).lte("appointment_date", monthEnd),
                supabase.from("products").select("*", { count: "exact", head: true }).lte("stock", 5).eq("is_active", true),
                supabase.from("appointments").select("service:services(price)").eq("status", "completed").gte("appointment_date", monthStart).lte("appointment_date", monthEnd)
            ]);

            const citasHoyData = citasHoyRes.data || [];
            const barbersData = barbersRes.data || [];
            const branchesData = branchesRes.data || [];
            const citasMesCount = citasMesRes.count || 0;
            const lowStockCount = lowStockRes.count || 0;
            const completedAppointments = completedRes.data || [];

            const ingresosMes = completedAppointments.reduce((sum, apt) => {
                const service = Array.isArray(apt.service) ? apt.service[0] : apt.service;
                return sum + (service?.price || 0);
            }, 0) || 0;

            setStats({
                citasHoy: citasHoyData.length,
                citasMes: citasMesCount,
                ingresosMes,
                productosLowStock: lowStockCount,
            });

            setCitasHoy(citasHoyData);
            setBarbers(barbersData);
            setBranches(branchesData);
            setIsLoading(false);
        }

        loadDashboard();
    }, []);

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
            title: "Citas Hoy",
            value: stats.citasHoy,
            icon: Calendar,
            color: "text-blue-400",
            bgColor: "bg-blue-400/10",
        },
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
            <div id="admin-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
