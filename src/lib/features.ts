import { createClient } from "@/lib/supabase/client";

export type FeatureKey = 'tienda' | 'suscripciones' | 'contabilidad' | 'propinas' | 'mensajes_crm' | 'lookbook' | 'reservas_online' | 'portal_barbero' | 'chat_aprendizaje';
export type Features = Record<FeatureKey, boolean>;

const DEFAULTS: Features = {
  tienda: true,
  suscripciones: true,
  contabilidad: true,
  propinas: true,
  mensajes_crm: true,
  lookbook: true,
  reservas_online: true,
  portal_barbero: true,
  chat_aprendizaje: true,
};

let cachedFeatures: Features | null = null;
let cacheTimestamp = 0;
let inFlightPromise: Promise<Features> | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos en milisegundos

const listeners = new Set<() => void>();

export async function fetchFeatures(): Promise<Features> {
  // Si estamos en entorno servidor (no window), devolvemos DEFAULTS
  if (typeof window === "undefined") {
    return DEFAULTS;
  }

  const now = Date.now();
  if (cachedFeatures && now - cacheTimestamp < CACHE_TTL) {
    return cachedFeatures;
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  // Si no hay variables de Supabase configuradas (modo dummy/desarrollo sin env), devolvemos DEFAULTS
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return DEFAULTS;
  }

  inFlightPromise = (async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .like("key", "feature.%");

      if (error) {
        console.error("Error fetching features, failing open:", error);
        return DEFAULTS;
      }

      if (!data || data.length === 0) {
        return DEFAULTS;
      }

      const features = { ...DEFAULTS };
      for (const row of data) {
        const featureName = row.key.replace("feature.", "") as FeatureKey;
        if (featureName in features) {
          // row.value puede ser un booleano directo o el string de JSON "true"/"false"
          features[featureName] = row.value === true || row.value === "true";
        }
      }

      cachedFeatures = features;
      cacheTimestamp = Date.now();
      return features;
    } catch (err) {
      console.error("Exception in fetchFeatures, failing open:", err);
      return DEFAULTS;
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
}

export function invalidateFeatures(): void {
  cachedFeatures = null;
  cacheTimestamp = 0;
  // Notificar a todos los listeners activos para que recarguen
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (e) {
      console.error("Error in features listener:", e);
    }
  });
}

import { useState, useEffect } from "react";

export function useFeatures() {
  const [features, setFeatures] = useState<Features>(DEFAULTS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    const checkFeatures = async () => {
      const data = await fetchFeatures();
      if (active) {
        setFeatures(data);
        setIsLoaded(true);
      }
    };

    checkFeatures();

    listeners.add(checkFeatures);
    return () => {
      active = false;
      listeners.delete(checkFeatures);
    };
  }, []);

  return { features, isLoaded };
}

/**
 * Nota de seguridad de UI:
 * El gating en el frontend es puramente estético y para la experiencia de usuario.
 * La validación y seguridad duras deben implementarse a través de Row Level Security (RLS)
 * y chequeos de políticas en la base de datos o dentro de las funciones RPC/API.
 */
