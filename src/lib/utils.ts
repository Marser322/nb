import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, parseISO, addMinutes, isBefore, setHours, setMinutes } from "date-fns"
import { es } from "date-fns/locale"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Formatear fecha en español
export function formatDate(date: string | Date, formatStr: string = "PPP") {
  const d = typeof date === "string" ? parseISO(date) : date
  return format(d, formatStr, { locale: es })
}

// Formatear hora
export function formatTime(time: string) {
  const [hours, minutes] = time.split(":")
  return `${hours}:${minutes}`
}

// Formatear precio en pesos uruguayos
export function formatPrice(price: number) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    minimumFractionDigits: 0,
  }).format(price)
}

// Generar slots de tiempo disponibles
export function generateTimeSlots(
  startHour: number,
  endHour: number,
  intervalMinutes: number = 30
): string[] {
  const slots: string[] = []
  let current = setMinutes(setHours(new Date(), startHour), 0)
  const end = setMinutes(setHours(new Date(), endHour), 0)

  while (isBefore(current, end)) {
    slots.push(format(current, "HH:mm"))
    current = addMinutes(current, intervalMinutes)
  }

  return slots
}

// Generar slots de tiempo disponibles a partir de un rango en formato string (HH:mm)
export function generateTimeSlotsFromRange(
  start: string,
  end: string,
  intervalMinutes: number = 30
): string[] {
  const slots: string[] = []
  const [startHour, startMin] = start.split(":").map(Number)
  const [endHour, endMin] = end.split(":").map(Number)

  let current = setMinutes(setHours(new Date(), startHour), startMin)
  const limit = setMinutes(setHours(new Date(), endHour), endMin)

  while (isBefore(current, limit)) {
    slots.push(format(current, "HH:mm"))
    current = addMinutes(current, intervalMinutes)
  }

  return slots
}

// Verificar si una cita puede ser cancelada (por defecto 2 horas antes; el
// caller puede pasar la ventana vigente desde business-config.ts).
export function canCancelAppointment(appointmentDate: string, startTime: string, windowMinutes: number = 120): boolean {
  const appointmentDateTime = parseISO(`${appointmentDate}T${startTime}`)
  const now = new Date()
  const windowBefore = addMinutes(appointmentDateTime, -windowMinutes)

  return isBefore(now, windowBefore)
}

// Calcular hora de fin basándose en duración del servicio
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(":").map(Number)
  const start = setMinutes(setHours(new Date(), hours), minutes)
  const end = addMinutes(start, durationMinutes)
  return format(end, "HH:mm")
}
