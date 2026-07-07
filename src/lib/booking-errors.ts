export const BOOKING_ERROR_MESSAGES: Record<string, string> = {
    SLOT_OCUPADO: "El horario ya está ocupado para ese barbero",
    HORARIO_BLOQUEADO: "Ese horario está bloqueado en la agenda del barbero",
    FUERA_DE_HORARIO: "Ese horario está fuera del horario de atención",
    SERVICIO_INACTIVO: "El servicio seleccionado ya no está activo",
    BARBERO_INACTIVO: "El barbero seleccionado ya no está activo",
    CITA_NO_EXISTE: "La cita ya no existe o no tenés permisos para editarla",
};

export function getBookingErrorMessage(error: { code?: string; message?: string } | null) {
    if (!error) return "No se pudo completar la operación";

    const raw = `${error.code || ""} ${error.message || ""}`;
    if (error.code === "23P01") return BOOKING_ERROR_MESSAGES.SLOT_OCUPADO;

    const code = Object.keys(BOOKING_ERROR_MESSAGES).find((key) => raw.includes(key));
    return code ? BOOKING_ERROR_MESSAGES[code] : error.message || "No se pudo completar la operación";
}
