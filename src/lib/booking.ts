import { SupabaseClient } from "@supabase/supabase-js";
import { generateTimeSlots, generateTimeSlotsFromRange, calculateEndTime } from "@/lib/utils";
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

/** Cita activa que choca con un bloqueo de agenda que se está por crear. */
export type ScheduleBlockConflict = {
    id: string;
    appointment_date: string;
    start_time: string;
    end_time: string;
    clientName: string;
    barberName: string;
};

/**
 * Busca citas activas (pending/confirmed) de uno o más barberos que se solapan
 * con el rango de un bloqueo de agenda a punto de crearse. Usado por
 * `/admin/barberos` y `/admin/sucursales` antes del INSERT en `schedule_blocks`
 * para advertir al admin en vez de dejar citas huérfanas sin aviso.
 *
 * Si `startTime`/`endTime` son null, el bloqueo es de día(s) completo(s) y
 * cualquier cita activa dentro del rango de fechas choca.
 */
export async function findScheduleBlockConflicts(
    supabase: SupabaseClient<Database>,
    params: {
        barberIds: string[];
        startDate: string; // yyyy-MM-dd
        endDate: string; // yyyy-MM-dd
        startTime: string | null; // HH:mm
        endTime: string | null; // HH:mm
    }
): Promise<ScheduleBlockConflict[]> {
    const barberIds = [...new Set(params.barberIds)];
    if (barberIds.length === 0) return [];

    const { data, error } = await supabase
        .from("appointments")
        .select("id, appointment_date, start_time, end_time, notes, barber:barbers(name), client:profiles(full_name)")
        .in("barber_id", barberIds)
        .gte("appointment_date", params.startDate)
        .lte("appointment_date", params.endDate)
        .in("status", ["pending", "confirmed"])
        .order("appointment_date")
        .order("start_time");

    if (error) {
        console.error("Error checking schedule block conflicts:", error);
        return [];
    }

    type Row = {
        id: string;
        appointment_date: string;
        start_time: string;
        end_time: string;
        notes: string | null;
        barber: { name: string } | null;
        client: { full_name: string | null } | null;
    };

    const rows = (data ?? []) as unknown as Row[];
    const overlapping = params.startTime && params.endTime
        ? rows.filter((row) => hasOverlap(params.startTime as string, params.endTime as string, [{ start_time: row.start_time, end_time: row.end_time }]))
        : rows;

    return overlapping.map((row) => ({
        id: row.id,
        appointment_date: row.appointment_date,
        start_time: row.start_time,
        end_time: row.end_time,
        clientName: row.client?.full_name || row.notes?.split(" - ")[0]?.replace("Cliente: ", "") || "Cliente",
        barberName: row.barber?.name || "Sin asignar",
    }));
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
 * Obtiene la disponibilidad diaria efectiva de un barbero en un rango de fechas
 * usando el RPC 'get_availability' (fuente única de verdad del wizard de reservas).
 */
export async function fetchAvailability(
    supabase: SupabaseClient<Database>,
    barberId: string,
    fromISO: string, // YYYY-MM-DD
    toISO: string    // YYYY-MM-DD
): Promise<DayAvailability[]> {
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

/**
 * Indica si un día de disponibilidad (`get_availability`) tiene al menos un hueco
 * libre para un servicio de la duración dada. Reusa la misma aritmética que
 * `isSlotAvailable` del wizard de reserva (citas, descanso y bloqueos), sin el
 * corte por "hora ya pasada" (ese chequeo depende del reloj del cliente y no
 * corresponde a nivel día).
 */
export function dayHasFreeSlot(day: DayAvailability, durationMinutes: number): boolean {
    if (!day.is_open || !day.open_time || !day.close_time) return false;

    const startStr = day.open_time.slice(0, 5);
    const endStr = day.close_time.slice(0, 5);
    const slotMinutes = day.slot_minutes || 30;
    const timeSlots = generateTimeSlotsFromRange(startStr, endStr, slotMinutes);
    const slotsNeeded = Math.ceil(durationMinutes / slotMinutes);

    return timeSlots.some((time, startIdx) => {
        const endTime = calculateEndTime(time, durationMinutes);
        if (endTime > endStr) return false;

        for (let i = 0; i < slotsNeeded; i++) {
            const slotToCheck = timeSlots[startIdx + i];
            if (!slotToCheck) return false;

            const slotEndToCheck = calculateEndTime(slotToCheck, slotMinutes);

            const isBooked = day.booked.some((apt) => {
                const aptStart = apt.start.slice(0, 5);
                const aptEnd = apt.end.slice(0, 5);
                return slotToCheck < aptEnd && aptStart < slotEndToCheck;
            });
            if (isBooked) return false;

            if (day.break_start && day.break_end) {
                const breakStart = day.break_start.slice(0, 5);
                const breakEnd = day.break_end.slice(0, 5);
                if (slotToCheck < breakEnd && breakStart < slotEndToCheck) return false;
            }

            const isBlocked = day.blocks.some((block) => {
                const blockStart = block.start.slice(0, 5);
                const blockEnd = block.end.slice(0, 5);
                return slotToCheck < blockEnd && blockStart < slotEndToCheck;
            });
            if (isBlocked) return false;
        }

        return true;
    });
}

