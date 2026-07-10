import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_CONFIG, BANK_TRANSFER_INFO } from "@/lib/constants";

/**
 * Lógica pura (sin React) de la config de negocio, compartida entre el
 * cliente (business-config.ts, que agrega los hooks) y el servidor
 * (server components / route handlers, ej. layout.tsx y api/chat/route.ts).
 * No importa nada de "react": Next.js no permite que un Server Component o
 * Route Handler importe un módulo que llame hooks, aunque no invoque esa
 * función puntual — por eso este archivo vive separado.
 */

export type BusinessConfig = {
  phone: string;
  email: string;
  instagram: string;
  workingHours: { start: number; end: number };
  workingDays: number[];
  cancellationWindowMinutes: number;
  lateToleranceMinutes: number;
  bankTransfer: { bank: string; account: string; holder: string };
};

// Defaults de fallback (fail-open): si app_settings no tiene las claves
// business.% todavía o la query falla, el sitio se ve exactamente igual
// que antes de esta fase.
export const DEFAULTS: BusinessConfig = {
  phone: BUSINESS_CONFIG.phone,
  email: BUSINESS_CONFIG.email,
  instagram: BUSINESS_CONFIG.instagram,
  workingHours: { ...BUSINESS_CONFIG.workingHours },
  workingDays: [...BUSINESS_CONFIG.workingDays],
  cancellationWindowMinutes: BUSINESS_CONFIG.cancellationWindow,
  lateToleranceMinutes: BUSINESS_CONFIG.lateToleranceMinutes,
  bankTransfer: { ...BANK_TRANSFER_INFO },
};

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Convierte un array de días (0=Domingo..6=Sábado) a un label legible ("Lunes a Sábado"). */
export function formatWorkingDaysLabel(days: readonly number[]): string {
  if (days.length === 0) return "Consultá disponibilidad";
  const sorted = [...days].sort((a, b) => a - b);
  const isContiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (isContiguous) {
    return sorted.length === 1
      ? DAY_NAMES[sorted[0]]
      : `${DAY_NAMES[sorted[0]]} a ${DAY_NAMES[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((d) => DAY_NAMES[d]).join(", ");
}

/**
 * Copy de horarios ("Lunes a Sábado: 09:00 - 20:00") derivado de la config
 * vigente. Usado por Footer, Contacto y el chat.
 */
export function businessHoursLabel(config: Pick<BusinessConfig, "workingDays" | "workingHours">): string {
  return `${formatWorkingDaysLabel(config.workingDays)}: ${String(config.workingHours.start).padStart(2, "0")}:00 - ${String(config.workingHours.end).padStart(2, "0")}:00`;
}

/** "2 horas" / "1 hora" / "90 minutos" según la ventana de cancelación vigente. */
export function cancellationWindowLabel(minutes: number): string {
  return minutes % 60 === 0
    ? `${minutes / 60} hora${minutes / 60 === 1 ? "" : "s"}`
    : `${minutes} minutos`;
}

/** Parsea una fila de app_settings (key/value) y la vuelca sobre un BusinessConfig parcial. */
function applyRow(target: BusinessConfig, key: string, value: unknown): void {
  const name = key.replace("business.", "");
  switch (name) {
    case "phone":
      if (typeof value === "string") target.phone = value;
      break;
    case "email":
      if (typeof value === "string") target.email = value;
      break;
    case "instagram":
      if (typeof value === "string") target.instagram = value;
      break;
    case "working_hours":
      if (value && typeof value === "object" && "start" in value && "end" in value) {
        const v = value as { start: number; end: number };
        target.workingHours = { start: Number(v.start), end: Number(v.end) };
      }
      break;
    case "working_days":
      if (Array.isArray(value)) target.workingDays = value.map((d) => Number(d));
      break;
    case "cancellation_window_minutes":
      if (typeof value === "number") target.cancellationWindowMinutes = value;
      else if (typeof value === "string" && !Number.isNaN(Number(value))) target.cancellationWindowMinutes = Number(value);
      break;
    case "late_tolerance_minutes":
      if (typeof value === "number") target.lateToleranceMinutes = value;
      else if (typeof value === "string" && !Number.isNaN(Number(value))) target.lateToleranceMinutes = Number(value);
      break;
    case "bank_transfer":
      if (value && typeof value === "object") {
        const v = value as { bank?: string; account?: string; holder?: string };
        target.bankTransfer = {
          bank: v.bank ?? "",
          account: v.account ?? "",
          holder: v.holder ?? "",
        };
      }
      break;
  }
}

/**
 * Parsea filas de app_settings (key/value, sin filtrar) sobre un
 * BusinessConfig nuevo partiendo de DEFAULTS. Filas que no matchean una
 * clave business.% se ignoran, así que se le puede pasar el resultado de
 * una query que trajo feature.% y business.% en el mismo round-trip (chat
 * route) sin filtrar antes.
 */
export function parseBusinessConfigRows(rows: { key: string; value: unknown }[]): BusinessConfig {
  const config: BusinessConfig = {
    ...DEFAULTS,
    workingHours: { ...DEFAULTS.workingHours },
    workingDays: [...DEFAULTS.workingDays],
    bankTransfer: { ...DEFAULTS.bankTransfer },
  };
  for (const row of rows) {
    applyRow(config, row.key, row.value);
  }
  return config;
}

/**
 * Helper server-side: recibe el cliente Supabase por parámetro (server
 * component o route handler). Fail-open a DEFAULTS ante cualquier error
 * para que el sitio nunca rompa por esto.
 */
export async function getBusinessConfigServer(supabase: SupabaseClient): Promise<BusinessConfig> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("key, value")
      .like("key", "business.%");

    if (error || !data || data.length === 0) {
      return DEFAULTS;
    }

    return parseBusinessConfigRows(data as { key: string; value: unknown }[]);
  } catch (err) {
    console.error("Exception in getBusinessConfigServer, failing open:", err);
    return DEFAULTS;
  }
}
