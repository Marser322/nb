"use client";

import { use, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    ArrowLeft,
    Phone,
    Calendar as CalendarIcon,
    ShoppingBag,
    MessageSquare,
    Scissors,
    Save,
    Loader2,
    User as UserIcon,
    AlertCircle,
    MessageCircle,
    Cake,
    Wallet,
    Repeat,
    TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { SendWhatsappDialog } from "@/components/admin/send-whatsapp-dialog";
import { useFeatures } from "@/lib/features";
import {
    APPOINTMENT_STATUS_COLORS,
    APPOINTMENT_STATUS_LABELS,
    COMMUNICATION_STATUS_COLORS,
    COMMUNICATION_STATUS_LABELS,
    ORDER_STATUS_COLORS,
    ORDER_STATUS_LABELS,
    getPaymentMethodLabel,
} from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { isInactiveClient, isBirthdayThisMonth } from "@/lib/crm";
import { format, parseISO, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import type {
    Profile,
    Appointment,
    HaircutHistory,
    Order,
    CommunicationLog
} from "@/types/database.types";

interface ExtendedAppointment extends Omit<Appointment, 'service' | 'barber'> {
    service?: { name: string; price: number };
    barber?: { name: string };
}

interface ExtendedOrder extends Omit<Order, 'items'> {
    items?: {
        id: string;
        quantity: number;
        unit_price: number;
        product?: { name: string };
    }[];
}

interface ExtendedHaircutHistory extends Omit<HaircutHistory, 'barber'> {
    barber?: { name: string };
}

export default function AdminClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { features } = useFeatures();
    const { id: clientId } = use(params);
    const router = useRouter();
    const supabase = createClient();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [appointments, setAppointments] = useState<ExtendedAppointment[]>([]);
    const [haircuts, setHaircuts] = useState<ExtendedHaircutHistory[]>([]);
    const [orders, setOrders] = useState<ExtendedOrder[]>([]);
    const [messages, setMessages] = useState<CommunicationLog[]>([]);

    const [notes, setNotes] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [isWaOpen, setIsWaOpen] = useState(false);

    // FASE 33 Bloque B: cumpleaños editable por el admin.
    const [birthDateInput, setBirthDateInput] = useState("");
    const [isSavingBirthDate, setIsSavingBirthDate] = useState(false);
    const [isEditingBirthDate, setIsEditingBirthDate] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Cargar perfil del cliente
            const profilePromise = supabase
                .from("profiles")
                .select("*")
                .eq("id", clientId)
                .single();

            // Cargar citas
            const appointmentsPromise = supabase
                .from("appointments")
                .select(`
                    *,
                    service:services(name, price),
                    barber:barbers(name)
                `)
                .eq("client_id", clientId)
                .order("appointment_date", { ascending: false });

            // Cargar historial de cortes
            const haircutsPromise = supabase
                .from("haircut_history")
                .select(`
                    *,
                    barber:barbers(name)
                `)
                .eq("client_id", clientId)
                .order("created_at", { ascending: false });

            // Cargar compras/órdenes
            const ordersPromise = supabase
                .from("orders")
                .select(`
                    *,
                    items:order_items(
                        id,
                        quantity,
                        unit_price,
                        product:products(name)
                    )
                `)
                .eq("client_id", clientId)
                .order("created_at", { ascending: false });

            // Cargar mensajes enviados
            const messagesPromise = supabase
                .from("communication_logs")
                .select("*")
                .eq("client_id", clientId)
                .order("sent_at", { ascending: false });

            const [profileRes, appointmentsRes, haircutsRes, ordersRes, messagesRes] = await Promise.all([
                profilePromise,
                appointmentsPromise,
                haircutsPromise,
                ordersPromise,
                messagesPromise
            ]);

            if (profileRes.error) throw profileRes.error;

            setProfile(profileRes.data);
            setNotes(profileRes.data.notes || "");
            setBirthDateInput(profileRes.data.birth_date || "");
            setIsEditingBirthDate(false);
            setAppointments(appointmentsRes.data || []);
            setHaircuts(haircutsRes.data || []);
            setOrders(ordersRes.data || []);
            setMessages(messagesRes.data || []);

        } catch (error) {
            console.error("Error loading client details:", error);
            toast.error("Error al cargar la información del cliente");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [clientId]);

    const handleSaveNotes = async () => {
        if (!profile) return;
        setIsSavingNotes(true);

        const { error } = await supabase
            .rpc("update_client_notes", {
                p_client_id: profile.id,
                p_notes: notes.trim() ? notes : null,
            });

        setIsSavingNotes(false);

        if (error) {
            console.error("Error saving notes:", error);
            toast.error("No se pudieron guardar las notas");
        } else {
            toast.success("Notas guardadas correctamente");
            setProfile(prev => prev ? { ...prev, notes: notes.trim() ? notes : null } : null);
        }
    };

    const handleSaveBirthDate = async () => {
        if (!profile) return;
        setIsSavingBirthDate(true);

        // La policy "Admins update profiles" (is_admin()) permite el UPDATE directo,
        // igual que con las notas: no hace falta una RPC dedicada.
        const { error } = await supabase
            .from("profiles")
            .update({ birth_date: birthDateInput || null })
            .eq("id", profile.id);

        setIsSavingBirthDate(false);

        if (error) {
            console.error("Error saving birth date:", error);
            toast.error("No se pudo guardar el cumpleaños");
        } else {
            toast.success("Cumpleaños actualizado correctamente");
            setProfile(prev => prev ? { ...prev, birth_date: birthDateInput || null } : null);
            setIsEditingBirthDate(false);
        }
    };

    // FASE 33 Bloque B: métricas calculadas en memoria de los arrays ya cargados,
    // sin queries nuevas. Mismo criterio de "gastado" que get_clients_overview_page.
    const metrics = useMemo(() => {
        const completedAppointments = appointments.filter((a) => a.status === "completed");
        const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "shipped" || o.status === "delivered");

        const appointmentsSpent = completedAppointments.reduce((sum, a) => sum + (a.service?.price || 0), 0);
        const ordersSpent = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        const totalSpent = appointmentsSpent + ordersSpent;

        const visits = completedAppointments.length;
        const avgTicket = visits > 0 ? totalSpent / visits : null;

        const sortedDates = completedAppointments
            .map((a) => a.appointment_date)
            .filter((d): d is string => !!d)
            .sort();

        let avgFrequencyDays: number | null = null;
        if (sortedDates.length >= 2) {
            const gaps: number[] = [];
            for (let i = 1; i < sortedDates.length; i++) {
                gaps.push(differenceInDays(parseISO(sortedDates[i]), parseISO(sortedDates[i - 1])));
            }
            avgFrequencyDays = Math.round(gaps.reduce((sum, g) => sum + g, 0) / gaps.length);
        }

        const lastVisitDate = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
        const daysSinceLastVisit = lastVisitDate ? differenceInDays(new Date(), parseISO(lastVisitDate)) : null;

        return { totalSpent, visits, avgTicket, avgFrequencyDays, lastVisitDate, daysSinceLastVisit };
    }, [appointments, orders]);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-muted/40 rounded animate-pulse" />
                    <div className="h-8 bg-muted/50 rounded w-1/4 animate-pulse" />
                </div>
                <div className="h-[200px] bg-muted/20 rounded animate-pulse" />
                <div className="h-[400px] bg-muted/10 rounded animate-pulse" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="text-center py-20">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-foreground">Cliente no encontrado</h1>
                <p className="text-muted-foreground mt-2">El cliente solicitado no existe o no tenés permisos para verlo.</p>
                <Button onClick={() => router.push("/admin/clientes")} className="mt-6">
                    Volver al listado
                </Button>
            </div>
        );
    }

    const birthdayThisMonth = isBirthdayThisMonth(profile.birth_date);
    const clientInactive = isInactiveClient(metrics.lastVisitDate);

    return (
        <div className="space-y-8">
            {/* Header / Ficha superior */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => router.push("/admin/clientes")}
                        className="h-10 w-10 border-border md:h-8 md:w-8"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
                            {profile.full_name}
                            {birthdayThisMonth && (
                                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs font-normal gap-1">
                                    <Cake className="h-3 w-3" aria-hidden="true" />
                                    Cumple este mes
                                </Badge>
                            )}
                        </h1>
                        <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                            <span>Cliente registrado desde el {format(parseISO(profile.created_at), "dd/MM/yyyy")}</span>
                        </p>
                    </div>
                </div>

                {/* Métricas del cliente (Bloque B FASE 33): calculadas en memoria, sin queries nuevas */}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="admin-agenda-stat rounded-xl border p-4" data-tone="completed">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total Gastado</p>
                                <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{formatPrice(metrics.totalSpent)}</p>
                            </div>
                            <span className="admin-agenda-stat-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
                                <Wallet className="h-5 w-5" aria-hidden="true" />
                            </span>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">Citas completadas + compras pagas</p>
                    </div>
                    <div className="admin-agenda-stat rounded-xl border p-4" data-tone="confirmed">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Visitas</p>
                                <p className="mt-2 text-2xl font-black tracking-tight text-foreground">{metrics.visits}</p>
                            </div>
                            <span className="admin-agenda-stat-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
                                <Scissors className="h-5 w-5" aria-hidden="true" />
                            </span>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            Ticket promedio: {metrics.avgTicket !== null ? formatPrice(metrics.avgTicket) : "—"}
                        </p>
                    </div>
                    <div className="admin-agenda-stat rounded-xl border p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Frecuencia Media</p>
                                <p className="mt-2 text-2xl font-black tracking-tight text-foreground">
                                    {metrics.avgFrequencyDays !== null ? `${metrics.avgFrequencyDays} días` : "—"}
                                </p>
                            </div>
                            <span className="admin-agenda-stat-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
                                <Repeat className="h-5 w-5" aria-hidden="true" />
                            </span>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">Entre visitas completadas</p>
                    </div>
                    <div className="admin-agenda-stat rounded-xl border p-4" data-tone={clientInactive ? "cancelled" : "pending"}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Última Visita</p>
                                <p className="mt-2 text-2xl font-black tracking-tight text-foreground">
                                    {metrics.daysSinceLastVisit !== null ? `Hace ${metrics.daysSinceLastVisit} días` : "—"}
                                </p>
                            </div>
                            <span className="admin-agenda-stat-icon inline-flex h-10 w-10 items-center justify-center rounded-xl">
                                <TrendingUp className="h-5 w-5" aria-hidden="true" />
                            </span>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">
                            {clientInactive ? "Cliente inactivo" : "Cliente activo"}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
                    {/* Tarjeta de Contacto */}
                    <Card className="bg-card/50 border-border/50">
                        <CardHeader>
                            <CardTitle className="text-lg">Información de Contacto</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/10">
                                        <Phone className="h-5 w-5" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-muted-foreground">Celular / Teléfono</span>
                                        <span className="text-foreground font-mono">{profile.phone || "No especificado"}</span>
                                    </div>
                                </div>
                                {profile.phone && features.mensajes_crm && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setIsWaOpen(true)}
                                        className="border-primary/20 hover:bg-primary/10 hover:text-primary gap-1.5"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        <span>Mensaje</span>
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/10">
                                    <CalendarIcon className="h-5 w-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground">Rol de Usuario</span>
                                    <span className="text-foreground capitalize">{profile.role}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/10">
                                    <Cake className="h-5 w-5" />
                                </div>
                                <div className="flex flex-col gap-1.5 flex-1">
                                    <span className="text-xs text-muted-foreground">
                                        Cumpleaños {birthdayThisMonth && <span className="text-primary">🎂 ¡este mes!</span>}
                                    </span>
                                    {profile.birth_date && !isEditingBirthDate ? (
                                        <div className="flex items-center gap-2">
                                            <span className="text-foreground">
                                                {format(parseISO(profile.birth_date), "d 'de' MMMM", { locale: es })}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setBirthDateInput(profile.birth_date || "");
                                                    setIsEditingBirthDate(true);
                                                }}
                                                className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
                                            >
                                                Editar
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="date"
                                                value={birthDateInput}
                                                onChange={(e) => setBirthDateInput(e.target.value)}
                                                className="admin-field-focus h-9 max-w-[170px] bg-background/50 border-input/50 text-sm"
                                            />
                                            <Button
                                                size="sm"
                                                onClick={handleSaveBirthDate}
                                                disabled={isSavingBirthDate || birthDateInput === (profile.birth_date || "")}
                                                className="h-9 bg-primary hover:bg-primary/90 text-black font-semibold gap-1.5"
                                            >
                                                {isSavingBirthDate ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                                Guardar
                                            </Button>
                                            {profile.birth_date && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setBirthDateInput(profile.birth_date || "");
                                                        setIsEditingBirthDate(false);
                                                    }}
                                                    className="h-9 px-2 text-xs text-muted-foreground"
                                                >
                                                    Cancelar
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Notas del Cliente */}
                    <Card className="bg-card/50 border-border/50">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-lg">Notas Internas</CardTitle>
                                <Button
                                    onClick={handleSaveNotes}
                                    disabled={isSavingNotes || notes.trim() === (profile.notes || "")}
                                    size="sm"
                                    className="bg-primary hover:bg-primary/90 text-black font-semibold gap-1.5"
                                >
                                    {isSavingNotes ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Save className="h-3.5 w-3.5" />
                                    )}
                                    Guardar
                                </Button>
                            </div>
                            <CardDescription>
                                Notas sobre gustos, alergias, o preferencias exclusivas para el equipo de staff.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                placeholder="Escribí notas sobre este cliente... (ej. le gusta mate amargo, prefiere corte a tijera con navaja en patillas, etc.)"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="admin-field-focus min-h-[100px] bg-background/50 border-input/50 resize-y"
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Tabs del Historial */}
            <Tabs defaultValue="citas" className="w-full">
                <TabsList className="bg-card/60 border border-border/40 w-full md:w-auto p-1 h-auto flex flex-wrap gap-1 md:inline-flex justify-start">
                    <TabsTrigger value="citas" className="gap-2 py-2">
                        <CalendarIcon className="h-4 w-4" />
                        Citas ({appointments.length})
                    </TabsTrigger>
                    <TabsTrigger value="cortes" className="gap-2 py-2">
                        <Scissors className="h-4 w-4" />
                        Historial de Cortes ({haircuts.length})
                    </TabsTrigger>
                    <TabsTrigger value="compras" className="gap-2 py-2">
                        <ShoppingBag className="h-4 w-4" />
                        Compras ({orders.length})
                    </TabsTrigger>
                    <TabsTrigger value="mensajes" className="gap-2 py-2">
                        <MessageSquare className="h-4 w-4" />
                        Mensajes ({messages.length})
                    </TabsTrigger>
                </TabsList>

                {/* Tab: Citas */}
                <TabsContent value="citas" className="mt-6">
                    <Card className="bg-card/50 border-border/50">
                        <CardContent className="p-0">
                            {appointments.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <CalendarIcon className="h-10 w-10 mx-auto mb-3 opacity-25" />
                                    <p className="font-semibold text-foreground/80">Sin citas agendadas</p>
                                    <p className="text-sm mt-1">Este cliente no registra turnos en el sistema.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/10 border-b border-border/30">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-6">Servicio</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Horario</TableHead>
                                            <TableHead>Barbero</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right pr-6">Precio</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {appointments.map((apt) => {
                                            return (
                                                <TableRow key={apt.id} className="border-b border-border/30">
                                                    <TableCell className="font-semibold text-foreground pl-6 py-4">
                                                        {apt.service?.name || "Servicio eliminado"}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {format(parseISO(apt.appointment_date), "d 'de' MMMM, yyyy", { locale: es })}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground font-mono text-sm">
                                                        {apt.start_time.slice(0, 5)} - {apt.end_time.slice(0, 5)}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {apt.barber?.name || "Sin asignar"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={APPOINTMENT_STATUS_COLORS[apt.status] || ""}>
                                                            {APPOINTMENT_STATUS_LABELS[apt.status] || apt.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-primary font-bold pr-6">
                                                        {apt.service ? formatPrice(apt.service.price) : "—"}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab: Historial de Cortes */}
                <TabsContent value="cortes" className="mt-6">
                    {haircuts.length === 0 ? (
                        <Card className="bg-card/50 border-border/50">
                            <CardContent className="text-center py-16 text-muted-foreground">
                                <Scissors className="h-10 w-10 mx-auto mb-3 opacity-25" />
                                <p className="font-semibold text-foreground/80">Sin fotos en el historial</p>
                                <p className="text-sm mt-1">No hay fotos guardadas del historial de cortes de este cliente.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {haircuts.map((haircut) => (
                                <Card key={haircut.id} className="bg-card/50 border-border/50 overflow-hidden flex flex-col">
                                    {/* Grid de Fotos */}
                                    <div className="relative aspect-[4/3] w-full bg-muted">
                                        <ImageWithFallback
                                            src={haircut.photo_urls?.[0]}
                                            alt={`Corte realizado por ${haircut.barber?.name || "Barbero"}`}
                                            fill
                                            sizes="(max-width: 768px) 100vw, 33vw"
                                            unoptimized
                                            className="object-cover"
                                            fallbackClassName="h-full w-full"
                                            iconClassName="h-12 w-12 text-muted-foreground/30"
                                        />
                                        <div className="absolute top-3 left-3 bg-black/75 px-3 py-1 rounded-full border border-border text-[10px] text-zinc-300 font-semibold font-mono">
                                            {format(parseISO(haircut.created_at), "dd/MM/yyyy HH:mm")}
                                        </div>
                                    </div>
                                    <CardContent className="p-4 flex-grow space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <UserIcon className="h-3 w-3 text-primary" />
                                                Atendido por: <strong className="text-foreground">{haircut.barber?.name || "Barbero"}</strong>
                                            </span>
                                        </div>
                                        {haircut.notes && (
                                            <p className="text-sm text-muted-foreground border-l border-primary/30 pl-3 italic">
                                                &quot;{haircut.notes}&quot;
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Tab: Compras */}
                <TabsContent value="compras" className="mt-6">
                    <Card className="bg-card/50 border-border/50">
                        <CardContent className="p-0">
                            {orders.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-25" />
                                    <p className="font-semibold text-foreground/80">Sin compras registradas</p>
                                    <p className="text-sm mt-1">El cliente no realizó compras de productos en la tienda.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/10 border-b border-border/30">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-6">Código de Orden</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Productos</TableHead>
                                            <TableHead>Pago</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right pr-6">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.map((order) => {
                                            return (
                                                <TableRow key={order.id} className="border-b border-border/30">
                                                    <TableCell className="font-mono text-xs font-semibold text-foreground pl-6 py-4">
                                                        {order.id.slice(0, 8).toUpperCase()}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {format(parseISO(order.created_at), "dd/MM/yyyy HH:mm")}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm max-w-[200px]">
                                                        <div className="flex flex-col gap-1">
                                                            {order.items?.map((item) => (
                                                                <span key={item.id} className="text-xs line-clamp-1">
                                                                    {item.product?.name} <span className="text-muted-foreground">(x{item.quantity})</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs font-medium">
                                                        {order.payment_method ? getPaymentMethodLabel(order.payment_method) : "—"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={ORDER_STATUS_COLORS[order.status] || ""}>
                                                            {ORDER_STATUS_LABELS[order.status] || order.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-primary font-bold pr-6">
                                                        {formatPrice(order.total)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab: Mensajes */}
                <TabsContent value="mensajes" className="mt-6">
                    <Card className="bg-card/50 border-border/50">
                        <CardContent className="p-0">
                            {messages.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-25" />
                                    <p className="font-semibold text-foreground/80">Sin mensajes enviados</p>
                                    <p className="text-sm mt-1">No se registran logs de notificaciones enviadas a este cliente.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/10 border-b border-border/30">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-6 w-[20%]">Fecha y Hora</TableHead>
                                            <TableHead className="w-[15%]">Canal / Teléfono</TableHead>
                                            <TableHead className="w-[50%]">Mensaje Enviado</TableHead>
                                            <TableHead className="w-[15%] text-right pr-6">Estado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {messages.map((msg) => {
                                            return (
                                                <TableRow key={msg.id} className="border-b border-border/30">
                                                    <TableCell className="text-muted-foreground text-sm pl-6 py-4">
                                                        {format(parseISO(msg.sent_at), "dd/MM/yyyy HH:mm")}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm font-mono">
                                                        {msg.client_phone || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs max-w-md break-words leading-normal">
                                                        {msg.message_sent}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <Badge variant="outline" className={COMMUNICATION_STATUS_COLORS[msg.status] || ""}>
                                                            {COMMUNICATION_STATUS_LABELS[msg.status] || msg.status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <SendWhatsappDialog
                clientId={profile.id}
                clientName={profile.full_name || "Cliente"}
                clientPhone={profile.phone}
                isOpen={isWaOpen}
                onOpenChange={setIsWaOpen}
                onLogAdded={loadData}
                eventType={birthdayThisMonth ? "birthday" : undefined}
            />
        </div>
    );
}
