"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO, differenceInWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Calendar, Clock, History, Loader2, MapPin, Package, Pencil, Repeat, Scissors, ShoppingBag, User } from "lucide-react";
import { Header, Footer } from "@/components/layout";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import {
    APPOINTMENT_STATUS_COLORS,
    APPOINTMENT_STATUS_LABELS,
    FULFILLMENT_LABELS,
    ORDER_STATUS_COLORS,
    ORDER_STATUS_LABELS,
    ORDER_TYPE_LABELS,
    ROUTES,
} from "@/lib/constants";
import { toast } from "sonner";
import { formatPrice, canCancelAppointment } from "@/lib/utils";
import { getBarberAvatarUrl } from "@/lib/static-data";
import type { Appointment, Barber, Branch, HaircutHistory, Order, OrderItem, Product, Profile, Service, Subscription } from "@/types/database.types";
import { useFeatures } from "@/lib/features";
import { useBusinessConfig, cancellationWindowLabel as formatCancellationWindow } from "@/lib/business-config";

type AppointmentWithRelations = Appointment & {
    service?: Service | null;
    barber?: Barber | null;
};

type HaircutHistoryWithRelations = HaircutHistory & {
    service?: Service | null;
    barber?: Barber | null;
};

type OrderWithRelations = Order & {
    branch?: Branch | null;
    items?: (OrderItem & { product?: Product | null })[];
};

