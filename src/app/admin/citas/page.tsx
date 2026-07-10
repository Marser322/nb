"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    AlertCircle,
    Calendar,
    Search,
    Filter,
    CheckCircle,
    XCircle,
    Clock,
    User,
    Plus,
    Loader2,
    DollarSign,
    MapPin,
    Scissors,
    Timer,
    MessageSquare,
    RotateCcw,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    DialogTrigger,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/utils";
import {
    APPOINTMENT_STATUS,
    APPOINTMENT_STATUS_LABELS,
    BUSINESS_CONFIG,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Appointment, Service, Barber, Profile, Branch } from "@/types/database.types";
import { format, addDays, startOfToday } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { normalizeUyPhone } from "@/lib/whatsapp";
import { fetchActiveAppointments, computeBookedSlots, hasOverlap } from "@/lib/booking";
import { getBookingErrorMessage } from "@/lib/booking-errors";
import ChargeDialog from "@/components/shared/ChargeDialog";
import { IllustratedEmptyState } from "@/components/shared/IllustratedEmptyState";
import { useFeatures } from "@/lib/features";
import { useBusinessConfig } from "@/lib/business-config";
import { SendWhatsappDialog } from "@/components/admin/send-whatsapp-dialog";

type AppointmentWithRelations = Appointment & {
    service?: Service;
    barber?: Barber;
    client?: Profile;
};

type NotifyState = {
    appointment: AppointmentWithRelations;
    eventType: string;
    templateVars: Record<string, string>;
} | null;

type AgendaMetricTone = "primary" | "pending" | "confirmed" | "completed" | "cancelled";

type AgendaMetric = {
    label: string;
    value: string;
    hint: string;
    tone: AgendaMetricTone;
    icon: typeof Calendar;
};

type TimelineGroup = {
    hour: string;
    appointments: AppointmentWithRelations[];
};

