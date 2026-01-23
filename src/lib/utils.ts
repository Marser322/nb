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

// Verificar si una cita puede ser cancelada (2 horas antes)
export function canCancelAppointment(appointmentDate: string, startTime: string): boolean {
  const appointmentDateTime = parseISO(`${appointmentDate}T${startTime}`)
  const now = new Date()
  const twoHoursBefore = addMinutes(appointmentDateTime, -120)

  return isBefore(now, twoHoursBefore)
}

// Calcular hora de fin basándose en duración del servicio
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(":").map(Number)
  const start = setMinutes(setHours(new Date(), hours), minutes)
  const end = addMinutes(start, durationMinutes)
  return format(end, "HH:mm")
}
