import { SupabaseClient } from "@supabase/supabase-js";
import { generateTimeSlots } from "@/lib/utils";
import { BUSINESS_CONFIG } from "@/lib/constants";
import { Database, DayAvailability } from "@/types/database.types";

/**
 * Citas que bloquean la agenda (pendientes o confirmadas) de un barbero en una fecha.
 * Primero intenta con RPC 'get_booked_slots', si falla, realiza una consulta directa.
 */
export async function fetchActiveAppointments(
    supabase: SupabaseClient<Database>,
    barberId: string,
    dateStr: string
): Promise<{ start_time: string; end_time: string }[]> {
    const { data, error } = await supabase.rpc("get_booked_slots", {
        p_barber_id: barberId,
        p_date: dateStr,
    });
    if (!error) return data ?? [];

    const { data: direct, error: directError } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("barber_id", barberId)
        .eq("appointment_date", dateStr)
        .in("status", ["pending", "confirmed"]);
        
    if (directError) {
        console.error("Error direct fetching active appointments:", directError);
    }
    return direct ?? [];
}

/**
 * Un slot de tiempo está ocupado si cae dentro del rango [inicio, fin) de alguna cita.
 */
export function computeBookedSlots(
    appointments: { start_time: string; end_time: string }[]
): string[] {
    const timeSlots = generateTimeSlots(
        BUSINESS_CONFIG.workingHours.start,
        BUSINESS_CONFIG.workingHours.end,
        BUSINESS_CONFIG.timeSlotMinutes
    );
    return timeSlots.filter((slot) =>
        appointments.some(
            (apt) => slot >= apt.start_time.slice(0, 5) && slot < apt.end_time.slice(0, 5)
        )
    );
}

/**
 * Retorna true si hay superposición entre el rango [selectedTime, endTime)
 * y alguna de las citas existentes de ese barbero.
 */
export function hasOverlap(
    selectedTime: string,
    endTime: string,
    existing: { start_time: string; end_time: string }[]
): boolean {
    const selMin = selectedTime.slice(0, 5);
    const endMin = endTime.slice(0, 5);
    return existing.some(
        (apt) => selMin < apt.end_time.slice(0, 5) && apt.start_time.slice(0, 5) < endMin
    );
}

/**
 * Invoca el RPC 'book_appointment' y traduce los errores a mensajes legibles en español (es-UY).
 */
export async function bookAppointment(
    supabase: SupabaseClient<Database>,
    params: {
        barberId: string;
        serviceId: string;
        date: string; // 'yyyy-MM-dd'
        startTime: string; // 'HH:mm'
        isRecurring: boolean;
        styleReference?: string | null;
        notes?: string | null;
    }
): Promise<
    | { ok: true; appointmentId: string; subscriptionId: string | null }
    | { ok: false; message: string; code?: string }
> {
    try {
        const { data, error } = await supabase.rpc("book_appointment", {
            p_barber_id: params.barberId,
            p_service_id: params.serviceId,
            p_date: params.date,
            p_start_time: params.startTime,
            p_recurring: params.isRecurring,
            p_style_reference: params.styleReference || null,
            p_notes: params.notes || null,
        });

        if (error) {
            console.error("RPC book_appointment error:", error);
            
            // Mapeo de códigos de error específicos
            const errorMsg = error.message || "";
            const errorCode = error.code || "";

            if (errorMsg.includes("SLOT_OCUPADO") || errorCode === "23P01") {
                return {
                    ok: false,
                    message: "Ese horario acaba de ocuparse, elegí otro.",
                    code: "SLOT_OCUPADO",
                };
            }
            if (errorMsg.includes("HORARIO_PASADO")) {
                return {
                    ok: false,
                    message: "El horario seleccionado ya pasó.",
                    code: "HORARIO_PASADO",
                };
            }
            if (errorMsg.includes("FUERA_DE_HORARIO")) {
                return {
                    ok: false,
                    message: "El horario seleccionado está fuera de la disponibilidad de la barbería.",
                    code: "FUERA_DE_HORARIO",
                };
            }
            if (errorMsg.includes("SERVICIO_NO_DISPONIBLE")) {
                return {
                    ok: false,
                    message: "El servicio seleccionado no está disponible.",
                    code: "SERVICIO_NO_DISPONIBLE",
                };
            }
            if (errorMsg.includes("PERFIL_NO_ENCONTRADO")) {
                return {
                    ok: false,
                    message: "No se encontró tu perfil de usuario. Iniciá sesión de nuevo.",
                    code: "PERFIL_NO_ENCONTRADO",
                };
            }

            return {
                ok: false,
                message: "Error al crear la reserva. Intentá de nuevo.",
                code: errorCode,
            };
        }

        const appointmentId = data?.appointment_id;
        const subscriptionId = data?.subscription_id || null;

        if (!appointmentId) {
            return {
                ok: false,
                message: "Error al crear la reserva. Intentá de nuevo.",
            };
        }

        return {
            ok: true,
            appointmentId,
            subscriptionId,
        };
    } catch (err) {
        console.error("Unexpected error in bookAppointment helper:", err);
        return {
            ok: false,
            message: "Ocurrió un error inesperado al procesar tu reserva.",
        };
    }
}

