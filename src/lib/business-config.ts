import { useState, useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { BUSINESS_CONFIG, BANK_TRANSFER_INFO } from "@/lib/constants";

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
const DEFAULTS: BusinessConfig = {
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

let cachedConfig: BusinessConfig | null = null;
let cacheTimestamp = 0;
let inFlightPromise: Promise<BusinessConfig> | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos en milisegundos

const listeners = new Set<() => void>();

export async function fetchBusinessConfig(): Promise<BusinessConfig> {
  // Si estamos en entorno servidor (no window), devolvemos DEFAULTS
  // (los server components/routes usan getBusinessConfigServer).
  if (typeof window === "undefined") {
    return DEFAULTS;
  }

  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL) {
    return cachedConfig;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return DEFAULTS;
  }

  inFlightPromise = (async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .like("key", "business.%");

      if (error) {
        console.error("Error fetching business config, failing open:", error);
        return DEFAULTS;
      }

      if (!data || data.length === 0) {
        return DEFAULTS;
      }

      const config: BusinessConfig = {
        ...DEFAULTS,
        workingHours: { ...DEFAULTS.workingHours },
        workingDays: [...DEFAULTS.workingDays],
        bankTransfer: { ...DEFAULTS.bankTransfer },
      };
      for (const row of data) {
        applyRow(config, row.key, row.value);
      }

      cachedConfig = config;
      cacheTimestamp = Date.now();
      return config;
    } catch (err) {
      console.error("Exception in fetchBusinessConfig, failing open:", err);
      return DEFAULTS;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

export function invalidateBusinessConfig(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error("Error in business-config listener:", e);
    }
  });
}

export function useBusinessConfig() {
  const [config, setConfig] = useState<BusinessConfig>(DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const checkConfig = async () => {
      const data = await fetchBusinessConfig();
      if (active) {
        setConfig(data);
        setIsLoaded(true);
      }
    };

    checkConfig();

    listeners.add(checkConfig);
    return () => {
      active = false;
      listeners.delete(checkConfig);
    };
  }, []);

  return { config, isLoaded };
}

/**
 * Helper server-side: misma query, pero recibe el cliente Supabase por
 * parámetro (server component o route handler). Fail-open a DEFAULTS ante
 * cualquier error para que el sitio nunca rompa por esto.
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

    const config: BusinessConfig = {
      ...DEFAULTS,
      workingHours: { ...DEFAULTS.workingHours },
      workingDays: [...DEFAULTS.workingDays],
      bankTransfer: { ...DEFAULTS.bankTransfer },
    };
    for (const row of data as { key: string; value: unknown }[]) {
      applyRow(config, row.key, row.value);
    }
    return config;
  } catch (err) {
    console.error("Exception in getBusinessConfigServer, failing open:", err);
    return DEFAULTS;
  }
}

/**
 * Nota de seguridad de UI:
 * El gating en el frontend es puramente estético y para la experiencia de usuario.
 * La validación y seguridad duras (ventana de cancelación) están enforced en el
 * RPC cancel_appointment vía app_settings, no solo acá.
 */