export default function AdminCitasPage() {
    const { features } = useFeatures();
    const { config } = useBusinessConfig();
    const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
    const [filteredAppointments, setFilteredAppointments] = useState<AppointmentWithRelations[]>([]);
    const [selectedDate, setSelectedDate] = useState(format(startOfToday(), "yyyy-MM-dd"));
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [branchFilter, setBranchFilter] = useState<string>("all");
    const [barberFilter, setBarberFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [chargeApt, setChargeApt] = useState<AppointmentWithRelations | null>(null);
    const [notifyApt, setNotifyApt] = useState<NotifyState>(null);

    // Banner de pendientes vencidas (status pending con fecha anterior a hoy)
    const [overdueAppointments, setOverdueAppointments] = useState<AppointmentWithRelations[]>([]);
    const [overdueCount, setOverdueCount] = useState(0);
    const [isOverdueExpanded, setIsOverdueExpanded] = useState(false);
    const [isLoadingOverdue, setIsLoadingOverdue] = useState(false);
    const [resolvingOverdueId, setResolvingOverdueId] = useState<string | null>(null);

    // Reprogramar cita
    const [rescheduleApt, setRescheduleApt] = useState<AppointmentWithRelations | null>(null);
    const [rescheduleDate, setRescheduleDate] = useState("");
    const [rescheduleTime, setRescheduleTime] = useState("");
    const [rescheduleSlots, setRescheduleSlots] = useState<string[]>([]);
    const [isReschedLoadingSlots, setIsReschedLoadingSlots] = useState(false);
    const [isRescheduling, setIsRescheduling] = useState(false);

    // Form state for new appointment
    const [services, setServices] = useState<Service[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [bookedSlots, setBookedSlots] = useState<string[]>([]);
    const [isLoadingSlots, setIsLoadingSlots] = useState(false);
    const [formData, setFormData] = useState({
        clientName: "",
        clientPhone: "",
        serviceId: "",
        barberId: "",
        date: format(startOfToday(), "yyyy-MM-dd"),
        time: "",
        paymentMethod: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const supabase = useMemo(() => createClient(), []);

    // Cargar citas
    const loadAppointments = useCallback(async () => {
        setIsLoading(true);
        const { data } = await supabase
            .from("appointments")
            .select("*, service:services(*), barber:barbers(*), client:profiles(*)")
            .eq("appointment_date", selectedDate)
            .order("start_time");

        setAppointments(data || []);
        setIsLoading(false);
    }, [selectedDate, supabase]);

    useEffect(() => {
        loadAppointments();
    }, [loadAppointments]);

    // Pendientes de días anteriores sin resolver (invisibles en la vista de un solo día)
    const loadOverdueAppointments = useCallback(async () => {
        setIsLoadingOverdue(true);
        const todayStr = format(startOfToday(), "yyyy-MM-dd");
        const { data, count } = await supabase
            .from("appointments")
            .select("*, service:services(*), barber:barbers(*), client:profiles(*)", { count: "exact" })
            .eq("status", APPOINTMENT_STATUS.PENDING)
            .lt("appointment_date", todayStr)
            .order("appointment_date", { ascending: false })
            .order("start_time", { ascending: false })
            .limit(20);

        setOverdueAppointments(data || []);
        setOverdueCount(count ?? (data?.length || 0));
        setIsLoadingOverdue(false);
    }, [supabase]);

    useEffect(() => {
        loadOverdueAppointments();
    }, [loadOverdueAppointments]);

    // Cargar servicios, barberos y sucursales para el formulario/filtros
    useEffect(() => {
        async function loadFormData() {
            const [{ data: servicesData }, { data: barbersData }, { data: branchesData }] = await Promise.all([
                supabase.from("services").select("*").eq("is_active", true).order("name"),
                supabase.from("barbers").select("*").eq("is_active", true).order("name"),
                // branches ya está normalizado a is_active
                supabase.from("branches").select("*").eq("is_active", true).order("name"),
            ]);
            setServices(servicesData || []);
            setBarbers(barbersData || []);
            setBranches(branchesData || []);
        }
        loadFormData();
    }, [supabase]);

    // Filtrar por estado, sucursal, barbero y búsqueda de cliente (en memoria)
    useEffect(() => {
        let temp = appointments;

        if (statusFilter !== "all") {
            temp = temp.filter((a) => a.status === statusFilter);
        }

        if (branchFilter !== "all") {
            temp = temp.filter((a) => a.barber?.branch_id === branchFilter);
        }

        if (barberFilter !== "all") {
            temp = temp.filter((a) => a.barber_id === barberFilter);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            temp = temp.filter((a) => {
                const clientName = a.client?.full_name?.toLowerCase() ?? "";
                const clientPhone = a.client?.phone ?? "";
                return clientName.includes(query) || clientPhone.includes(query);
            });
        }

        setFilteredAppointments(temp);
    }, [statusFilter, branchFilter, barberFilter, searchQuery, appointments]);

    // Cargar slots ocupados en el formulario
    useEffect(() => {
        async function loadBookedSlots() {
            if (!formData.barberId || !formData.date) {
                setBookedSlots([]);
                return;
            }

            setIsLoadingSlots(true);
            try {
                const activeApts = await fetchActiveAppointments(supabase, formData.barberId, formData.date);
                const booked = computeBookedSlots(activeApts);
                setBookedSlots(booked);
            } catch (error) {
                console.error("Error loading slots:", error);
            } finally {
                setIsLoadingSlots(false);
            }
        }
        loadBookedSlots();
    }, [formData.barberId, formData.date, supabase]);

    // Limpiar hora si cambia el barbero o fecha en el formulario
    useEffect(() => {
        setFormData(prev => ({ ...prev, time: "" }));
    }, [formData.barberId, formData.date]);

    // Actualizar estado de cita
    const updateStatus = async (cita: AppointmentWithRelations, newStatus: string) => {
        const { error } = await supabase.rpc("admin_update_appointment_status", {
            p_appointment_id: cita.id,
            p_status: newStatus,
        });

        if (error) {
            toast.error(getBookingErrorMessage(error));
            return;
        }

        // Actualizar estado local
        setAppointments((prev) =>
            prev.map((a) => (a.id === cita.id ? { ...a, status: newStatus as Appointment["status"] } : a))
        );

        const canNotify = (newStatus === "cancelled" || newStatus === "confirmed") && features.mensajes_crm && !!getClientPhone(cita);
        toast.success(`Cita ${APPOINTMENT_STATUS_LABELS[newStatus].toLowerCase()}`, canNotify
            ? {
                action: {
                    label: "Avisar por WhatsApp",
                    onClick: () => setNotifyApt({
                        appointment: { ...cita, status: newStatus as Appointment["status"] },
                        eventType: newStatus,
                        templateVars: buildTemplateVars(cita, branches),
                    }),
                },
            }
            : undefined);
    };

    // Reactiva una cita cancelada/no-show a confirmada, si nadie más tomó el horario mientras tanto
    const handleReactivate = (cita: AppointmentWithRelations) => {
        const conflict = appointments.some(
            (a) =>
                a.id !== cita.id &&
                a.barber_id === cita.barber_id &&
                (a.status === APPOINTMENT_STATUS.PENDING || a.status === APPOINTMENT_STATUS.CONFIRMED) &&
                hasOverlap(cita.start_time, cita.end_time, [{ start_time: a.start_time, end_time: a.end_time }])
        );

        if (conflict) {
            toast.error("El horario ya fue ocupado — reprogramala en su lugar");
            return;
        }

        updateStatus(cita, APPOINTMENT_STATUS.CONFIRMED);
    };

    // Resuelve una fila del banner de pendientes vencidas (Completar/No vino/Cancelar) y refresca el listado
    const resolveOverdueAppointment = async (cita: AppointmentWithRelations, newStatus: string) => {
        setResolvingOverdueId(cita.id);
        await updateStatus(cita, newStatus);
        await loadOverdueAppointments();
        setResolvingOverdueId(null);
    };

    const handleOverdueComplete = (cita: AppointmentWithRelations) => {
        if (features.contabilidad) {
            setChargeApt(cita);
        } else {
            resolveOverdueAppointment(cita, APPOINTMENT_STATUS.COMPLETED);
        }
    };

    // Abrir el diálogo de reprogramación precargando la fecha/hora actual de la cita
    const openReschedule = (cita: AppointmentWithRelations) => {
        setRescheduleApt(cita);
        setRescheduleDate(cita.appointment_date);
        setRescheduleTime(cita.start_time.slice(0, 5));
    };

    // Cargar slots ocupados del barbero para la nueva fecha, EXCLUYENDO la propia cita
    useEffect(() => {
        async function loadReschedSlots() {
            if (!rescheduleApt || !rescheduleDate) {
                setRescheduleSlots([]);
                return;
            }
            setIsReschedLoadingSlots(true);
            try {
                const { data } = await supabase
                    .from("appointments")
                    .select("start_time, end_time")
                    .eq("barber_id", rescheduleApt.barber_id)
                    .eq("appointment_date", rescheduleDate)
                    .in("status", ["pending", "confirmed"])
                    .neq("id", rescheduleApt.id);
                setRescheduleSlots(computeBookedSlots(data || []));
            } catch (error) {
                console.error("Error loading reschedule slots:", error);
            } finally {
                setIsReschedLoadingSlots(false);
            }
        }
        loadReschedSlots();
    }, [rescheduleApt, rescheduleDate, supabase]);

    // Reprograma la cita a la nueva fecha/hora (mismo barbero y servicio)
    const handleReschedule = async () => {
        if (!rescheduleApt || !rescheduleDate || !rescheduleTime) {
            toast.error("Elegí fecha y hora");
            return;
        }
        const startHHMM = rescheduleTime.slice(0, 5);

        setIsRescheduling(true);
        try {
            const { error } = await supabase.rpc("admin_reschedule_appointment", {
                p_appointment_id: rescheduleApt.id,
                p_date: rescheduleDate,
                p_start_time: startHHMM,
            });

            if (error) {
                toast.error(getBookingErrorMessage(error));
                setIsRescheduling(false);
                return;
            }

            const canNotify = features.mensajes_crm && !!getClientPhone(rescheduleApt);
            toast.success("Cita reprogramada", canNotify
                ? {
                    action: {
                        label: "Avisar por WhatsApp",
                        onClick: () => setNotifyApt({
                            appointment: rescheduleApt,
                            eventType: "rescheduled",
                            templateVars: buildTemplateVars(rescheduleApt, branches, { date: rescheduleDate, time: startHHMM }),
                        }),
                    },
                }
                : undefined);
            setRescheduleApt(null);
            loadAppointments();
        } catch (err) {
            console.error("Error en handleReschedule:", err);
            toast.error("Ocurrió un error inesperado");
        } finally {
            setIsRescheduling(false);
        }
    };

    // ¿El slot queda deshabilitado para la reprogramación? (considera la duración del servicio)
    const isRescheduleSlotDisabled = (slot: string) => {
        if (isReschedLoadingSlots) return true;
        const duration = rescheduleApt?.service?.duration_minutes ?? BUSINESS_CONFIG.timeSlotMinutes;
        const slotsNeeded = Math.ceil(duration / BUSINESS_CONFIG.timeSlotMinutes);
        const slots = generateTimeSlots(config.workingHours);
        const startIdx = slots.indexOf(slot);
        for (let i = 0; i < slotsNeeded; i++) {
            const slotToCheck = slots[startIdx + i];
            if (!slotToCheck || rescheduleSlots.includes(slotToCheck)) {
                return true;
            }
        }
        return false;
    };

    // Crear cita manual
    const handleCreateAppointment = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.clientName || !formData.serviceId || !formData.barberId || !formData.date || !formData.time) {
            toast.error("Completá todos los campos obligatorios");
            return;
        }

        setIsSubmitting(true);

        try {
            const selectedService = services.find(s => s.id === formData.serviceId);
            if (!selectedService) {
                toast.error("Selecciona un servicio");
                return;
            }

            const selectedBarber = barbers.find(b => b.id === formData.barberId);
            if (!selectedBarber) {
                toast.error("Selecciona un barbero");
                return;
            }

            const formattedTime = formData.time.slice(0, 5);
            const normalizedPhone = normalizeUyPhone(formData.clientPhone);

            const { error } = await supabase.rpc("admin_create_appointment", {
                p_client_name: formData.clientName.trim(),
                p_client_phone: normalizedPhone || formData.clientPhone.trim() || null,
                p_service_id: selectedService.id,
                p_barber_id: selectedBarber.id,
                p_date: formData.date,
                p_start_time: formattedTime,
                p_notes: `Walk-in. Cliente: ${formData.clientName.trim()}${formData.clientPhone ? ` - Tel: ${formData.clientPhone}` : ""}`,
            });

            if (error) {
                toast.error(getBookingErrorMessage(error));
            } else {
                toast.success("Cita creada exitosamente");
                setIsDialogOpen(false);
                setFormData({
                    clientName: "",
                    clientPhone: "",
                    serviceId: "",
                    barberId: "",
                    date: format(startOfToday(), "yyyy-MM-dd"),
                    time: "",
                    paymentMethod: "",
                });
                // Recargar citas si la fecha coincide
                if (formData.date === selectedDate) {
                    await loadAppointments();
                }
            }
        } catch (err) {
            console.error("Error en handleCreateAppointment:", err);
            toast.error("Ocurrió un error inesperado");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Generar slots de tiempo. Por defecto usa BUSINESS_CONFIG (alta manual);
    // la grilla de reprogramación pasa explícitamente config.workingHours
    // (vivo, editable desde /admin/configuracion).
    const generateTimeSlots = (hours: { start: number; end: number } = BUSINESS_CONFIG.workingHours) => {
        const slots = [];
        for (let h = hours.start; h < hours.end; h++) {
            slots.push(`${h.toString().padStart(2, "0")}:00`);
            slots.push(`${h.toString().padStart(2, "0")}:30`);
        }
        return slots;
    };

    // Generar fechas para selector rápido
    const quickDates = Array.from({ length: 7 }, (_, i) => addDays(startOfToday(), i));

    // Navegación libre día a día, sin restricción hacia atrás
    const goToPreviousDay = () => {
        setSelectedDate((prev) => format(addDays(new Date(`${prev}T12:00:00`), -1), "yyyy-MM-dd"));
    };
    const goToNextDay = () => {
        setSelectedDate((prev) => format(addDays(new Date(`${prev}T12:00:00`), 1), "yyyy-MM-dd"));
    };

    const isSlotDisabled = (slot: string) => {
        if (isLoadingSlots) return true;
        const selectedService = services.find(s => s.id === formData.serviceId);
        if (!selectedService) return false;

        const slotsNeeded = Math.ceil(selectedService.duration_minutes / BUSINESS_CONFIG.timeSlotMinutes);
        const slots = generateTimeSlots(); // local slots list
        const startIdx = slots.indexOf(slot);

        for (let i = 0; i < slotsNeeded; i++) {
            const slotToCheck = slots[startIdx + i];
            if (!slotToCheck || bookedSlots.includes(slotToCheck)) {
                return true;
            }
        }
        return false;
    };

    // Reset barber filter if not belongs to the chosen branch
    useEffect(() => {
        if (branchFilter !== "all" && barberFilter !== "all") {
            const barber = barbers.find(b => b.id === barberFilter);
            if (barber && barber.branch_id !== branchFilter) {
                setBarberFilter("all");
            }
        }
    }, [branchFilter, barberFilter, barbers]);

    const selectedDateDisplay = format(new Date(`${selectedDate}T12:00:00`), "EEEE, d 'de' MMMM", { locale: es });
    const isToday = selectedDate === format(startOfToday(), "yyyy-MM-dd");
    const selectedServiceForForm = services.find((service) => service.id === formData.serviceId);
    const selectedBarberForForm = barbers.find((barber) => barber.id === formData.barberId);
    const selectedBarberBranchName = selectedBarberForForm?.branch_id
        ? branches.find((branch) => branch.id === selectedBarberForForm.branch_id)?.name || "Sin sucursal"
        : null;

    const agendaSummary = useMemo(() => {
        const counts = appointments.reduce(
            (acc, appointment) => {
                acc.total += 1;
                acc[appointment.status] = (acc[appointment.status] || 0) + 1;
                return acc;
            },
            { total: 0 } as Record<string, number>
        );

        const activeAppointments = appointments
            .filter((appointment) => appointment.status === APPOINTMENT_STATUS.PENDING || appointment.status === APPOINTMENT_STATUS.CONFIRMED)
            .sort((a, b) => a.start_time.localeCompare(b.start_time));

        const nextAppointment = activeAppointments.find((appointment) => {
            if (!isToday) return true;
            return appointment.start_time.slice(0, 5) >= format(new Date(), "HH:mm");
        }) || activeAppointments[0] || null;

        const potentialRevenue = activeAppointments.reduce((sum, appointment) => sum + Number(appointment.service?.price || 0), 0);
        const completedRevenue = appointments
            .filter((appointment) => appointment.status === APPOINTMENT_STATUS.COMPLETED)
            .reduce((sum, appointment) => sum + Number(appointment.service?.price || 0), 0);

        return {
            counts,
            nextAppointment,
            potentialRevenue,
            completedRevenue,
        };
    }, [appointments, isToday]);

    const agendaMetrics: AgendaMetric[] = useMemo(() => [
        {
            label: "Citas del día",
            value: String(agendaSummary.counts.total || 0),
            hint: `${filteredAppointments.length} visibles con filtros`,
            tone: "primary",
            icon: Calendar,
        },
        {
            label: "Por confirmar",
            value: String(agendaSummary.counts.pending || 0),
            hint: "Necesitan acción del equipo",
            tone: "pending",
            icon: AlertCircle,
        },
        {
            label: "Confirmadas",
            value: String(agendaSummary.counts.confirmed || 0),
            hint: "Listas para atender",
            tone: "confirmed",
            icon: CheckCircle,
        },
        {
            label: "Ingresos previstos",
            value: formatPrice(agendaSummary.potentialRevenue),
            hint: `${formatPrice(agendaSummary.completedRevenue)} ya completados`,
            tone: "completed",
            icon: DollarSign,
        },
    ], [agendaSummary, filteredAppointments.length]);

    const timelineGroups: TimelineGroup[] = useMemo(() => {
        const groups = new Map<string, AppointmentWithRelations[]>();

        filteredAppointments
            .slice()
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .forEach((appointment) => {
                const hour = appointment.start_time.slice(0, 2);
                const key = `${hour}:00`;
                const group = groups.get(key) || [];
                group.push(appointment);
                groups.set(key, group);
            });

        return Array.from(groups.entries()).map(([hour, group]) => ({
            hour,
            appointments: group,
        }));
    }, [filteredAppointments]);

    const nextAppointmentLabel = agendaSummary.nextAppointment
        ? `${agendaSummary.nextAppointment.start_time.slice(0, 5)} · ${agendaSummary.nextAppointment.service?.name || "Servicio"}`
        : "Sin próximas citas activas";

    const activeFilterCount = [statusFilter, branchFilter, barberFilter].filter((filter) => filter !== "all").length + (searchQuery.trim() ? 1 : 0);

    return (
        <div className="space-y-6">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <section className="admin-agenda-hero rounded-2xl border p-5 md:p-6">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                        <div className="max-w-3xl space-y-3">
                            <div className="admin-chip inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
                                <Calendar className="h-3.5 w-3.5" />
                                Agenda operativa
                            </div>
                            <div>
                                <h1 className="font-display text-3xl font-black tracking-tight text-foreground md:text-5xl">
                                    Citas
                                </h1>
                                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                                    {selectedDateDisplay}. Vista diaria para confirmar, cobrar, reprogramar y leer el ritmo del equipo sin perder contexto.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                <span className="admin-agenda-pill">
                                    {isToday ? "Hoy" : "Fecha seleccionada"}
                                </span>
                                <span className="admin-agenda-pill">
                                    Próxima: {nextAppointmentLabel}
                                </span>
                                {activeFilterCount > 0 && (
                                    <span className="admin-agenda-pill">
                                        {activeFilterCount} filtros activos
                                    </span>
                                )}
                            </div>
                        </div>

                        <DialogTrigger asChild>
                            <Button id="admin-btn-new-appointment" className="admin-accent-button h-12 rounded-full px-5 font-semibold">
                                <Plus className="h-4 w-4 mr-2" />
                                Nueva cita
                            </Button>
                        </DialogTrigger>
                    </div>

                    <AgendaSummary metrics={agendaMetrics} />
                </section>

                <DialogContent className="max-w-2xl bg-card/95 border-border/60 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Crear cita manual</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateAppointment} className="mt-2 space-y-5">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Nombre del cliente</label>
                                <Input
                                    placeholder="Juan Pérez"
                                    value={formData.clientName}
                                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                                    className="admin-field-focus bg-background/50 border-input/50"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Teléfono</label>
                                <Input
                                    placeholder="099 123 456"
                                    value={formData.clientPhone}
                                    onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                                    className="admin-field-focus bg-background/50 border-input/50"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Servicio</label>
                                <Select value={formData.serviceId} onValueChange={(v) => setFormData({ ...formData, serviceId: v })}>
                                    <SelectTrigger className="admin-field-focus">
                                        <SelectValue placeholder="Seleccionar servicio" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {services.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name} - {formatPrice(s.price)} ({s.duration_minutes}min)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Barbero</label>
                                <Select value={formData.barberId} onValueChange={(v) => setFormData({ ...formData, barberId: v })}>
                                    <SelectTrigger className="admin-field-focus">
                                        <SelectValue placeholder="Seleccionar barbero" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {barbers.map((b) => {
                                            const branchName = branches.find((br) => br.id === b.branch_id)?.name || "Sin sucursal";
                                            return (
                                                <SelectItem key={b.id} value={b.id}>
                                                    {b.name} ({branchName})
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {(selectedServiceForForm || selectedBarberForForm) && (
                            <div className="admin-dialog-brief grid gap-3 rounded-xl border p-3 text-sm md:grid-cols-3">
                                <div>
                                    <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Servicio</span>
                                    <p className="font-semibold text-foreground">{selectedServiceForForm?.name || "Sin elegir"}</p>
                                </div>
                                <div>
                                    <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Duración</span>
                                    <p className="font-semibold text-foreground">{selectedServiceForForm ? `${selectedServiceForForm.duration_minutes} min` : "Pendiente"}</p>
                                </div>
                                <div>
                                    <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Equipo</span>
                                    <p className="font-semibold text-foreground">{selectedBarberForForm ? `${selectedBarberForForm.name} · ${selectedBarberBranchName}` : "Pendiente"}</p>
                                </div>
                            </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Fecha</label>
                                <Input
                                    type="date"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    className="admin-field-focus bg-background/50 border-input/50"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Hora disponible</label>
                                <Select value={formData.time} onValueChange={(v) => setFormData({ ...formData, time: v })} disabled={!formData.barberId || isLoadingSlots}>
                                    <SelectTrigger className="admin-field-focus">
                                        <SelectValue placeholder={isLoadingSlots ? "Revisando agenda..." : formData.barberId ? "Elegí un horario" : "Elegí barbero"} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {generateTimeSlots().map((slot) => {
                                            const disabled = isSlotDisabled(slot);
                                            return (
                                                <SelectItem key={slot} value={slot} disabled={disabled}>
                                                    {slot} · {disabled ? "ocupado" : "libre"}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Los horarios ocupados consideran la duración del servicio elegido.
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 border-t border-border/40 pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSubmitting} className="admin-accent-button font-semibold">
                                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Crear cita
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {overdueCount > 0 && (
                <section className="admin-warning-surface rounded-2xl border p-4">
                    <button
                        type="button"
                        onClick={() => setIsOverdueExpanded((prev) => !prev)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                    >
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="admin-warning-icon h-5 w-5 shrink-0" />
                            <p className="admin-warning-text text-sm font-semibold">
                                Tenés {overdueCount} cita{overdueCount === 1 ? "" : "s"} pendiente{overdueCount === 1 ? "" : "s"} de días anteriores sin resolver
                            </p>
                        </div>
                        {isOverdueExpanded ? (
                            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                    </button>

                    {isOverdueExpanded && (
                        <div className="mt-4 space-y-2">
                            {isLoadingOverdue ? (
                                <div className="flex justify-center p-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                            ) : (
                                overdueAppointments.map((cita) => (
                                    <div
                                        key={cita.id}
                                        className="flex flex-col gap-3 rounded-lg border border-border/50 bg-background/40 p-3 text-xs md:flex-row md:items-center md:justify-between"
                                    >
                                        <div className="space-y-1">
                                            <p className="font-semibold text-foreground">
                                                {format(new Date(`${cita.appointment_date}T12:00:00`), "d 'de' MMMM", { locale: es })} · {cita.start_time.slice(0, 5)}
                                            </p>
                                            <p className="text-muted-foreground">
                                                {getClientName(cita)} · {cita.service?.name || "Servicio"} · {cita.barber?.name || "Sin asignar"}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={resolvingOverdueId === cita.id}
                                                onClick={() => handleOverdueComplete(cita)}
                                                className="h-9 border-primary/30 text-primary hover:bg-primary/10"
                                            >
                                                <CheckCircle className="mr-1 h-3.5 w-3.5" />
                                                {features.contabilidad ? "Cobrar" : "Completar"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={resolvingOverdueId === cita.id}
                                                onClick={() => resolveOverdueAppointment(cita, APPOINTMENT_STATUS.NO_SHOW)}
                                                className="h-9 text-muted-foreground hover:bg-muted/40"
                                            >
                                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                                No vino
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                disabled={resolvingOverdueId === cita.id}
                                                onClick={() => resolveOverdueAppointment(cita, APPOINTMENT_STATUS.CANCELLED)}
                                                className="h-9 border-destructive/30 text-destructive hover:bg-destructive/10"
                                            >
                                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                                Cancelar
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </section>
            )}

            <section className="admin-agenda-filterbar rounded-2xl border p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 xl:pb-0">
                        {quickDates.map((date) => {
                            const dateStr = format(date, "yyyy-MM-dd");
                            const isSelected = selectedDate === dateStr;
                            return (
                                <button
                                    key={dateStr}
                                    onClick={() => setSelectedDate(dateStr)}
                                    className={`admin-date-pill flex-shrink-0 ${isSelected ? "admin-date-pill-active" : ""}`}
                                    aria-pressed={isSelected}
                                >
                                    <span className="text-[10px] uppercase tracking-[0.16em]">
                                        {format(date, "EEE", { locale: es })}
                                    </span>
                                    <span className="text-lg font-black">{format(date, "d")}</span>
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={goToPreviousDay}
                            className="h-10 w-10 shrink-0"
                            aria-label="Día anterior"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                            className="admin-field-focus h-10 w-[150px] bg-background/50 border-input/50"
                            aria-label="Ir a una fecha"
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={goToNextDay}
                            className="h-10 w-10 shrink-0"
                            aria-label="Día siguiente"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="grid gap-3 pt-3 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px_180px] xl:pt-0">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar cliente o teléfono..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="admin-field-focus h-10 pl-9 bg-background/50 border-input/50"
                        />
                    </div>

                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="admin-field-focus w-full">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue placeholder="Estado" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los estados</SelectItem>
                            <SelectItem value="pending">Pendientes</SelectItem>
                            <SelectItem value="confirmed">Confirmadas</SelectItem>
                            <SelectItem value="completed">Completadas</SelectItem>
                            <SelectItem value="cancelled">Canceladas</SelectItem>
                            <SelectItem value="no_show">No se presentó</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={branchFilter} onValueChange={setBranchFilter}>
                        <SelectTrigger className="admin-field-focus w-full">
                            <MapPin className="h-4 w-4 mr-2" />
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

                    <Select value={barberFilter} onValueChange={setBarberFilter}>
                        <SelectTrigger className="admin-field-focus w-full">
                            <Scissors className="h-4 w-4 mr-2" />
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
            </section>

            <Card className="admin-section-card admin-agenda-board border-border/50">
                <CardHeader className="gap-3">
                    <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <span className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-primary" />
                            Agenda del día
                        </span>
                        <Badge variant="outline" className="w-fit border-primary/25 bg-primary/10 text-primary">
                            {filteredAppointments.length} citas visibles
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-4">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/40" />
                            ))}
                        </div>
                    ) : filteredAppointments.length === 0 ? (
                        <IllustratedEmptyState
                            icon={Calendar}
                            imageSrc="/images/empty/no-citas.webp"
                            imageAlt="Agenda premium de New Brothers sin citas para el día"
                            title="Agenda impecable para este día"
                            description="No hay citas con los filtros seleccionados. Creá una reserva manual o ajustá la fecha para ver el movimiento del equipo."
                            action={
                                <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Crear primera cita
                                </Button>
                            }
                        />
                    ) : (
                        <AgendaTimeline
                            groups={timelineGroups}
                            branches={branches}
                            canCharge={features.contabilidad}
                            onConfirm={(cita) => updateStatus(cita, "confirmed")}
                            onComplete={(cita) => {
                                if (features.contabilidad) {
                                    setChargeApt(cita);
                                } else {
                                    updateStatus(cita, "completed");
                                }
                            }}
                            onCancel={(cita) => updateStatus(cita, "cancelled")}
                            onNoShow={(cita) => updateStatus(cita, APPOINTMENT_STATUS.NO_SHOW)}
                            onReactivate={handleReactivate}
                            onReschedule={openReschedule}
                            onNotify={(cita, eventType) => setNotifyApt({
                                appointment: cita,
                                eventType,
                                templateVars: buildTemplateVars(cita, branches),
                            })}
                            canNotify={features.mensajes_crm}
                        />
                    )}
                </CardContent>
            </Card>

            {chargeApt && (
                <ChargeDialog
                    appointment={chargeApt}
                    isOpen={chargeApt !== null}
                    onOpenChange={(open) => !open && setChargeApt(null)}
                    onSuccess={() => {
                        loadAppointments();
                        loadOverdueAppointments();
                    }}
                />
            )}

            {notifyApt && (
                <SendWhatsappDialog
                    clientId={notifyApt.appointment.client_id}
                    clientName={getClientName(notifyApt.appointment)}
                    clientPhone={getClientPhone(notifyApt.appointment)}
                    isOpen={notifyApt !== null}
                    onOpenChange={(open) => !open && setNotifyApt(null)}
                    eventType={notifyApt.eventType}
                    templateVars={notifyApt.templateVars}
                    appointmentId={notifyApt.appointment.id}
                />
            )}

            {/* Reprogramar cita */}
            <Dialog open={rescheduleApt !== null} onOpenChange={(open) => !open && setRescheduleApt(null)}>
                <DialogContent className="max-w-xl bg-card/95 border-border/60 backdrop-blur-xl">
                    <DialogHeader>
                        <DialogTitle>Reprogramar cita</DialogTitle>
                    </DialogHeader>
                    {rescheduleApt && (
                        <div className="space-y-5 mt-2">
                            <div className="admin-dialog-brief rounded-xl border p-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-foreground">{rescheduleApt.service?.name || "Servicio"}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {getClientName(rescheduleApt)} · {rescheduleApt.barber?.name || "Sin asignar"}
                                        </p>
                                    </div>
                                    <div className="rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-right">
                                        <p className="text-sm font-bold text-foreground">{rescheduleApt.start_time.slice(0, 5)}</p>
                                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">horario actual</p>
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Nueva fecha</label>
                                    <Input
                                        type="date"
                                        value={rescheduleDate}
                                        onChange={(e) => { setRescheduleDate(e.target.value); setRescheduleTime(""); }}
                                        className="admin-field-focus bg-background/50 border-input/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Nueva hora</label>
                                    <Select value={rescheduleTime} onValueChange={setRescheduleTime} disabled={isReschedLoadingSlots}>
                                        <SelectTrigger className="admin-field-focus">
                                            <SelectValue placeholder={isReschedLoadingSlots ? "Revisando agenda..." : "Elegí un horario"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {generateTimeSlots(config.workingHours).map((slot) => {
                                                const disabled = isRescheduleSlotDisabled(slot);
                                                return (
                                                    <SelectItem key={slot} value={slot} disabled={disabled}>
                                                        {slot} · {disabled ? "ocupado" : "libre"}
                                                    </SelectItem>
                                                );
                                            })}
                                        </SelectContent>
                                    </Select>
                                    <p className="mt-2 text-xs text-muted-foreground">
                                        Se excluye esta misma cita para calcular huecos disponibles.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 border-t border-border/40 pt-4">
                                <Button type="button" variant="outline" onClick={() => setRescheduleApt(null)}>
                                    Cancelar
                                </Button>
                                <Button type="button" onClick={handleReschedule} disabled={isRescheduling} className="admin-accent-button font-semibold">
                                    {isRescheduling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    Reprogramar
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function AgendaSummary({ metrics }: { metrics: AgendaMetric[] }) {
    return (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
                const Icon = metric.icon;
                return (
                    <div key={metric.label} className="admin-agenda-stat rounded-xl border p-4" data-tone={metric.tone}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{metric.label}</p>
                                <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{metric.value}</p>
                            </div>
                            <span className="admin-agenda-stat-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
                                <Icon className="h-5 w-5" aria-hidden="true" />
                            </span>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">{metric.hint}</p>
                    </div>
                );
            })}
        </div>
    );
}

function AgendaTimeline({
    groups,
    branches,
    canCharge,
    canNotify,
    onConfirm,
    onComplete,
    onCancel,
    onNoShow,
    onReactivate,
    onReschedule,
    onNotify,
}: {
    groups: TimelineGroup[];
    branches: Branch[];
    canCharge: boolean;
    canNotify: boolean;
    onConfirm: (appointment: AppointmentWithRelations) => void;
    onComplete: (appointment: AppointmentWithRelations) => void;
    onCancel: (appointment: AppointmentWithRelations) => void;
    onNoShow: (appointment: AppointmentWithRelations) => void;
    onReactivate: (appointment: AppointmentWithRelations) => void;
    onReschedule: (appointment: AppointmentWithRelations) => void;
    onNotify: (appointment: AppointmentWithRelations, eventType: string) => void;
}) {
    return (
        <div className="admin-timeline space-y-5">
            {groups.map((group) => (
                <section key={group.hour} className="admin-timeline-group">
                    <div className="admin-time-marker">
                        <span className="font-mono text-sm font-bold">{group.hour}</span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{group.appointments.length} citas</span>
                    </div>
                    <div className="space-y-3">
                        {group.appointments.map((appointment) => (
                            <AppointmentCard
                                key={appointment.id}
                                appointment={appointment}
                                branchName={getBranchName(appointment, branches)}
                                canCharge={canCharge}
                                canNotify={canNotify && !!getClientPhone(appointment)}
                                onConfirm={() => onConfirm(appointment)}
                                onComplete={() => onComplete(appointment)}
                                onCancel={() => onCancel(appointment)}
                                onNoShow={() => onNoShow(appointment)}
                                onReactivate={() => onReactivate(appointment)}
                                onReschedule={() => onReschedule(appointment)}
                                onNotify={(eventType) => onNotify(appointment, eventType)}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

function AppointmentCard({
    appointment,
    branchName,
    canCharge,
    canNotify,
    onConfirm,
    onComplete,
    onCancel,
    onNoShow,
    onReactivate,
    onReschedule,
    onNotify,
}: {
    appointment: AppointmentWithRelations;
    branchName: string;
    canCharge: boolean;
    canNotify: boolean;
    onConfirm: () => void;
    onComplete: () => void;
    onCancel: () => void;
    onNoShow: () => void;
    onReactivate: () => void;
    onReschedule: () => void;
    onNotify: (eventType: string) => void;
}) {
    const isPending = appointment.status === APPOINTMENT_STATUS.PENDING;
    const isConfirmed = appointment.status === APPOINTMENT_STATUS.CONFIRMED;
    const isCompleted = appointment.status === APPOINTMENT_STATUS.COMPLETED;
    const isCancelled = appointment.status === APPOINTMENT_STATUS.CANCELLED;
    const isNoShow = appointment.status === APPOINTMENT_STATUS.NO_SHOW;
    const isActionable = isPending || isConfirmed;
    const isPastDate = appointment.appointment_date < format(startOfToday(), "yyyy-MM-dd");
    const showNoShow = isConfirmed || (isPending && isPastDate);
    const duration = appointment.service?.duration_minutes ? `${appointment.service.duration_minutes} min` : `${appointment.start_time.slice(0, 5)}-${appointment.end_time.slice(0, 5)}`;

    return (
        <article className="admin-appointment-card rounded-2xl border p-4" data-status={appointment.status}>
            <div className="grid gap-4 xl:grid-cols-[86px_minmax(0,1fr)_auto] xl:items-center">
                <div className="admin-appointment-time rounded-xl border px-3 py-2 text-center">
                    <p className="font-mono text-xl font-black text-foreground">{appointment.start_time.slice(0, 5)}</p>
                    <p className="text-xs text-muted-foreground">{appointment.end_time.slice(0, 5)}</p>
                </div>

                <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="admin-status-badge" data-status={appointment.status}>
                            {APPOINTMENT_STATUS_LABELS[appointment.status]}
                        </Badge>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                            <Timer className="h-3.5 w-3.5" />
                            {duration}
                        </span>
                        {appointment.service && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                                <DollarSign className="h-3.5 w-3.5" />
                                {formatPrice(appointment.service.price)}
                            </span>
                        )}
                    </div>

                    <div>
                        <h3 className="truncate text-lg font-bold text-foreground">{appointment.service?.name || "Servicio sin detalle"}</h3>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                {getClientName(appointment)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Scissors className="h-3.5 w-3.5" />
                                {appointment.barber?.name || "Sin asignar"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {branchName}
                            </span>
                        </div>
                    </div>
                </div>

                {isActionable ? (
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                        {isPending && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-10 border-primary/30 text-primary hover:bg-primary/10 md:h-8"
                                onClick={onConfirm}
                            >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Confirmar
                            </Button>
                        )}
                        {isConfirmed && (
                            <Button
                                size="sm"
                                className="admin-accent-button h-10 font-semibold md:h-8"
                                onClick={onComplete}
                            >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                {canCharge ? "Cobrar" : "Completar"}
                            </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={onReschedule} className="h-10 md:h-8">
                            <Clock className="h-4 w-4 mr-1" />
                            Reprogramar
                        </Button>
                        {canNotify && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-10 border-primary/30 text-primary hover:bg-primary/10 md:h-8"
                                onClick={() => onNotify("reminder")}
                            >
                                <MessageSquare className="h-4 w-4 mr-1" />
                                Recordar
                            </Button>
                        )}
                        {showNoShow && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-10 text-muted-foreground hover:bg-muted/40 md:h-8"
                                onClick={onNoShow}
                            >
                                <XCircle className="h-4 w-4 mr-1" />
                                No vino
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-10 border-destructive/30 text-destructive hover:bg-destructive/10 md:h-8"
                            onClick={onCancel}
                        >
                            <XCircle className="h-4 w-4 mr-1" />
                            Cancelar
                        </Button>
                    </div>
                ) : isCompleted && canNotify ? (
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-10 border-primary/30 text-primary hover:bg-primary/10 md:h-8"
                            onClick={() => onNotify("thanks")}
                        >
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Agradecer
                        </Button>
                    </div>
                ) : isCancelled || isNoShow ? (
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-10 border-primary/30 text-primary hover:bg-primary/10 md:h-8"
                            onClick={onReactivate}
                        >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            Reactivar
                        </Button>
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground xl:text-right">
                        Sin acciones pendientes
                    </div>
                )}
            </div>
        </article>
    );
}

function getClientName(appointment: AppointmentWithRelations) {
    return appointment.client?.full_name || appointment.notes?.split(" - ")[0]?.replace("Cliente: ", "") || "Cliente";
}

function getBranchName(appointment: AppointmentWithRelations, branches: Branch[]) {
    if (!appointment.barber?.branch_id) return "Sin sucursal";
    return branches.find((branch) => branch.id === appointment.barber?.branch_id)?.name || "Sin sucursal";
}

// Teléfono del cliente: registrado, o parseado de las notas de un walk-in ("... - Tel: 099123456")
function getClientPhone(appointment: AppointmentWithRelations): string | null {
    if (appointment.client?.phone) return appointment.client.phone;
    const match = appointment.notes?.match(/Tel:\s*([^-]+)/);
    return match ? match[1].trim() : null;
}

// Diccionario de variables para las plantillas de mensaje ({nombre} {fecha} {hora} {barbero} {servicio} {sucursal})
function buildTemplateVars(
    appointment: AppointmentWithRelations,
    branches: Branch[],
    overrides?: { date?: string; time?: string }
): Record<string, string> {
    const dateStr = overrides?.date || appointment.appointment_date;
    const timeStr = (overrides?.time || appointment.start_time).slice(0, 5);
    return {
        nombre: getClientName(appointment),
        fecha: format(new Date(`${dateStr}T12:00:00`), "EEEE d 'de' MMMM", { locale: es }),
        hora: timeStr,
        barbero: appointment.barber?.name || "el equipo",
        servicio: appointment.service?.name || "tu servicio",
        sucursal: getBranchName(appointment, branches),
    };
}