/**
 * Obtiene la disponibilidad diaria efectiva de un barbero en un rango de fechas.
 * Soporta un fallback / mock si se está en modo interactivo de pruebas local (isDummy).
 */
export async function fetchAvailability(
    supabase: SupabaseClient<Database>,
    barberId: string,
    fromISO: string, // YYYY-MM-DD
    toISO: string    // YYYY-MM-DD
): Promise<DayAvailability[]> {
    const isDummy =
        typeof window !== "undefined" &&
        (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("dummy") ||
            !process.env.NEXT_PUBLIC_SUPABASE_URL);

    if (isDummy) {
        // Simular datos de disponibilidad para pruebas locales
        const start = new Date(fromISO + "T00:00:00");
        const end = new Date(toISO + "T00:00:00");
        const list: DayAvailability[] = [];

        // Cargar citas mocks locales
        const localAppointments = JSON.parse(
            localStorage.getItem("nb-appointments") || "[]"
        ) as Array<{
            barber_id: string;
            appointment_date: string;
            status: string;
            start_time: string;
            end_time: string;
        }>;

        const current = new Date(start);
        while (current <= end) {
            const dayOfWeek = current.getDay(); // 0 = Domingo, 6 = Sábado
            const dateStr = current.toISOString().split("T")[0];

            // Abierto de lunes a sábado
            const isOpen = dayOfWeek !== 0;
            const openTime = "09:00:00";
            const closeTime = dayOfWeek === 6 ? "18:00:00" : "20:00:00";

            // Filtrar citas para este barbero en esta fecha
            const dayApts = localAppointments.filter(
                (apt) =>
                    apt.barber_id === barberId &&
                    apt.appointment_date === dateStr &&
                    (apt.status === "pending" || apt.status === "confirmed")
            );

            const bookedSlots = dayApts.map((apt) => ({
                start: apt.start_time,
                end: apt.end_time,
            }));

            list.push({
                day: dateStr,
                is_open: isOpen,
                open_time: isOpen ? openTime : null,
                close_time: isOpen ? closeTime : null,
                break_start: null,
                break_end: null,
                slot_minutes: 30,
                booked: bookedSlots,
                blocks: [],
            });

            current.setDate(current.getDate() + 1);
        }
        return list;
    }

    const { data, error } = await supabase.rpc("get_availability", {
        p_barber_id: barberId,
        p_from: fromISO,
        p_to: toISO,
    });

    if (error) {
        console.error("Error fetching availability:", error);
        throw error;
    }

    interface AvailabilityRow {
        day: string;
        is_open: boolean;
        open_time: string | null;
        close_time: string | null;
        break_start: string | null;
        break_end: string | null;
        slot_minutes: number;
        booked: string | Array<{ start: string; end: string }> | null;
        blocks: string | Array<{ start_time: string | null; end_time: string | null }> | null;
    }

    return (
        (data as AvailabilityRow[])?.map((row) => ({
            day: row.day,
            is_open: row.is_open,
            open_time: row.open_time,
            close_time: row.close_time,
            break_start: row.break_start,
            break_end: row.break_end,
            slot_minutes: row.slot_minutes,
            booked: typeof row.booked === "string" ? JSON.parse(row.booked) : (row.booked || []),
            blocks: typeof row.blocks === "string" ? JSON.parse(row.blocks) : (row.blocks || []),
        })) ?? []
    );
}

