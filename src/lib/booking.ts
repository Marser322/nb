import { SupabaseClient } from "@supabase/supabase-js";
import { generateTimeSlots } from "@/lib/utils";
import { BUSINESS_CONFIG } from "@/lib/constants";

/**
 * Citas que bloquean la agenda (pendientes o confirmadas) de un barbero en una fecha.
 * Primero intenta con RPC 'get_booked_slots', si falla, realiza una consulta directa.
 */
export async function fetchActiveAppointments(
    supabase: SupabaseClient<any>,
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
    supabase: SupabaseClient<any>,
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