type CancelTarget = {
    type: "appointment" | "subscription";
    id: string;
    title: string;
    detail: string;
};

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const profileFormSchema = z.object({
    full_name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
    phone: z
        .string()
        .trim()
        .regex(/^[0-9\s]{8,12}$/, "Ingresá un teléfono válido (8 a 12 dígitos)")
        .optional()
        .or(z.literal("")),
    // FASE 33 C: opcional siempre, nunca bloquea el guardado si queda vacío.
    birth_date: z
        .string()
        .trim()
        .optional()
        .or(z.literal(""))
        .refine((value) => {
            if (!value) return true;
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return false;
            return date <= new Date();
        }, "Ingresá una fecha de nacimiento válida"),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function MiCuentaPage() {
    const { features } = useFeatures();
    const { config } = useBusinessConfig();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [isLoading, setIsLoading] = useState(true);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [upcomingAppointments, setUpcomingAppointments] = useState<AppointmentWithRelations[]>([]);
    const [recentAppointments, setRecentAppointments] = useState<AppointmentWithRelations[]>([]);
    const [history, setHistory] = useState<HaircutHistoryWithRelations[]>([]);
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [orders, setOrders] = useState<OrderWithRelations[]>([]);
    const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const profileForm = useForm<ProfileFormValues>({
        resolver: zodResolver(profileFormSchema),
        defaultValues: { full_name: "", phone: "", birth_date: "" },
    });

    useEffect(() => {
        async function loadAccount() {
            setIsLoading(true);

            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                router.push(`${ROUTES.LOGIN}?next=${ROUTES.MI_CUENTA}`);
                return;
            }

            const { data: profileData } = await supabase
                .from("profiles")
                .select("*")
                .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
                .limit(1)
                .maybeSingle();

            if (!profileData) {
                setIsLoading(false);
                return;
            }

            const today = new Date().toISOString().slice(0, 10);
            const [upcomingRes, recentRes, historyRes, subsRes, ordersRes] = await Promise.all([
                supabase
                    .from("appointments")
                    .select("*, service:services(*), barber:barbers(*)")
                    .eq("client_id", profileData.id)
                    .gte("appointment_date", today)
                    .in("status", ["pending", "confirmed"])
                    .order("appointment_date", { ascending: true })
                    .order("start_time", { ascending: true })
                    .limit(5),
                supabase
                    .from("appointments")
                    .select("*, service:services(*), barber:barbers(*)")
                    .eq("client_id", profileData.id)
                    .lt("appointment_date", today)
                    .order("appointment_date", { ascending: false })
                    .order("start_time", { ascending: false })
                    .limit(5),
                supabase
                    .from("haircut_history")
                    .select("*, service:services(*), barber:barbers(*)")
                    .eq("client_id", profileData.id)
                    .order("created_at", { ascending: false })
                    .limit(5),
                supabase
                    .from("subscriptions")
                    .select("*, service:services(*), barber:barbers(*)")
                    .eq("client_id", profileData.id)
                    .eq("status", "active")
                    .order("created_at", { ascending: false }),
                supabase
                    .from("orders")
                    .select("*, branch:branches(*), items:order_items(*, product:products(*))")
                    .eq("client_id", profileData.id)
                    .order("created_at", { ascending: false })
                    .limit(8),
            ]);

            setProfile(profileData);
            setUpcomingAppointments(upcomingRes.data || []);
            setRecentAppointments(recentRes.data || []);
            setHistory(historyRes.data || []);
            setSubscriptions(subsRes.data || []);
            setOrders((ordersRes.data || []) as OrderWithRelations[]);
            setIsLoading(false);
        }

        loadAccount();
    }, [router, supabase]);

    // FASE 22 D: precargar el form de edición de perfil cuando se abre el dialog.
    useEffect(() => {
        if (isEditProfileOpen && profile) {
            profileForm.reset({
                full_name: profile.full_name || "",
                phone: profile.phone || "",
                birth_date: profile.birth_date || "",
            });
        }
    }, [isEditProfileOpen, profile, profileForm]);

    const lastExperience = useMemo(() => {
        if (history[0]) return history[0];
        const lastAppointment = recentAppointments[0];
        if (!lastAppointment) return null;

        return {
            id: lastAppointment.id,
            client_id: lastAppointment.client_id,
            barber_id: lastAppointment.barber_id,
            service_id: lastAppointment.service_id,
            appointment_id: lastAppointment.id,
            notes: lastAppointment.style_reference || lastAppointment.notes,
            photo_urls: [],
            created_at: lastAppointment.appointment_date,
            service: lastAppointment.service,
            barber: lastAppointment.barber,
        } satisfies HaircutHistoryWithRelations;
    }, [history, recentAppointments]);

    // FASE 22 A1: fecha y cadencia de la última experiencia.
    const lastExperienceMeta = useMemo(() => {
        if (!lastExperience?.created_at) return null;
        const date = parseISO(lastExperience.created_at);
        const weeks = differenceInWeeks(new Date(), date);
        return {
            dateLabel: format(date, "d 'de' MMMM", { locale: es }),
            cadenceLabel: weeks < 1 ? "Esta semana" : `Hace ${weeks} semana${weeks === 1 ? "" : "s"}`,
            suggestRepeat: weeks >= 4,
        };
    }, [lastExperience]);

    const requestCancelAppointment = (appointment: AppointmentWithRelations) => {
        setCancelTarget({
            type: "appointment",
            id: appointment.id,
            title: appointment.service?.name || "Turno",
            detail: `${format(parseISO(appointment.appointment_date), "EEEE d 'de' MMMM", { locale: es })} · ${appointment.start_time.slice(0, 5)} hs con ${appointment.barber?.name || "tu barbero"}`,
        });
    };

    const requestCancelSubscription = (sub: Subscription) => {
        setCancelTarget({
            type: "subscription",
            id: sub.id,
            title: sub.service?.name || "Turno fijo semanal",
            detail: `Todos los ${WEEKDAYS[sub.day_of_week]} a las ${sub.start_time.slice(0, 5)} hs con ${sub.barber?.name || "tu barbero"}`,
        });
    };

    const handleConfirmCancel = async () => {
        if (!cancelTarget) return;
        setIsCancelling(true);

        if (cancelTarget.type === "subscription") {
            try {
                const { error } = await supabase
                    .from("subscriptions")
                    .update({ status: "cancelled", updated_at: new Date().toISOString() })
                    .eq("id", cancelTarget.id);

                if (error) throw error;

                setSubscriptions(prev => prev.filter(sub => sub.id !== cancelTarget.id));
                toast.success("Turno fijo cancelado correctamente");
                setCancelTarget(null);
            } catch (err) {
                console.error("Error cancelling subscription:", err);
                toast.error("No se pudo cancelar el turno fijo. Inténtalo de nuevo.");
            } finally {
                setIsCancelling(false);
            }
            return;
        }

        try {
            const { error } = await supabase.rpc("cancel_appointment", {
                p_appointment_id: cancelTarget.id,
            });

            if (error) {
                console.error("RPC cancel_appointment error:", error);
                if (error.message && error.message.includes("FUERA_DE_VENTANA")) {
                    toast.error(`Solo podés cancelar hasta ${cancellationWindowLabel} antes del turno`);
                } else if (error.message && error.message.includes("NO_CANCELABLE")) {
                    toast.error("Este turno no se puede cancelar");
                } else {
                    toast.error("No se pudo cancelar el turno. Intentá de nuevo.");
                }
                return;
            }

            setUpcomingAppointments(prev => prev.filter(a => a.id !== cancelTarget.id));
            toast.success("Reserva cancelada correctamente");
            setCancelTarget(null);
        } catch (err) {
            console.error("Error cancelling appointment:", err);
            toast.error("Ocurrió un error al intentar cancelar la reserva.");
        } finally {
            setIsCancelling(false);
        }
    };

    const onSubmitProfile = async (values: ProfileFormValues) => {
        if (!profile) return;
        setIsSavingProfile(true);

        try {
            const nextFullName = values.full_name.trim();
            const nextPhone = values.phone?.trim() || null;
            const nextBirthDate = values.birth_date?.trim() || null;

            const { error } = await supabase
                .from("profiles")
                .update({ full_name: nextFullName, phone: nextPhone, birth_date: nextBirthDate })
                .eq("id", profile.id);

            if (error) throw error;

            setProfile(prev => (prev ? { ...prev, full_name: nextFullName, phone: nextPhone, birth_date: nextBirthDate } : prev));
            toast.success("Perfil actualizado correctamente");
            setIsEditProfileOpen(false);
        } catch (err) {
            console.error("Error updating profile:", err);
            toast.error("No se pudo actualizar el perfil. Intentá de nuevo.");
        } finally {
            setIsSavingProfile(false);
        }
    };

    const repeatHref = lastExperience
        ? `${ROUTES.RESERVAR}?serviceId=${lastExperience.service_id}&barberId=${lastExperience.barber_id}`
        : ROUTES.RESERVAR;

    // Ventana de cancelación derivada de la config vigente, no hardcodeada.
    const cancellationWindowLabel = formatCancellationWindow(config.cancellationWindowMinutes);

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="container mx-auto px-4 pt-28 pb-20">
                {isLoading ? (
                    <div className="min-h-[55vh] flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-10">
                        <section className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6 items-stretch">
                            <div className="relative overflow-hidden rounded-lg border border-border bg-card p-8 md:p-10">
                                <div className="absolute inset-0">
                                    <Image
                                        src="/images/hero/detalle-corte.jpg"
                                        alt="Detalle de corte"
                                        fill
                                        sizes="(max-width: 1024px) 100vw, 60vw"
                                        className="object-cover opacity-20"
                                        priority
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/35" />
                                </div>
                                <div className="relative z-10 max-w-2xl">
                                    <p className="font-display text-sm uppercase tracking-[0.25em] text-primary mb-4">
                                        Mi cuenta
                                    </p>
                                    <h1 className="font-display text-5xl md:text-7xl font-bold uppercase leading-none text-white">
                                        Tu estilo, sin empezar de cero.
                                    </h1>
                                    <p className="mt-6 text-zinc-300 leading-relaxed">
                                        Guardamos tus reservas y referencias para que tu próxima visita sea más rápida.
                                    </p>
                                    <Button asChild size="lg" className="mt-8 h-12 rounded-full px-8 font-bold">
                                        <Link href={repeatHref}>
                                            <Repeat className="mr-2 h-5 w-5" />
                                            {lastExperience ? "Reservar lo mismo" : "Reservar turno"}
                                        </Link>
                                    </Button>
                                </div>
                            </div>

                            <Card id="profile-card" className="border-border bg-card/70">
                                <CardHeader className="flex flex-row items-center justify-between gap-2">
                                    <CardTitle className="flex items-center gap-2">
                                        <User className="h-5 w-5 text-primary" />
                                        Perfil
                                    </CardTitle>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setIsEditProfileOpen(true)}
                                        className="h-8 gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
                                    >
                                        <Pencil className="h-3.5 w-3.5" />
                                        Editar
                                    </Button>
                                </CardHeader>
                                <CardContent className="space-y-5">
                                    <div>
                                        <p className="text-sm text-muted-foreground">Nombre</p>
                                        <p className="text-xl font-bold text-foreground">{profile?.full_name || "Cliente NB"}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Teléfono</p>
                                        {profile?.phone ? (
                                            <p className="text-foreground">{profile.phone}</p>
                                        ) : (
                                            <p className="text-sm text-muted-foreground italic">
                                                Agregalo para que podamos avisarte de tu turno
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm text-muted-foreground">Próximas reservas</p>
                                        <p className="text-3xl font-bold text-primary">{upcomingAppointments.length}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </section>

                        <section className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-6">
                            <Card id="last-experience-card" className="border-border bg-card/70">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Scissors className="h-5 w-5 text-primary" />
                                        Última experiencia
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {lastExperience ? (
                                        <div className="space-y-5">
                                            <div className="flex items-center gap-4">
                                                <div className="relative h-16 w-16 overflow-hidden rounded-full bg-primary/10">
                                                    <ImageWithFallback
                                                        src={lastExperience.barber ? getBarberAvatarUrl(lastExperience.barber) : null}
                                                        alt={lastExperience.barber?.name || "Barbero NB"}
                                                        fill
                                                        sizes="64px"
                                                        className="object-cover"
                                                        fallbackClassName="h-full w-full rounded-full"
                                                        iconClassName="h-7 w-7 text-primary"
                                                    />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-foreground">{lastExperience.service?.name || "Servicio NB"}</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {lastExperience.barber?.name || "Barbero NB"}
                                                    </p>
                                                    {lastExperienceMeta && (
                                                        <p className="text-xs text-primary/80 mt-1">
                                                            {lastExperienceMeta.dateLabel} · {lastExperienceMeta.cadenceLabel}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            {lastExperience.notes && (
                                                <p className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
                                                    {lastExperience.notes}
                                                </p>
                                            )}
                                            {lastExperienceMeta?.suggestRepeat && (
                                                <p className="text-sm text-muted-foreground">
                                                    ¿Volvemos a dejarlo impecable?
                                                </p>
                                            )}
                                            <Button asChild className="w-full rounded-full">
                                                <Link href={repeatHref}>Reservar lo mismo</Link>
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="py-10 text-center">
                                            <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                                            <p className="font-semibold text-foreground">Todavía no hay historial</p>
                                            <p className="text-sm text-muted-foreground mt-2">
                                                Cuando completes una visita, la vas a ver acá.
                                            </p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                            <Card id="upcoming-reservations-card" className="border-border bg-card/70">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Calendar className="h-5 w-5 text-primary" />
                                        Próximas reservas
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {upcomingAppointments.length === 0 ? (
                                        <div className="py-10 text-center">
                                            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                                            <p className="font-semibold text-foreground">No tenés reservas próximas</p>
                                            <Button asChild className="mt-5 rounded-full">
                                                <Link href={ROUTES.RESERVAR}>Reservar turno</Link>
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {upcomingAppointments.map((appointment) => (
                                                <div key={appointment.id} className="rounded-lg border border-border bg-muted/30 p-4">
                                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                        <div>
                                                            <p className="font-bold text-foreground">{appointment.service?.name}</p>
                                                            <p className="text-sm text-muted-foreground">
                                                                {format(parseISO(appointment.appointment_date), "EEEE d 'de' MMMM", { locale: es })}
                                                            </p>
                                                        </div>
                                                        <Badge variant="outline" className={APPOINTMENT_STATUS_COLORS[appointment.status]}>
                                                            {APPOINTMENT_STATUS_LABELS[appointment.status]}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                                                        <div className="flex flex-wrap items-center gap-4">
                                                            <span className="inline-flex items-center gap-2">
                                                                <Clock className="h-4 w-4 text-primary" />
                                                                {appointment.start_time.slice(0, 5)} - {appointment.end_time.slice(0, 5)}
                                                            </span>
                                                            <span>{appointment.barber?.name}</span>
                                                            {appointment.service && <span className="text-primary">{formatPrice(appointment.service.price)}</span>}
                                                        </div>
                                                        <div>
                                                            {canCancelAppointment(appointment.appointment_date, appointment.start_time, config.cancellationWindowMinutes) ? (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => requestCancelAppointment(appointment)}
                                                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs px-3 rounded-full h-8"
                                                                >
                                                                    Cancelar
                                                                </Button>
                                                            ) : (
                                                                <span className="text-xs text-zinc-500 font-light">
                                                                    No se puede cancelar (menos de {cancellationWindowLabel})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </section>

                        <Card id="visit-history-card" className="border-border bg-card/70">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <History className="h-5 w-5 text-primary" />
                                    Historial de visitas
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {recentAppointments.length === 0 ? (
                                    <div className="py-10 text-center">
                                        <History className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                                        <p className="font-semibold text-foreground">Todavía no tenés visitas registradas</p>
                                        <p className="text-sm text-muted-foreground mt-2">
                                            Cuando completes una visita, la vas a ver acá.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {recentAppointments.map((appointment) => {
                                            const visitRepeatHref = `${ROUTES.RESERVAR}?serviceId=${appointment.service_id}&barberId=${appointment.barber_id}`;

                                            return (
                                                <div key={appointment.id} className="rounded-lg border border-border bg-muted/20 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                    <div>
                                                        <p className="font-bold text-foreground">{appointment.service?.name || "Servicio NB"}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {format(parseISO(appointment.appointment_date), "d 'de' MMMM, yyyy", { locale: es })} · {appointment.barber?.name || "Barbero NB"}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        {appointment.service && (
                                                            <span className="text-sm font-medium text-primary">{formatPrice(appointment.service.price)}</span>
                                                        )}
                                                        <Badge variant="outline" className={APPOINTMENT_STATUS_COLORS[appointment.status]}>
                                                            {APPOINTMENT_STATUS_LABELS[appointment.status]}
                                                        </Badge>
                                                        <Button asChild size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs">
                                                            <Link href={visitRepeatHref}>
                                                                <Repeat className="mr-1.5 h-3.5 w-3.5" />
                                                                Repetir
                                                            </Link>
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {features.tienda && (
                            <Card id="orders-card" className="border-border bg-card/70">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <ShoppingBag className="h-5 w-5 text-primary" />
                                        Mis pedidos
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    {orders.length === 0 ? (
                                        <div className="py-10 text-center">
                                            <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                                            <p className="font-semibold text-foreground">No tenés pedidos todavía</p>
                                            <p className="text-sm text-muted-foreground mt-2">
                                                Cuando compres productos en la tienda, los vas a ver acá.
                                            </p>
                                            <Button asChild className="mt-5 rounded-full">
                                                <Link href={ROUTES.TIENDA}>Ir a la tienda</Link>
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {orders.map((order) => {
                                                const itemCount = order.items?.reduce((total, item) => total + item.quantity, 0) || 0;
                                                const createdAt = order.created_at ? format(parseISO(order.created_at), "d 'de' MMMM, yyyy", { locale: es }) : "";

                                                return (
                                                    <div key={order.id} className="rounded-lg border border-border bg-muted/20 p-4">
                                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                                                            <div>
                                                                <p className="font-bold text-foreground">Orden #{order.id.slice(0, 8).toUpperCase()}</p>
                                                                <p className="text-sm text-muted-foreground">{createdAt}</p>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                <Badge variant="outline" className={ORDER_STATUS_COLORS[order.status] || ""}>
                                                                    {ORDER_STATUS_LABELS[order.status] || order.status}
                                                                </Badge>
                                                                <Badge variant="outline">
                                                                    {ORDER_TYPE_LABELS[order.order_type] || order.order_type}
                                                                </Badge>
                                                            </div>
                                                        </div>

                                                        <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                                                            <div className="space-y-2">
                                                                {order.items?.slice(0, 3).map((item) => (
                                                                    <div key={item.id} className="flex items-center gap-3 text-sm">
                                                                        <div className="relative h-10 w-10 overflow-hidden rounded bg-muted flex-shrink-0">
                                                                            <ImageWithFallback
                                                                                src={item.product?.image_url}
                                                                                alt={item.product?.name || "Producto NB"}
                                                                                fill
                                                                                sizes="40px"
                                                                                className="object-cover"
                                                                                fallbackClassName="h-full w-full rounded"
                                                                                iconClassName="h-4 w-4"
                                                                            />
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <p className="font-medium text-foreground truncate">{item.product?.name || "Producto"}</p>
                                                                            <p className="text-muted-foreground">
                                                                                x{item.quantity} · {formatPrice(item.unit_price)}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                {(order.items?.length || 0) > 3 && (
                                                                    <p className="text-xs text-muted-foreground">
                                                                        +{(order.items?.length || 0) - 3} productos más
                                                                    </p>
                                                                )}
                                                            </div>

                                                            <div className="space-y-2 md:text-right text-sm">
                                                                <p className="font-bold text-primary text-lg">{formatPrice(order.total)}</p>
                                                                <p className="text-muted-foreground">{itemCount} unidades</p>
                                                                <p className="inline-flex md:justify-end items-center gap-2 text-muted-foreground">
                                                                    <MapPin className="h-4 w-4 text-primary" />
                                                                    {order.branch?.name || "Sucursal pendiente"}
                                                                </p>
                                                                <p className="text-muted-foreground">
                                                                    {FULFILLMENT_LABELS[order.fulfillment] || order.fulfillment}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Sección de Suscripciones (Turnos Fijos) */}
                        {features.suscripciones && (
                            <Card id="subscriptions-card" className="border-border bg-card/70">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Repeat className="h-5 w-5 text-primary animate-pulse" />
                                    Mis Turnos Fijos (Suscripciones Semanales)
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {subscriptions.length === 0 ? (
                                    <div className="py-10 text-center">
                                        <Repeat className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="font-semibold text-foreground">No tenés suscripciones de turnos fijos activas</p>
                                        <p className="text-xs text-muted-foreground mt-2 max-w-md mx-auto">
                                            Al agendar un turno, podés activar la opción &quot;¿Querés reservar este turno de forma fija semanal?&quot; para asegurar tu espacio de forma recurrente todas las semanas.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {subscriptions.map((sub) => {
                                            const dayName = WEEKDAYS[sub.day_of_week];

                                            return (
                                                <div key={sub.id} className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-5 flex flex-col justify-between gap-4">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <p className="font-bold text-foreground text-base md:text-lg">{sub.service?.name}</p>
                                                            <p className="text-sm text-primary font-medium flex items-center gap-1.5 mt-1">
                                                                <Repeat className="h-4 w-4" />
                                                                Todos los {dayName} a las {sub.start_time.slice(0, 5)} hs
                                                            </p>
                                                            <p className="text-xs text-muted-foreground mt-2">
                                                                Profesional: <span className="text-foreground">{sub.barber?.name}</span>
                                                            </p>
                                                        </div>
                                                        <Badge className="bg-primary/20 text-primary border-primary/30 uppercase tracking-wider text-[9px] h-5 rounded-full">
                                                            Fijo Semanal
                                                        </Badge>
                                                    </div>
                                                    
                                                    <div className="flex items-center justify-between border-t border-border pt-3 mt-1">
                                                        <span className="text-xs text-muted-foreground">
                                                            {sub.service && formatPrice(sub.service.price)} / sesión
                                                        </span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => requestCancelSubscription(sub)}
                                                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs px-3 rounded-full h-8"
                                                        >
                                                            Cancelar turno fijo
                                                        </Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        )}
                    </div>
                )}
            </main>

            <Footer />

            {/* FASE 22 C: dialog de confirmación de cancelación (turno o suscripción) */}
            <Dialog open={!!cancelTarget} onOpenChange={(open) => { if (!open && !isCancelling) setCancelTarget(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Cancelar {cancelTarget?.type === "subscription" ? "turno fijo" : "turno"}
                        </DialogTitle>
                        <DialogDescription>
                            Esta acción no se puede deshacer.
                        </DialogDescription>
                    </DialogHeader>
                    {cancelTarget && (
                        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
                            <p className="font-semibold text-foreground">{cancelTarget.title}</p>
                            <p className="text-muted-foreground mt-1">{cancelTarget.detail}</p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCancelTarget(null)}
                            disabled={isCancelling}
                        >
                            Volver
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmCancel}
                            disabled={isCancelling}
                        >
                            {isCancelling ? "Cancelando…" : "Sí, cancelar"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* FASE 22 D: dialog de edición de perfil */}
            <Dialog open={isEditProfileOpen} onOpenChange={setIsEditProfileOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar perfil</DialogTitle>
                        <DialogDescription>
                            Mantené tus datos al día para que podamos avisarte de tus turnos.
                        </DialogDescription>
                    </DialogHeader>
                    <Form {...profileForm}>
                        <form onSubmit={profileForm.handleSubmit(onSubmitProfile)} className="space-y-4">
                            <FormField
                                control={profileForm.control}
                                name="full_name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nombre completo</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Tu nombre" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={profileForm.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Teléfono</FormLabel>
                                        <FormControl>
                                            <Input placeholder="099 123 456" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={profileForm.control}
                                name="birth_date"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Fecha de nacimiento (opcional)</FormLabel>
                                        <FormControl>
                                            <Input type="date" {...field} />
                                        </FormControl>
                                        <p className="text-xs text-muted-foreground">Para sorprenderte en tu mes 🎁</p>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsEditProfileOpen(false)}
                                    disabled={isSavingProfile}
                                >
                                    Volver
                                </Button>
                                <Button type="submit" disabled={isSavingProfile}>
                                    {isSavingProfile ? "Guardando…" : "Guardar cambios"}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
