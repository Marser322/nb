"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useFeatures } from "@/lib/features";
import { usePermissions } from "@/lib/usePermissions";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDateRangePicker } from "@/components/admin/date-range-picker";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { DateRange } from "react-day-picker";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import {
    COMPENSATION_MODEL_LABELS,
    PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
import {
    DollarSign,
    Scissors,
    Calendar as CalendarIcon,
    Loader2,
    TrendingUp,
    AlertTriangle,
    Plus,
    Building,
    User,
    CheckCircle,
} from "lucide-react";
import type { Barber, BarberSettlement, SettlementPreview } from "@/types/database.types";

export default function AdminLiquidacionesPage() {
    const { features, isLoaded } = useFeatures();
    const { can, isLoaded: permissionsLoaded } = usePermissions();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && !features.contabilidad) {
            toast.error("El módulo contable no está activo");
            router.replace("/admin/dashboard");
        }
    }, [isLoaded, features.contabilidad, router]);

    useEffect(() => {
        if (permissionsLoaded && !can("finances.view")) {
            toast.error("No tenés permiso para ver liquidaciones");
            router.replace("/admin/dashboard");
        }
    }, [permissionsLoaded, can, router]);

    const supabase = createClient();

    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [selectedBarberId, setSelectedBarberId] = useState<string>("all");
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfWeek(new Date(), { weekStartsOn: 1 }), // Lunes de esta semana
        to: endOfWeek(new Date(), { weekStartsOn: 1 }), // Domingo de esta semana
    });

    const [previewData, setPreviewData] = useState<SettlementPreview | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [history, setHistory] = useState<(BarberSettlement & { barber?: Barber })[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);

    const [registerPayout, setRegisterPayout] = useState(true);
    const [isClosing, setIsClosing] = useState(false);

    // Diálogo Renta Cobrada
    const [isRentaDialogOpen, setIsRentaDialogOpen] = useState(false);
    const [rentaBarberId, setRentaBarberId] = useState("");
    const [rentaForm, setRentaForm] = useState({
        amount: "",
        description: "Cobro de renta de sillón",
        paymentMethod: "cash",
    });
    const [isRentaSubmitting, setIsRentaSubmitting] = useState(false);

    // Cargar barberos
    useEffect(() => {
        async function loadBarbers() {
            const { data } = await supabase
                .from("barbers")
                .select("*")
                .eq("is_active", true)
                .order("name");
            setBarbers(data || []);
            if (data && data.length > 0) {
                // Seleccionar el primero por defecto para el preview
                setSelectedBarberId(data[0].id);
            }
        }
        loadBarbers();
    }, [supabase]);

    // Cargar historial
    const loadHistory = useCallback(async () => {
        setIsHistoryLoading(true);
        const { data } = await supabase
            .from("barber_settlements")
            .select("*, barber:barbers(*)")
            .order("created_at", { ascending: false });
        setHistory(data || []);
        setIsHistoryLoading(false);
    }, [supabase]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // Obtener preview
    const loadPreview = useCallback(async () => {
        if (selectedBarberId === "all" || !dateRange?.from || !dateRange?.to) {
            setPreviewData(null);
            return;
        }

        setIsPreviewLoading(true);
        const fromStr = format(dateRange.from, "yyyy-MM-dd");
        const toStr = format(dateRange.to, "yyyy-MM-dd");

        try {
            const { data, error } = await supabase.rpc("get_barber_settlement", {
                p_barber_id: selectedBarberId,
                p_from: fromStr,
                p_to: toStr,
            });

            if (error) {
                toast.error("Error al previsualizar liquidación: " + error.message);
                setPreviewData(null);
            } else {
                setPreviewData(data as unknown as SettlementPreview);
            }
        } catch (err: unknown) {
            console.error(err);
            setPreviewData(null);
        } finally {
            setIsPreviewLoading(false);
        }
    }, [selectedBarberId, dateRange, supabase]);

    useEffect(() => {
        loadPreview();
    }, [loadPreview]);

    // Presets de fechas
    const setPresetRange = (type: "this_week" | "last_week" | "this_month" | "last_month") => {
        const now = new Date();
        if (type === "this_week") {
            setDateRange({
                from: startOfWeek(now, { weekStartsOn: 1 }),
                to: endOfWeek(now, { weekStartsOn: 1 }),
            });
        } else if (type === "last_week") {
            const prev = subDays(now, 7);
            setDateRange({
                from: startOfWeek(prev, { weekStartsOn: 1 }),
                to: endOfWeek(prev, { weekStartsOn: 1 }),
            });
        } else if (type === "this_month") {
            setDateRange({
                from: startOfMonth(now),
                to: endOfMonth(now),
            });
        } else if (type === "last_month") {
            const prev = subDays(startOfMonth(now), 5); // cualquier día del mes anterior
            setDateRange({
                from: startOfMonth(prev),
                to: endOfMonth(prev),
            });
        }
    };

    // Cerrar Liquidación
    const handleCloseSettlement = async () => {
        if (!previewData || selectedBarberId === "all" || !dateRange?.from || !dateRange?.to) return;

        setIsClosing(true);
        const fromStr = format(dateRange.from, "yyyy-MM-dd");
        const toStr = format(dateRange.to, "yyyy-MM-dd");

        try {
            const { data, error } = await supabase.rpc("close_barber_settlement", {
                p_barber_id: selectedBarberId,
                p_from: fromStr,
                p_to: toStr,
                p_register_payout: registerPayout,
            });

            if (error) {
                if (error.message.includes("PERIODO_YA_LIQUIDADO")) {
                    toast.error("El período o rango de fechas seleccionado se superpone con una liquidación ya cerrada de este barbero.");
                } else {
                    toast.error("Error al cerrar liquidación: " + error.message);
                }
            } else {
                toast.success("¡Liquidación cerrada con éxito!");
                loadPreview();
                loadHistory();
            }
        } catch (err: unknown) {
            console.error(err);
            toast.error("Error al cerrar liquidación");
        } finally {
            setIsClosing(false);
        }
    };

    // Registrar Renta Cobrada
    const handleRegisterRenta = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rentaBarberId) {
            toast.error("Seleccioná un barbero");
            return;
        }

        const amountVal = parseFloat(rentaForm.amount);
        if (isNaN(amountVal) || amountVal <= 0) {
            toast.error("Monto inválido");
            return;
        }

        setIsRentaSubmitting(true);

        try {
            // Obtener branch del barbero
            const { data: barber } = await supabase
                .from("barbers")
                .select("branch_id")
                .eq("id", rentaBarberId)
                .single();

            const { data: { user } } = await supabase.auth.getUser();

            const { error } = await supabase.from("cash_movements").insert({
                type: "income",
                category: "chair_rental",
                amount: amountVal,
                payment_method: rentaForm.paymentMethod,
                description: rentaForm.description,
                barber_id: rentaBarberId,
                branch_id: barber?.branch_id || null,
                created_by: user?.id || null,
            });

            if (error) {
                toast.error("Error al registrar renta: " + error.message);
            } else {
                toast.success("Pago de renta registrado en caja");
                setIsRentaDialogOpen(false);
                setRentaForm({
                    amount: "",
                    description: "Cobro de renta de sillón",
                    paymentMethod: "cash",
                });
                // Recargar el preview si corresponde
                loadPreview();
            }
        } catch (err: unknown) {
            console.error(err);
            toast.error("Ocurrió un error inesperado.");
        } finally {
            setIsRentaSubmitting(false);
        }
    };

    if (!isLoaded || !features.contabilidad || !permissionsLoaded || !can("finances.view")) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8 text-foreground">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Liquidaciones</h1>
                    <p className="text-muted-foreground mt-1">
                        Gestioná el pago de comisiones y controlá el alquiler de sillones.
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <Button
                        onClick={() => {
                            setRentaBarberId(selectedBarberId !== "all" ? selectedBarberId : "");
                            setIsRentaDialogOpen(true);
                        }}
                        className="admin-accent-button font-semibold"
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Registrar Renta Cobrada
                    </Button>
                </div>
            </div>

            {/* Filtros y Preview */}
            <div className="grid gap-6 lg:grid-cols-3">
                {/* Panel de Filtros */}
                <Card id="admin-liquidations-form" className="bg-card border-border lg:col-span-1">
                    <CardHeader>
                        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
                            Parámetros de Liquidación
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                                Barbero
                            </label>
                            <Select
                                value={selectedBarberId}
                                onValueChange={setSelectedBarberId}
                            >
                                <SelectTrigger className="bg-background border-border text-foreground">
                                    <SelectValue placeholder="Seleccioná un barbero" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    {barbers.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>
                                            {b.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                                Período de liquidación
                            </label>
                            <div className="bg-background border border-border rounded-md p-1">
                                <CalendarDateRangePicker date={dateRange} setDate={setDateRange} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2">
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-border hover:bg-muted text-xs"
                                onClick={() => setPresetRange("this_week")}
                            >
                                Esta Semana
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-border hover:bg-muted text-xs"
                                onClick={() => setPresetRange("last_week")}
                            >
                                Semana Pasada
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-border hover:bg-muted text-xs"
                                onClick={() => setPresetRange("this_month")}
                            >
                                Este Mes
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-border hover:bg-muted text-xs"
                                onClick={() => setPresetRange("last_month")}
                            >
                                Mes Pasado
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Panel de Preview */}
                <Card className="bg-card border-border lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <div>
                            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
                                Resumen del Período
                            </CardTitle>
                            <CardDescription>
                                Previsualización de montos y deducciones calculados en tiempo real.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {isPreviewLoading ? (
                            <div className="space-y-4 py-4">
                                <div className="h-6 bg-muted/40 rounded w-1/3 animate-pulse" />
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />
                                    <div className="h-20 bg-muted/30 rounded-lg animate-pulse" />
                                </div>
                                <div className="h-24 bg-muted/20 rounded animate-pulse" />
                            </div>
                        ) : !previewData ? (
                            <div className="text-center py-12 text-muted-foreground text-sm">
                                Seleccioná un barbero y un período para ver el preview.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Alerta de compensación no configurada */}
                                {!previewData.has_compensation && (
                                    <div className="admin-warning-surface flex items-start gap-3 rounded-lg border p-3 text-xs leading-relaxed">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <div>
                                            <span className="font-semibold block mb-0.5">Sin compensación configurada</span>
                                            Este barbero no posee un acuerdo vigente a la fecha del período. Se calcula comisionando el 0% (el 100% de la caja va para la casa). Podés configurarle un acuerdo desde el menú de Barberos.
                                        </div>
                                    </div>
                                )}

                                {/* Detalles del acuerdo vigente */}
                                <div className="p-3 bg-muted/40 rounded-lg border border-border text-xs flex justify-between gap-4">
                                    <div>
                                        <span className="text-muted-foreground block font-medium">Esquema Vigente</span>
                                        <span className="font-semibold text-foreground mt-0.5 block">
                                            {COMPENSATION_MODEL_LABELS[previewData.model]}
                                        </span>
                                    </div>
                                    {previewData.commission_pct !== null && (
                                        <div>
                                            <span className="text-muted-foreground block font-medium">Comisión Barbero</span>
                                            <span className="font-semibold text-foreground mt-0.5 block">
                                                {previewData.commission_pct}%
                                            </span>
                                        </div>
                                    )}
                                    {previewData.rental_amount !== null && (
                                        <div>
                                            <span className="text-muted-foreground block font-medium">Renta Sillón</span>
                                            <span className="font-semibold text-foreground mt-0.5 block">
                                                {formatPrice(previewData.rental_amount)} ({previewData.rental_period === "weekly" ? "Semanal" : "Mensual"})
                                            </span>
                                        </div>
                                    )}
                                    {previewData.model === "employee" && (
                                        <div>
                                            <span className="text-muted-foreground block font-medium">Sueldo Asignado</span>
                                            <span className="font-semibold text-foreground mt-0.5 block">
                                                {formatPrice(previewData.salary_amount || 0)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* Grilla de Totales */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-muted/40 border border-border rounded-lg p-3">
                                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Cortes (Servicios)</span>
                                        <div className="text-lg font-bold text-foreground mt-0.5">
                                            {formatPrice(previewData.services_total)}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                            {previewData.appointments_count} citas cobradas
                                        </span>
                                    </div>

                                    <div className="bg-muted/40 border border-border rounded-lg p-3">
                                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Propinas</span>
                                        <div className="admin-warning-text text-lg font-bold mt-0.5">
                                            {formatPrice(previewData.tips_total)}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                            100% para barbero
                                        </span>
                                    </div>

                                    <div className="admin-warning-card rounded-lg border p-3">
                                        <span className="admin-warning-text text-[10px] uppercase font-semibold">Total Barbero</span>
                                        <div className="text-xl font-bold text-primary text-glow mt-0.5">
                                            {formatPrice(previewData.barber_total)}
                                        </div>
                                        {previewData.rental_due > 0 && (
                                            <span className="text-[9px] text-red-400 mt-0.5 block font-medium">
                                                Debe renta: {formatPrice(previewData.rental_due)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="bg-muted/40 border border-border rounded-lg p-3">
                                        <span className="text-[10px] text-muted-foreground uppercase font-semibold">Total Casa</span>
                                        <div className="text-lg font-bold text-foreground mt-0.5">
                                            {formatPrice(previewData.house_total)}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                                            Neto de servicios
                                        </span>
                                    </div>
                                </div>

                                {/* Acciones de Cierre */}
                                <div className="border-t border-border pt-4 flex flex-col md:flex-row items-center justify-between gap-4">
                                    <div className="flex items-center space-x-2">
                                        <Switch
                                            id="payout"
                                            checked={registerPayout}
                                            onCheckedChange={setRegisterPayout}
                                        />
                                        <label
                                            htmlFor="payout"
                                            className="text-xs font-medium leading-none text-muted-foreground select-none cursor-pointer"
                                        >
                                            Registrar egreso de liquidación automáticamente en la caja
                                        </label>
                                    </div>

                                    <Button
                                        onClick={handleCloseSettlement}
                                        disabled={isClosing}
                                        className="bg-green-600 hover:bg-green-700 text-white font-semibold w-full md:w-auto"
                                    >
                                        {isClosing ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Cerrando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="mr-2 h-4 w-4" />
                                                Cerrar Liquidación
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Historial Histórico */}
            <div className="rounded-md border border-border bg-card">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold flex items-center gap-2 text-primary">
                        <TrendingUp className="h-4 w-4" />
                        Historial de Liquidaciones Cerradas
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                    <TableHeader className="bg-muted/40">
                        <TableRow className="border-border">
                            <TableHead className="text-muted-foreground">Barbero</TableHead>
                            <TableHead className="text-muted-foreground">Período</TableHead>
                            <TableHead className="text-muted-foreground">Modelo</TableHead>
                            <TableHead className="text-right text-muted-foreground">Cortes</TableHead>
                            <TableHead className="text-right text-muted-foreground">Propinas</TableHead>
                            <TableHead className="text-right text-muted-foreground">A Barbero</TableHead>
                            <TableHead className="text-right text-muted-foreground">A Casa</TableHead>
                            <TableHead className="text-center text-muted-foreground">Estado</TableHead>
                            <TableHead className="text-muted-foreground">Fecha Cierre</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isHistoryLoading ? (
                            [...Array(3)].map((_, i) => (
                                <TableRow key={i} className="animate-pulse">
                                    <TableCell>
                                        <div className="h-4 bg-muted/40 rounded w-24" />
                                    </TableCell>
                                    <TableCell>
                                        <div className="h-4 bg-muted/30 rounded w-32" />
                                    </TableCell>
                                    <TableCell>
                                        <div className="h-4 bg-muted/30 rounded w-20" />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="h-4 bg-muted/40 rounded w-10 ml-auto" />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="h-4 bg-muted/40 rounded w-12 ml-auto" />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="h-4 bg-muted/40 rounded w-14 ml-auto" />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="h-4 bg-muted/40 rounded w-14 ml-auto" />
                                    </TableCell>
                                    <TableCell>
                                        <div className="h-5 bg-muted/30 rounded w-16 mx-auto" />
                                    </TableCell>
                                    <TableCell>
                                        <div className="h-4 bg-muted/30 rounded w-20" />
                                    </TableCell>
                                </TableRow>
                            ))
                        ) : history.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                                    <TrendingUp className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                                    <p className="font-semibold text-lg text-foreground/80">No hay liquidaciones cerradas</p>
                                    <p className="text-sm mt-1 mb-4">Las liquidaciones procesadas y cerradas se listarán aquí.</p>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={loadHistory}
                                    >
                                        Actualizar
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ) : (
                            history.map((s) => (
                                <TableRow key={s.id} className="border-border/50 hover:bg-muted/10">
                                    <TableCell className="font-medium text-foreground flex items-center gap-2">
                                        <User className="h-3.5 w-3.5 text-primary" />
                                        {s.barber?.name || "Desconocido"}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                        {format(new Date(s.period_from + "T12:00:00"), "dd/MM/yy")} - {format(new Date(s.period_to + "T12:00:00"), "dd/MM/yy")}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {COMPENSATION_MODEL_LABELS[s.model]}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-xs">{formatPrice(s.services_total)}</TableCell>
                                    <TableCell className="admin-warning-text text-right font-mono text-xs">{formatPrice(s.tips_total)}</TableCell>
                                    <TableCell className="text-right font-bold text-primary font-mono text-xs">{formatPrice(s.barber_total)}</TableCell>
                                    <TableCell className="text-right font-mono text-xs">{formatPrice(s.house_total)}</TableCell>
                                    <TableCell className="text-center">
                                        <Badge
                                            variant="outline"
                                            className={
                                                s.status === "paid"
                                                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                                                    : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                            }
                                        >
                                            {s.status === "paid" ? "Pagada" : "Cerrada"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {format(new Date(s.created_at), "dd/MM/yyyy HH:mm")}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                </div>
            </div>

            {/* Dialog Registrar Renta Cobrada */}
            <Dialog open={isRentaDialogOpen} onOpenChange={setIsRentaDialogOpen}>
                <DialogContent className="bg-card border-border text-foreground max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Building className="h-5 w-5 text-primary" />
                            Registrar Renta Cobrada
                        </DialogTitle>
                    </DialogHeader>

                    <form onSubmit={handleRegisterRenta} className="space-y-4 mt-4">
                        <div>
                            <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                                Barbero
                            </label>
                            <Select
                                value={rentaBarberId}
                                onValueChange={setRentaBarberId}
                            >
                                <SelectTrigger className="bg-background border-border text-foreground">
                                    <SelectValue placeholder="Seleccioná al barbero" />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    {barbers.map((b) => (
                                        <SelectItem key={b.id} value={b.id}>
                                            {b.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                                Monto Cobrado (UYU)
                            </label>
                            <Input
                                type="number"
                                min="0"
                                placeholder="3500"
                                value={rentaForm.amount}
                                onChange={(e) => setRentaForm({ ...rentaForm, amount: e.target.value })}
                                required
                                className="bg-background border-border text-foreground"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                                Descripción
                            </label>
                            <Input
                                value={rentaForm.description}
                                onChange={(e) => setRentaForm({ ...rentaForm, description: e.target.value })}
                                required
                                className="bg-background border-border text-foreground"
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
                                Método
                            </label>
                            <Select
                                value={rentaForm.paymentMethod}
                                onValueChange={(v) => setRentaForm({ ...rentaForm, paymentMethod: v })}
                            >
                                <SelectTrigger className="bg-background border-border text-foreground">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-card border-border text-foreground">
                                    <SelectItem value="cash">Efectivo</SelectItem>
                                    <SelectItem value="transfer">Transferencia</SelectItem>
                                    <SelectItem value="card">Tarjeta</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <DialogFooter className="pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsRentaDialogOpen(false)}
                                disabled={isRentaSubmitting}
                                className="border-border hover:bg-muted"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={isRentaSubmitting}
                                className="bg-primary text-black hover:bg-primary/90 font-bold"
                            >
                                {isRentaSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Registrando...
                                    </>
                                ) : (
                                    "Registrar Cobro"
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
