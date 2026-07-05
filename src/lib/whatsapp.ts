/**
 * Normaliza un número de teléfono de Uruguay.
 * Acepta formatos como "099 123 456", "+598 99 123 456", "099123456", etc.
 * Retorna el número en formato "5989XXXXXXX" o null si no es válido.
 */
export function normalizeUyPhone(phone: string | null): string | null {
    if (!phone) return null;
    
    // Remover todo lo que no sea dígito
    const cleaned = phone.replace(/[^\d]/g, "");
    
    // Si empieza con 598
    if (cleaned.startsWith("598")) {
        if (cleaned.length === 11) {
            return cleaned;
        }
    }
    
    // Si empieza con 09 y tiene 9 dígitos (formato estándar UY: 099123456)
    if (cleaned.startsWith("09") && cleaned.length === 9) {
        return "598" + cleaned.substring(1);
    }
    
    // Si tiene 8 dígitos y empieza con 9 (formato UY sin el 0 inicial: 99123456)
    if (cleaned.startsWith("9") && cleaned.length === 8) {
        return "598" + cleaned;
    }
    
    return null;
}

/**
 * Reemplaza variables en una plantilla de mensaje.
 * Reemplaza {nombre} con el valor provisto.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
    let message = template;
    for (const [key, value] of Object.entries(vars)) {
        message = message.replace(new RegExp(`{${key}}`, "g"), value);
    }
    return message;
}

/**
 * Construye un link de WhatsApp (wa.me) con el teléfono y el mensaje prellenado.
 */
export function buildWaLink(phone: string, message: string): string {
    const normalized = normalizeUyPhone(phone);
    if (!normalized) return "";
    return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}
