"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    Calendar,
    CalendarRange,
    Clock,
    User,
    CheckCircle,
    XCircle,
    Phone,
    MessageSquare,
    MessageCircle,
    ArrowRight,
    Trash2,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { formatPrice, cn } from "@/lib/utils";
import {
    APPOINTMENT_STATUS,
    APPOINTMENT_STATUS_LABELS,
    APPOINTMENT_STATUS_COLORS,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { getBookingErrorMessage } from "@/lib/booking-errors";
import { resolveBarberSession } from "@/lib/barber-session";
import { buildWaLink } from "@/lib/whatsapp";
import { findScheduleBlockConflicts, type ScheduleBlockConflict } from "@/lib/booking";
import { ScheduleBlockConflictDialog } from "@/components/admin/schedule-block-conflict-dialog";
import type { Appointment, Service, Profile, ScheduleBlock } from "@/types/database.types";
import { format, startOfToday, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import ChargeDialog from "@/components/shared/ChargeDialog";
import { useFeatures } from "@/lib/features";

type AppointmentWithRelations = Appointment & {
    service?: Service;
    client?: Profile;
};

const TODAY_STR = format(startOfToday(), "yyyy-MM-dd");

export default function BarberoAgendaPage() {
    const { features, isLoaded } = useFeatures();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && !features.portal_barbero) {
            toast.error("El portal de barberos no está disponible");
            router.replace("/");
        }
    }, [isLoaded, features.portal_barbero, router]);

    const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [barberId, setBarberId] = useState<string | null>(null);
    const [barberName, setBarberName] = useState<string | null>(null);
    const [accessError, setAccessError] = useState<string | null>(null);
    const [chargeApt, setChargeApt] = useState<AppointmentWithRelations | null>(null);
    const [ingresosReales, setIngresosReales] = useState(0);
    const [selectedDate, setSelectedDate] = useState(TODAY_STR);

    // Ausencias propias ("Mis ausencias"): mismo patrón de bloqueos que
    // /admin/barberos, pero acotado al barbero autenticado y sin branch_id
    // (la RLS "Barbers manage own blocks" exige branch_id NULL en el INSERT).
    const [myBlocks, setMyBlocks] = useState<ScheduleBlock[]>([]);
    const [isBlocksLoading, setIsBlocksLoading] = useState(false);
    const [isBlocksDialogOpen, setIsBlocksDialogOpen] = useState(false);
    const [blockForm, setBlockForm] = useState({
        startDate: "",
        endDate: "",
        isFullDay: true,
        startTime: "09:00",
        endTime: "18:00",
        reason: "",
    });
    const [isCreatingBlock, setIsCreatingBlock] = useState(false);
    const [blockConflicts, setBlockConflicts] = useState<ScheduleBlockConflict[] | null>(null);
    const [isCheckingBlockConflicts, setIsCheckingBlockConflicts] = useState(false);

    const supabase = useMemo(() => createClient(), []);
    const isToday = selectedDate === TODAY_STR;

    // Próximos 7 días para la navegación rápida (mismo patrón que admin/citas).
    const quickDates = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(startOfToday(), i)),
        []
    );

    // Generar los turnos fijos (suscripciones) es oportunista: se dispara una
    // sola vez sin bloquear el primer render de la agenda.
    useEffect(() => {
        (async () => {
            try {
                await supabase.rpc("generate_subscription_appointments");
            } catch (err) {
                console.error("Error generating subscription appointments:", err);
            }
        })();
    }, [supabase]);

    const loadAgenda = useCallback(async () => {
        setIsLoading(true);

        const session = await resolveBarberSession(supabase);

        if (session.status === "unauthenticated") {
            setAccessError("Iniciá sesión para ver tu agenda.");
            setIsLoading(false);
            return;
        }

        if (session.status === "not-linked") {
            setAccessError(
                "Tu usuario no está vinculado a un perfil de barbero. Pedile al administrador que te vincule desde el panel de Barberos."
            );
            setIsLoading(false);
            return;
        }

        setBarberName(session.barberName);
        setBarberId(session.barberId);

        // Cargar citas del día seleccionado
        const { data: appointmentsData } = await supabase
            .from("appointments")
            .select("*, service:services(*), client:profiles(*)")
            .eq("barber_id", session.barberId)
            .eq("appointment_date", selectedDate)
            .not("status", "eq", APPOINTMENT_STATUS.CANCELLED)
            .order("start_time");

        setAppointments(appointmentsData || []);

        // Ingresos reales solo tienen sentido para hoy (cargos ya cobrados)
        if (isToday) {
            const { data: movements } = await supabase
                .from("cash_movements")
                .select("amount")
                .eq("barber_id", session.barberId)
                .eq("type", "income")
                .gte("created_at", `${selectedDate}T00:00:00`)
                .lte("created_at", `${selectedDate}T23:59:59`);

            const totalReales = (movements || []).reduce(
                (sum, m) => sum + Number(m.amount),
                0
            );
            setIngresosReales(totalReales);
        } else {
            setIngresosReales(0);
        }

        setIsLoading(false);
    }, [selectedDate, isToday, supabase]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadAgenda();
    }, [loadAgenda]);

    const updateStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase.rpc("admin_update_appointment_status", {
            p_appointment_id: id,
            p_status: newStatus,
        });

        if (error) {
            toast.error(getBookingErrorMessage(error));
            return;
        }

        toast.success(`Cita ${APPOINTMENT_STATUS_LABELS[newStatus].toLowerCase()}`);
        loadAgenda(); // Recargar todo para actualizar estadísticas e ingresos si corresponde
    };

    const loadMyBlocks = useCallback(async (bId: string) => {
        setIsBlocksLoading(true);
        const { data } = await supabase
            .from("schedule_blocks")
            .select("*")
            .eq("barber_id", bId)
            .gte("end_date", TODAY_STR)
            .order("start_date", { ascending: true });

        setMyBlocks(data || []);
        setIsBlocksLoading(false);
    }, [supabase]);

    useEffect(() => {
        if (barberId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadMyBlocks(barberId);
        }
    }, [barberId, loadMyBlocks]);

    // Inserta la ausencia ya validada (sin choques, o el barbero decidió crearla igual)
    const insertMyBlock = async () => {
        if (!barberId) return;

        setIsCreatingBlock(true);
        // No enviar branch_id: la policy "Barbers manage own blocks" exige
        // branch_id IS NULL en el WITH CHECK del INSERT.
        const { error } = await supabase
            .from("schedule_blocks")
            .insert({
                barber_id: barberId,
                start_date: blockForm.startDate,
                end_date: blockForm.endDate,
                start_time: blockForm.isFullDay ? null : blockForm.startTime,
                end_time: blockForm.isFullDay ? null : blockForm.endTime,
                reason: blockForm.reason || null,
            });

        setIsCreatingBlock(false);
        setBlockConflicts(null);
        if (error) {
            toast.error("Error al registrar la ausencia");
        } else {
            toast.success("Ausencia registrada con éxito");
            setBlockForm({
                startDate: "",
                endDate: "",
                isFullDay: true,
                startTime: "09:00",
                endTime: "18:00",
                reason: "",
            });
            loadMyBlocks(barberId);
        }
    };

    const handleCreateMyBlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!barberId) return;

        if (!blockForm.startDate || !blockForm.endDate) {
            toast.error("Ingresá fechas de inicio y fin válidas");
            return;
        }

        if (blockForm.endDate < blockForm.startDate) {
            toast.error("La fecha de fin debe ser posterior o igual a la de inicio");
            return;
        }

        if (!blockForm.isFullDay && blockForm.endTime <= blockForm.startTime) {
            toast.error("La hora de fin debe ser posterior al inicio");
            return;
        }

        if (!blockForm.reason.trim()) {
            toast.error("Contá el motivo de tu ausencia");
            return;
        }

        setIsCheckingBlockConflicts(true);
        const conflicts = await findScheduleBlockConflicts(supabase, {
            barberIds: [barberId],
            startDate: blockForm.startDate,
            endDate: blockForm.endDate,
            startTime: blockForm.isFullDay ? null : blockForm.startTime,
            endTime: blockForm.isFullDay ? null : blockForm.endTime,
        });
        setIsCheckingBlockConflicts(false);

        if (conflicts.length > 0) {
            setBlockConflicts(conflicts);
            return;
        }

        await insertMyBlock();
    };

    const handleDeleteMyBlock = async (blockId: string) => {
        const { error } = await supabase
            .from("schedule_blocks")
            .delete()
            .eq("id", blockId);

        if (error) {
            toast.error("Error al eliminar la ausencia");
        } else {
            toast.success("Ausencia eliminada");
            if (barberId) {
                loadMyBlocks(barberId);
            }
        }
    };

    // Bloqueo propio vigente en una fecha dada (para marcar la nav de 7 días
    // y para calcular el título/motivo mostrado en el tooltip).
    const findBlockForDate = (dateStr: string) =>
        myBlocks.find((block) => dateStr >= block.start_date && dateStr <= block.end_date) || null;

    // Estadísticas del día
    const stats = {
        total: appointments.length,
        pendientes: appointments.filter((a) => a.status === APPOINTMENT_STATUS.PENDING).length,
        confirmadas: appointments.filter((a) => a.status === APPOINTMENT_STATUS.CONFIRMED).length,
        completadas: appointments.filter((a) => a.status === APPOINTMENT_STATUS.COMPLETED).length,
    };

    // Citas activas (pendiente/confirmada), ordenadas, para calcular "Ahora sigue"
    // y los ingresos previstos de días futuros/pasados sin cargos reales.
    const activeAppointments = useMemo(
        () =>
            appointments
                .filter(
                    (a) =>
                        a.status === APPOINTMENT_STATUS.PENDING ||
                        a.status === APPOINTMENT_STATUS.CONFIRMED
                )
                .sort((a, b) => a.start_time.localeCompare(b.start_time)),
        [appointments]
    );

    const nextAppointment = useMemo(() => {
        if (!isToday) return null;
        const nowStr = format(new Date(), "HH:mm");
        return (
            activeAppointments.find((a) => a.start_time.slice(0, 5) >= nowStr) ||
            activeAppointments[0] ||
            null
        );
    }, [activeAppointments, isToday]);

    const ingresosPrevistos = useMemo(
        () => activeAppointments.reduce((sum, a) => sum + Number(a.service?.price || 0), 0),
        [activeAppointments]
    );

    const selectedDateLabel = format(
        new Date(`${selectedDate}T12:00:00`),
        "EEEE, d 'de' MMMM yyyy",
        { locale: es }
    );

    const scrollToAppointment = (id: string) => {
        document
            .getElementById(`cita-${id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    // Guard de módulo: se evalúa DESPUÉS de todos los hooks para no violar las Reglas de Hooks.
    if (!isLoaded || !features.portal_barbero) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    if (!isLoading && accessError) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Card className="border-border/50 max-w-md">
                    <CardContent className="p-8 text-center">
                        <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                        <h2 className="font-semibold text-lg mb-2">Sin acceso a la agenda</h2>
                        <p className="text-sm text-muted-foreground">{accessError}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">
                        Mi Agenda{barberName ? ` · ${barberName}` : ""}
                    </h1>
                    <p className="text-muted-foreground capitalize">{selectedDateLabel}</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsBlocksDialogOpen(true)}
                    className="gap-2 self-start md:self-auto"
                >
                    <CalendarRange className="h-4 w-4" />
                    Mis ausencias{myBlocks.length > 0 ? ` (${myBlocks.length})` : ""}
                </Button>
            </div>

            {/* Navegación de días */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {quickDates.map((date) => {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const isSelected = selectedDate === dateStr;
                    const blockForDay = findBlockForDate(dateStr);
                    return (
                        <button
                            key={dateStr}
                            onClick={() => setSelectedDate(dateStr)}
                            aria-pressed={isSelected}
                            title={blockForDay ? `Ausencia: ${blockForDay.reason || "sin motivo especificado"}` : undefined}
                            className={cn(
                                "relative flex flex-shrink-0 min-w-16 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 transition-colors",
                                isSelected
                                    ? "border-primary/50 bg-primary/15 text-primary"
                                    : "border-border/50 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground",
                                blockForDay && !isSelected && "border-dashed"
                            )}
                        >
                            <span className="text-[10px] uppercase tracking-wide">
                                {format(date, "EEE", { locale: es })}
                            </span>
                            <span className="text-lg font-bold">{format(date, "d")}</span>
                            {blockForDay && (
                                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-muted-foreground/70 ring-2 ring-background" />
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Ahora sigue */}
            {isToday && nextAppointment && (
                <Card className="border-primary/40 bg-primary/5">
                    <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                                <ArrowRight className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-primary">
                                    Ahora sigue
                                </p>
                                <p className="font-semibold">
                                    {nextAppointment.start_time.slice(0, 5)} ·{" "}
                                    {nextAppointment.service?.name} ·{" "}
                                    {nextAppointment.client?.full_name || "Cliente sin nombre"}
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => scrollToAppointment(nextAppointment.id)}
                        >
                            Ver cita
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-border/50">
                    <CardContent className="p-4">
                        <p className="text-3xl font-bold">{stats.total}</p>
                        <p className="text-sm text-muted-foreground">
                            {isToday ? "Citas Hoy" : "Citas ese día"}
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="p-4">
                        <p className="text-3xl font-bold text-primary">{stats.pendientes}</p>
                        <p className="text-sm text-muted-foreground">Pendientes</p>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="p-4">
                        <p className="text-3xl font-bold">{stats.confirmadas}</p>
                        <p className="text-sm text-muted-foreground">
                            Confirmadas · {stats.completadas} completadas
                        </p>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="p-4">
                        <p className="text-3xl font-bold text-primary">
                            {formatPrice(isToday ? ingresosReales : ingresosPrevistos)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {isToday ? "Ingresos del Día" : "Ingresos previstos"}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Agenda */}
            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        {isToday ? "Citas de Hoy" : "Citas del día"}
                    </CardTitle>
                    <CardDescription>
                        {stats.total} citas programadas
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="h-24 bg-muted/50 rounded-lg animate-pulse" />
                            ))}
                        </div>
                    ) : appointments.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                            <p>No tenés citas para {isToday ? "hoy" : "ese día"}</p>
                            <p className="text-sm mt-1">¡Disfrutá del descanso! 🎉</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {appointments.map((cita, index) => {
                                const isPast =
                                    isToday && cita.start_time.slice(0, 5) < format(new Date(), "HH:mm");
                                const isNext = nextAppointment?.id === cita.id;
                                const nombreCliente = cita.client?.full_name?.split(" ")[0];
                                const cuandoTexto = isToday
                                    ? "de hoy"
                                    : `del ${format(new Date(`${selectedDate}T12:00:00`), "d/MM")}`;
                                const waMessage = `Hola${nombreCliente ? ` ${nombreCliente}` : ""}! Te escribo de NB Barber por tu cita ${cuandoTexto} a las ${cita.start_time.slice(0, 5)}.`;
                                const waLink = cita.client?.phone
                                    ? buildWaLink(cita.client.phone, waMessage)
                                    : "";

                                return (
                                <div
                                    key={cita.id}
                                    id={`cita-${cita.id}`}
                                    className={cn(
                                        "flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-card border gap-4 transition-opacity",
                                        isNext ? "border-primary/50 ring-1 ring-primary/30" : "border-border/50",
                                        isPast && "opacity-60"
                                    )}
                                >
                                    {/* Número y Hora */}
                                    <div className="flex items-start gap-4">
                                        <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary font-bold">
                                            {index + 1}
                                        </div>
                                        <div className="text-center min-w-[80px] bg-muted/50 rounded-lg p-2">
                                            <Clock className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                                            <p className="text-lg font-bold">{cita.start_time.slice(0, 5)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                - {cita.end_time.slice(0, 5)}
                                            </p>
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-semibold">{cita.service?.name}</p>
                                                <Badge
                                                    variant="outline"
                                                    className={APPOINTMENT_STATUS_COLORS[cita.status]}
                                                >
                                                    {APPOINTMENT_STATUS_LABELS[cita.status]}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <User className="h-3 w-3" />
                                                {cita.client?.full_name || "Cliente sin nombre"}
                                            </div>
                                            {cita.client?.phone && (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <a
                                                        href={`tel:${cita.client.phone}`}
                                                        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                                                        aria-label={`Llamar a ${cita.client.full_name || "cliente"}`}
                                                    >
                                                        <Phone className="h-3.5 w-3.5" />
                                                        Llamar
                                                    </a>
                                                    {waLink && (
                                                        <a
                                                            href={waLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                                                            aria-label={`Escribir por WhatsApp a ${cita.client.full_name || "cliente"}`}
                                                        >
                                                            <MessageCircle className="h-3.5 w-3.5" />
                                                            WhatsApp
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                            {cita.notes && (
                                                <div className="flex items-start gap-2 text-xs text-muted-foreground mt-2 bg-muted/30 p-2 rounded">
                                                    <MessageSquare className="h-3 w-3 mt-0.5" />
                                                    {cita.notes}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Precio y Acciones */}
                                    <div className="flex flex-col items-end gap-2">
                                        <p className="text-lg font-bold text-primary">
                                            {cita.service && formatPrice(cita.service.price)}
                                        </p>

                                        {cita.status === APPOINTMENT_STATUS.PENDING && (
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => updateStatus(cita.id, APPOINTMENT_STATUS.CONFIRMED)}
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-1" />
                                                    Confirmar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                                    onClick={() => updateStatus(cita.id, APPOINTMENT_STATUS.CANCELLED)}
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}

                                        {cita.status === APPOINTMENT_STATUS.CONFIRMED && (
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => {
                                                        if (features.contabilidad) {
                                                            setChargeApt(cita);
                                                        } else {
                                                            updateStatus(cita.id, APPOINTMENT_STATUS.COMPLETED);
                                                        }
                                                    }}
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-1" />
                                                    Completar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-muted-foreground"
                                                    onClick={() => updateStatus(cita.id, APPOINTMENT_STATUS.NO_SHOW)}
                                                >
                                                    <XCircle className="h-4 w-4 mr-1" />
                                                    No vino
                                                </Button>
                                            </div>
                                        )}

                                        {cita.status === APPOINTMENT_STATUS.COMPLETED && (
                                            <Badge
                                                variant="outline"
                                                className={APPOINTMENT_STATUS_COLORS[APPOINTMENT_STATUS.COMPLETED]}
                                            >
                                                {APPOINTMENT_STATUS_LABELS[APPOINTMENT_STATUS.COMPLETED]}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {chargeApt && (
                <ChargeDialog
                    appointment={chargeApt}
                    isOpen={chargeApt !== null}
                    onOpenChange={(open) => !open && setChargeApt(null)}
                    onSuccess={loadAgenda}
                />
            )}

            {/* Diálogo "Mis ausencias" */}
            <Dialog open={isBlocksDialogOpen} onOpenChange={setIsBlocksDialogOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarRange className="h-5 w-5 text-primary" />
                            Mis ausencias
                        </DialogTitle>
                        <DialogDescription>
                            Registrá tus vacaciones, licencias o días libres. No vas a aparecer disponible para reservas esos días.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 mt-4">
                        {/* Lista de ausencias vigentes/futuras */}
                        <div>
                            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
                                Vigentes o futuras
                            </h3>
                            {isBlocksLoading ? (
                                <div className="flex justify-center p-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                            ) : myBlocks.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">
                                    No tenés ausencias registradas.
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                                    {myBlocks.map((block) => (
                                        <div
                                            key={block.id}
                                            className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40 text-xs"
                                        >
                                            <div className="space-y-1">
                                                <div className="font-semibold text-foreground">
                                                    {block.reason || "Sin motivo especificado"}
                                                </div>
                                                <div className="text-muted-foreground flex items-center gap-3">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {block.start_date === block.end_date
                                                            ? format(new Date(`${block.start_date}T12:00:00`), "EEE d/MM", { locale: es })
                                                            : `${format(new Date(`${block.start_date}T12:00:00`), "EEE d/MM", { locale: es })} al ${format(new Date(`${block.end_date}T12:00:00`), "EEE d/MM", { locale: es })}`}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {block.start_time && block.end_time
                                                            ? `${block.start_time.slice(0, 5)} - ${block.end_time.slice(0, 5)}`
                                                            : "Día completo"}
                                                    </span>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteMyBlock(block.id)}
                                                className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 md:h-8 md:w-8"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Formulario de alta */}
                        <form onSubmit={handleCreateMyBlock} className="space-y-4 border-t border-border pt-4">
                            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
                                Nueva ausencia
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                                        Fecha de inicio
                                    </label>
                                    <Input
                                        type="date"
                                        value={blockForm.startDate}
                                        onChange={(e) => setBlockForm({ ...blockForm, startDate: e.target.value })}
                                        required
                                        className="bg-background/50 border-input/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                                        Fecha de fin
                                    </label>
                                    <Input
                                        type="date"
                                        value={blockForm.endDate}
                                        onChange={(e) => setBlockForm({ ...blockForm, endDate: e.target.value })}
                                        required
                                        className="bg-background/50 border-input/50"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Switch
                                    id="my-block-is-fullday"
                                    checked={blockForm.isFullDay}
                                    onCheckedChange={(checked) => setBlockForm({ ...blockForm, isFullDay: checked })}
                                    className="data-[state=checked]:bg-primary"
                                />
                                <label htmlFor="my-block-is-fullday" className="text-xs font-medium text-foreground cursor-pointer select-none">
                                    Día completo
                                </label>
                            </div>

                            {!blockForm.isFullDay && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                                            Hora de inicio
                                        </label>
                                        <Input
                                            type="time"
                                            value={blockForm.startTime}
                                            onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })}
                                            required
                                            className="bg-background/50 border-input/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                                            Hora de fin
                                        </label>
                                        <Input
                                            type="time"
                                            value={blockForm.endTime}
                                            onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })}
                                            required
                                            className="bg-background/50 border-input/50"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">
                                    Motivo
                                </label>
                                <Input
                                    placeholder="Vacaciones, licencia médica, día libre..."
                                    value={blockForm.reason}
                                    onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                                    required
                                    className="bg-background/50 border-input/50"
                                />
                            </div>

                            <DialogFooter className="pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsBlocksDialogOpen(false)}
                                >
                                    Cerrar
                                </Button>
                                <Button type="submit" disabled={isCreatingBlock || isCheckingBlockConflicts}>
                                    {isCreatingBlock || isCheckingBlockConflicts ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {isCheckingBlockConflicts ? "Revisando tu agenda..." : "Guardando..."}
                                        </>
                                    ) : (
                                        "Registrar ausencia"
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </div>
                </DialogContent>
            </Dialog>

            <ScheduleBlockConflictDialog
                conflicts={blockConflicts}
                isSubmitting={isCreatingBlock}
                onConfirm={insertMyBlock}
                onCancel={() => setBlockConflicts(null)}
            />
        </div>
    );
}
