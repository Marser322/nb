"use client";

import { useState, useEffect } from "react";
import {
    Calendar,
    Search,
    Filter,
    CheckCircle,
    XCircle,
    Clock,
    User,
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
import { formatPrice, formatDate } from "@/lib/utils";
import {
    APPOINTMENT_STATUS_LABELS,
    APPOINTMENT_STATUS_COLORS,
    APPOINTMENT_STATUS,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Appointment, Service, Barber, Profile } from "@/types/database.types";
import { format, addDays, startOfToday } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

type AppointmentWithRelations = Appointment & {
    service?: Service;
    barber?: Barber;
    client?: Profile;
};

export default function AdminCitasPage() {
    const [appointments, setAppointments] = useState<AppointmentWithRelations[]>([]);
    const [filteredAppointments, setFilteredAppointments] = useState<AppointmentWithRelations[]>([]);
    const [selectedDate, setSelectedDate] = useState(format(startOfToday(), "yyyy-MM-dd"));
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    // Cargar citas
    useEffect(() => {
        async function loadAppointments() {
            setIsLoading(true);
            const { data } = await supabase
                .from("appointments")
                .select("*, service:services(*), barber:barbers(*), client:profiles(*)")
                .eq("appointment_date", selectedDate)
                .order("start_time");

            setAppointments(data || []);
            setFilteredAppointments(data || []);
            setIsLoading(false);
        }
        loadAppointments();
    }, [selectedDate]);

    // Filtrar por estado
    useEffect(() => {
        if (statusFilter === "all") {
            setFilteredAppointments(appointments);
        } else {
            setFilteredAppointments(appointments.filter((a) => a.status === statusFilter));
        }
    }, [statusFilter, appointments]);

    // Actualizar estado de cita
    const updateStatus = async (id: string, newStatus: string) => {
        const { error } = await supabase
            .from("appointments")
            .update({ status: newStatus })
            .eq("id", id);

        if (error) {
            toast.error("Error al actualizar la cita");
            return;
        }

        toast.success(`Cita ${APPOINTMENT_STATUS_LABELS[newStatus].toLowerCase()}`);

        // Actualizar estado local
        setAppointments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, status: newStatus as Appointment["status"] } : a))
        );
    };

    // Generar fechas para selector rápido
    const quickDates = Array.from({ length: 7 }, (_, i) => addDays(startOfToday(), i));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl md:text-3xl font-bold">Gestión de Citas</h1>
                <p className="text-muted-foreground">
                    Administra las citas del día
                </p>
            </div>

            {/* Filtros */}
            <div className="flex flex-col md:flex-row gap-4">
                {/* Selector de fecha rápido */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {quickDates.map((date) => {
                        const dateStr = format(date, "yyyy-MM-dd");
                        const isSelected = selectedDate === dateStr;
                        return (
                            <button
                                key={dateStr}
                                onClick={() => setSelectedDate(dateStr)}
                                className={`flex-shrink-0 flex flex-col items-center p-2 rounded-lg border transition-colors min-w-[60px] ${isSelected
                                        ? "border-primary bg-primary/10 text-primary"
                                        : "border-border hover:border-primary/50"
                                    }`}
                            >
                                <span className="text-xs uppercase">
                                    {format(date, "EEE", { locale: es })}
                                </span>
                                <span className="text-lg font-bold">{format(date, "d")}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Filtro de estado */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full md:w-[180px]">
                        <Filter className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos los estados</SelectItem>
                        <SelectItem value="pending">Pendientes</SelectItem>
                        <SelectItem value="confirmed">Confirmadas</SelectItem>
                        <SelectItem value="completed">Completadas</SelectItem>
                        <SelectItem value="cancelled">Canceladas</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Lista de citas */}
            <Card className="border-border/50">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-primary" />
                            {format(new Date(selectedDate), "EEEE, d 'de' MMMM", { locale: es })}
                        </span>
                        <Badge variant="secondary">
                            {filteredAppointments.length} citas
                        </Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
                            ))}
                        </div>
                    ) : filteredAppointments.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                            <p>No hay citas para este día</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredAppointments.map((cita) => (
                                <div
                                    key={cita.id}
                                    className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-card border border-border/50 gap-4"
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Hora */}
                                        <div className="text-center min-w-[70px] bg-muted/50 rounded-lg p-2">
                                            <p className="text-lg font-bold">{cita.start_time.slice(0, 5)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {cita.end_time.slice(0, 5)}
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
                                            <p className="text-sm text-muted-foreground">
                                                <User className="inline h-3 w-3 mr-1" />
                                                {cita.client?.full_name || "Cliente"}
                                                {" • "}
                                                Barbero: {cita.barber?.name || "Sin asignar"}
                                            </p>
                                            {cita.service && (
                                                <p className="text-sm font-semibold text-primary mt-1">
                                                    {formatPrice(cita.service.price)}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Acciones */}
                                    {cita.status === "pending" || cita.status === "confirmed" ? (
                                        <div className="flex gap-2">
                                            {cita.status === "pending" && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-green-400 border-green-400/30 hover:bg-green-400/10"
                                                    onClick={() => updateStatus(cita.id, "confirmed")}
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-1" />
                                                    Confirmar
                                                </Button>
                                            )}
                                            {cita.status === "confirmed" && (
                                                <Button
                                                    size="sm"
                                                    className="bg-green-500 hover:bg-green-600"
                                                    onClick={() => updateStatus(cita.id, "completed")}
                                                >
                                                    <CheckCircle className="h-4 w-4 mr-1" />
                                                    Completar
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                                                onClick={() => updateStatus(cita.id, "cancelled")}
                                            >
                                                <XCircle className="h-4 w-4 mr-1" />
                                                Cancelar
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
