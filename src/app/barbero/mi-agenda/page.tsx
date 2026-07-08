"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    Calendar,
    Clock,
    User,
    CheckCircle,
    XCircle,
    Phone,
    MessageSquare,
    MessageCircle,
    ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { Appointment, Service, Profile } from "@/types/database.types";
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
    const [barberName, setBarberName] = useState<string | null>(null);
    const [accessError, setAccessError] = useState<string | null>(null);
    const [chargeApt, setChargeApt] = useState<AppointmentWithRelations | null>(null);
    const [ingresosReales, setIngresosReales] = useState(0);
    const [selectedDate, setSelectedDate] = useState(TODAY_STR);

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
            <div>
                <h1 className="text-2xl md:text-3xl font-bold">
                    Mi Agenda{barberName ? ` · ${barberName}` : ""}
                </h1>
                <p className="text-muted-foreground capitalize">{selectedDateLabel}</p>
            </div>

            {/* Navegación de días */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {quickDates.map((date) => {
                    const dateStr = format(date, "yyyy-MM-dd");
                    const isSelected = selectedDate === dateStr;
                    return (
                        <button
                            key={dateStr}
                            onClick={() => setSelectedDate(dateStr)}
                            aria-pressed={isSelected}
                            className={cn(
                                "flex flex-shrink-0 min-w-16 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 transition-colors",
                                isSelected
                                    ? "border-primary/50 bg-primary/15 text-primary"
                                    : "border-border/50 bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            )}
                        >
                            <span className="text-[10px] uppercase tracking-wide">
                                {format(date, "EEE", { locale: es })}
                            </span>
                            <span className="text-lg font-bold">{format(date, "d")}</span>
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
        </div>
    );
}
