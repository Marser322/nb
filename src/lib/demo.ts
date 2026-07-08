/**
 * Flag único del modo demo. Importable desde server y client:
 * NEXT_PUBLIC_DEMO_MODE se inlinea en build en ambos entornos.
 */
export const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
