"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Calendar,
    Clock,
    User,
    CheckCircle,
    XCircle,
    Phone,
    MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import {
    APPOINTMENT_STATUS_LABELS,
    APPOINTMENT_STATUS_COLORS,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Appointment, Service, Profile } from "@/types/database.types";
import { format, startOfToday } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import ChargeDialog from "@/components/shared/ChargeDialog";
import { useFeatures } from "@/lib/features";

type AppointmentWithRelations = Appointment & {
    service?: Service;
    client?: Profile;
};

export default function BarberoAgendaPage() {
    const { features } = useFeatures();
    const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [barberName, setBarberName] = useState<string | null>(null);
    const [accessError, setAccessError] = useState<string | null>(null);
    const [chargeApt, setChargeApt] = useState<AppointmentWithRelations | null>(null);
    const [ingresosReales, setIngresosReales] = useState(0);

    const supabase = createClient();
    const today = format(startOfToday(), "yyyy-MM-dd");

    const loadAgenda = useCallback(async () => {
        setIsLoading(true);

        // Invocación oportunista del generador de turnos fijos (fire-and-forget)
        const isDummy = process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("dummy") || false;
        if (!isDummy) {
            try {
                await supabase.rpc("generate_subscription_appointments");
            } catch (err) {
                console.error("Error generating subscription appointments:", err);
            }
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setAccessError("Iniciá sesión para ver tu agenda.");
            setIsLoading(false);
            return;
        }

        // Resolver el barbero vinculado al usuario logueado:
        // auth user → profiles → barbers.profile_id
        const { data: profile } = await supabase
            .from("profiles")
            .select("id")
            .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle();

        const { data: barber } = profile
            ? await supabase
                .from("barbers")
                .select("id, name")
                .eq("profile_id", profile.id)
                .eq("is_active", true)
                .limit(1)
                .maybeSingle()
            : { data: null };

        if (!barber) {
            setAccessError(
                "Tu usuario no está vinculado a un perfil de barbero. Pedile al administrador que te vincule desde el panel de Barberos."
            );
            setIsLoading(false);
            return;
        }

        setBarberName(barber.name);

        // Cargar citas
        const { data: appointmentsData } = await supabase
            .from("appointments")
            .select("*, service:services(*), client:profiles(*)")
            .eq("barber_id", barber.id)
            .eq("appointment_date", today)
            .not("status", "eq", "cancelled")
            .order("start_time");

        setAppointments(appointmentsData || []);

        // Cargar ingresos reales del día para este barbero (cargos de servicios y propinas)
        const { data: movements } = await supabase
            .from("cash_movements")
            .select("amount")
            .eq("barber_id", barber.id)
            .eq("type", "income")
            .gte("created_at", `${today}T00:00:00`)
            .lte("created_at", `${today}T23:59:59`);

        const totalReales = (movements || []).reduce(
            (sum, m) => sum + Number(m.amount),
            0
        );
        setIngresosReales(totalReales);

        setIsLoading(false);
    }, [today, supabase]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadAgenda();
    }, [loadAgenda]);

    const updateStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase
            .from("appointments")
            .update({ status: newStatus })
            .eq("id", id);

        if (error) {
            toast.error("Error al actualizar");
            return;
        }

        toast.success(`Cita ${APPOINTMENT_STATUS_LABELS[newStatus].toLowerCase()}`);
        loadAgenda(); // Recargar todo para actualizar estadísticas e ingresos si corresponde
    };

    // Estadísticas del día
    const stats = {
        total: appointments.length,
        pendientes: appointments.filter((a) => a.status === "pending").length,
        confirmadas: appointments.filter((a) => a.status === "confirmed").length,
        completadas: appointments.filter((a) => a.status === "completed").length,
    };

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
                <p className="text-muted-foreground">
                    {format(new Date(), "EEEE, d 'de' MMMM yyyy", { locale: es })}
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-border/50">
                    <CardContent className="p-4">
                        <p className="text-3xl font-bold">{stats.total}</p>
                        <p className="text-sm text-muted-foreground">Citas Hoy</p>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="p-4">
                        <p className="text-3xl font-bold text-yellow-400">{stats.pendientes}</p>
                        <p className="text-sm text-muted-foreground">Pendientes</p>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="p-4">
                        <p className="text-3xl font-bold text-blue-400">{stats.confirmadas}</p>
                        <p className="text-sm text-muted-foreground">Confirmadas</p>
                    </CardContent>
                </Card>
                <Card className="border-border/50">
                    <CardContent className="p-4">
                        <p className="text-3xl font-bold text-primary">{formatPrice(ingresosReales)}</p>
                        <p className="text-sm text-muted-foreground">Ingresos del Día</p>
                    </CardContent>
                </Card>
            </div>

            {/* Agenda */}
            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        Citas de Hoy
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
                            <p>No tenés citas para hoy</p>
                            <p className="text-sm mt-1">¡Disfrutá del descanso! 🎉</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {appointments.map((cita, index) => (
                                <div
                                    key={cita.id}
                                    className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-card border border-border/50 gap-4"
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
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                                    <Phone className="h-3 w-3" />
                                                    {cita.client.phone}
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

                                        {cita.status === "pending" && (
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => updateStatus(cita.id, "confirmed")}
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-1" />
                                                    Confirmar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-red-400 border-red-400/30"
                                                    onClick={() => updateStatus(cita.id, "cancelled")}
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        )}

                                        {cita.status === "confirmed" && (
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    className="bg-green-500 hover:bg-green-600"
                                                    onClick={() => {
                                                        if (features.contabilidad) {
                                                            setChargeApt(cita);
                                                        } else {
                                                            updateStatus(cita.id, "completed");
                                                        }
                                                    }}
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-1" />
                                                    Completar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-gray-400 border-gray-400/30"
                                                    onClick={() => updateStatus(cita.id, "no_show")}
                                                >
                                                    <XCircle className="h-4 w-4 mr-1" />
                                                    No vino
                                                </Button>
                                            </div>
                                        )}

                                        {cita.status === "completed" && (
                                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                                                ✓ Completada
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
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
