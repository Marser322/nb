import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULTS,
  parseBusinessConfigRows,
  type BusinessConfig,
} from "@/lib/business-config-shared";

// Re-exports: los consumidores cliente siguen importando todo desde acá
// (calcado del patrón de features.ts). La lógica pura y el helper server
// (getBusinessConfigServer) viven en business-config-shared.ts porque
// Next.js no permite que un Server Component / Route Handler importe un
// módulo con hooks de React, aunque no llame a esa función puntual.
export type { BusinessConfig } from "@/lib/business-config-shared";
export {
  DAY_NAMES,
  formatWorkingDaysLabel,
  businessHoursLabel,
  cancellationWindowLabel,
  parseBusinessConfigRows,
  getBusinessConfigServer,
} from "@/lib/business-config-shared";

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

      const config = parseBusinessConfigRows(data);

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
 * Nota de seguridad de UI:
 * El gating en el frontend es puramente estético y para la experiencia de usuario.
 * La validación y seguridad duras (ventana de cancelación) están enforced en el
 * RPC cancel_appointment vía app_settings, no solo acá.
 */
