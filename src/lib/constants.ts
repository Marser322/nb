// Constantes de la aplicación NB Barber

// Configuración del negocio — defaults de fallback; los valores vivos
// (phone, email, instagram, workingHours, workingDays, cancellationWindow,
// bankTransfer) se editan en /admin/configuracion y se leen vía
// src/lib/business-config.ts (claves business.% en app_settings). Si
// app_settings no tiene esas claves o es inaccesible, se usan estos valores
// (fail-open). `name`, `location` y `timeSlotMinutes` NO son editables.
export const BUSINESS_CONFIG = {
    name: "New Brothers",
    location: "Uruguay",
    phone: "+598 99 123 456",
    email: "contacto@nbbarber.com",
    instagram: "@newbrothers.uy",

    // Horarios de atención (24h format) - NOTA: Solo branding/copy. Ya no gobiernan la disponibilidad en vivo.
    workingHours: {
        start: 9,  // 9:00 AM
        end: 20,   // 8:00 PM
    },

    // Días de trabajo (0 = Domingo, 6 = Sábado) - NOTA: Solo branding/copy. Ya no gobiernan la disponibilidad en vivo.
    workingDays: [1, 2, 3, 4, 5, 6], // Lunes a Sábado

    // Política de cancelaciones (en minutos)
    cancellationWindow: 120, // 2 horas antes

    // Tolerancia de llegada tarde (en minutos)
    lateToleranceMinutes: 10,

    // Duración del intervalo de tiempo (en minutos) — estructural, NO editable
    // (get_availability lo hardcodea).
    timeSlotMinutes: 30,
}

// Datos bancarios para transferencias — defaults de fallback; el valor vivo
// se edita en /admin/configuracion (business.bank_transfer) vía
// src/lib/business-config.ts. Mientras estén vacíos, la UI usa el fallback
// honesto (coordinar por WhatsApp).
export const BANK_TRANSFER_INFO = {
    bank: '',
    account: '',
    holder: '',
}

// Duraciones de servicios (en minutos)
export const SERVICE_DURATIONS = {
    CORTE_SIMPLE: 30,
    CORTE_BARBA: 60,
    BARBA_SOLO: 30,
    TRATAMIENTO: 45,
} as const

// Estados de citas
export const APPOINTMENT_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    NO_SHOW: 'no_show',
} as const

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente',
    confirmed: 'Confirmada',
    completed: 'Completada',
    cancelled: 'Cancelada',
    no_show: 'No se presentó',
}

export const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    completed: 'bg-green-500/20 text-green-400 border-green-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    no_show: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

// Estados de órdenes
export const ORDER_STATUS_LABELS: Record<string, string> = {
    pending: 'Pendiente',
    paid: 'Pagada',
    shipped: 'Enviada',
    delivered: 'Entregada',
    cancelled: 'Cancelada',
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    paid: 'bg-green-500/20 text-green-400 border-green-500/30',
    shipped: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    delivered: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
    online: 'Pedido online',
    local: 'Venta en local',
}

export const ORDER_TYPE_COLORS: Record<string, string> = {
    online: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    local: 'bg-primary/20 text-primary border-primary/30',
}

export const FULFILLMENT_LABELS: Record<string, string> = {
    pickup: 'Retiro en sucursal',
    delivery: 'Envío',
}

export const FULFILLMENT_COLORS: Record<string, string> = {
    pickup: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    delivery: 'bg-primary/20 text-primary border-primary/30',
}

export const COMMUNICATION_STATUS_LABELS: Record<string, string> = {
    sent: 'Enviado',
    delivered: 'Entregado',
    failed: 'Fallo',
}

export const COMMUNICATION_STATUS_COLORS: Record<string, string> = {
    sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    delivered: 'bg-green-500/20 text-green-400 border-green-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
}

// Plantillas de mensajes por evento de cita (message_templates)
export const MESSAGE_EVENT_TYPES = ['cancelled', 'confirmed', 'rescheduled', 'reminder', 'thanks', 'birthday'] as const

export const MESSAGE_EVENT_LABELS: Record<string, string> = {
    cancelled: 'Cancelación',
    confirmed: 'Confirmación',
    rescheduled: 'Reprogramación',
    reminder: 'Recordatorio de cita',
    thanks: 'Agradecimiento',
    birthday: 'Cumpleaños',
}

// Lista de clientes /admin/clientes (FASE 33): chips de segmento y select de orden.
export const CLIENT_SEGMENT_LABELS: Record<string, string> = {
    todos: 'Todos',
    nuevos: 'Nuevos (30 días)',
    inactivos: 'Inactivos',
    cumple_mes: 'Cumplen este mes',
}

export const CLIENT_SORT_LABELS: Record<string, string> = {
    recent: 'Más recientes',
    spent: 'Mayor gasto',
    visits: 'Más visitas',
    name: 'Nombre',
}

// Chat que aprende (/admin/asistente): proveedor que generó la respuesta y modo de la conversación
export const CHAT_PROVIDER_LABELS: Record<string, string> = {
    gemini: 'Gemini',
    openai: 'OpenAI',
    rules: 'Motor de reglas',
}

export const CHAT_MODE_LABELS: Record<string, string> = {
    client: 'Cliente',
    admin: 'Admin',
}

// Métodos de pago
export const PAYMENT_METHODS = {
    CASH: 'cash',
    CARD: 'card',
    TRANSFER: 'transfer',
    OTHER: 'other',
} as const

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    other: 'Otro',
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    mercadopago: 'Mercado Pago',
}

export type CanonicalPaymentMethod = 'cash' | 'card' | 'transfer' | 'other'

export function normalizePaymentMethod(method: string | null | undefined): CanonicalPaymentMethod | null {
    if (!method) return null;
    if (method === 'cash' || method === 'efectivo') return 'cash';
    if (method === 'card' || method === 'tarjeta') return 'card';
    if (method === 'transfer' || method === 'transferencia') return 'transfer';
    return 'other';
}

export function getPaymentMethodLabel(method: string | null | undefined): string {
    if (!method) return 'N/A';
    return PAYMENT_METHOD_LABELS[method] || PAYMENT_METHOD_LABELS[normalizePaymentMethod(method) || 'other'] || method;
}

export const ORDER_TO_CASH_PAYMENT: Record<string, CanonicalPaymentMethod> = {
    efectivo: 'cash',
    transferencia: 'transfer',
    mercadopago: 'transfer',
}

// Movimientos de Caja
export const CASH_MOVEMENT_TYPE_LABELS: Record<string, string> = {
    income: 'Ingreso',
    expense: 'Egreso',
}

export const CASH_CATEGORY_LABELS: Record<string, string> = {
    service: 'Servicio',
    product: 'Producto',
    tip: 'Propina',
    adjustment: 'Ajuste',
    supply: 'Insumos',
    salary: 'Sueldo',
    rent: 'Alquiler',
    chair_rental: 'Renta de sillón',
    settlement: 'Liquidación',
    other: 'Otro',
}

// Modelos de Compensación
export const COMPENSATION_MODEL_LABELS: Record<string, string> = {
    commission: 'Comisión',
    chair_rental: 'Renta de sillón',
    hybrid: 'Híbrido',
    employee: 'Empleado',
}


// Categorías de servicios (códigos EN en DB, labels ES en UI)
export const SERVICE_CATEGORIES = ['corte', 'barba', 'combo', 'tratamiento', 'color', 'otro'] as const
export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
    corte: 'Cortes', barba: 'Barba', combo: 'Combos',
    tratamiento: 'Tratamientos', color: 'Color', otro: 'Otros',
}

// Categorías de productos
export const PRODUCT_CATEGORIES = [
    'Styling',
    'Barba',
    'Cabello',
    'Afeitado',
    'Accesorios',
] as const

// Sucursales de la barbería
export type Branch = {
    id: number
    name: string
    address: string
    image: string
    phone: string
    tone: string
}

export const BRANCHES: Branch[] = [
    {
        id: 1,
        name: "New Brothers Central",
        address: "Av. Principal 1234, Centro",
        image: "/images/branches/sucursal-central.jpg",
        phone: "099 123 456",
        tone: "Urbana, precisa, cerca de todo.",
    },
    {
        id: 2,
        name: "New Brothers Norte",
        address: "Shopping Norte, Local 5",
        image: "/images/branches/sucursal-norte.jpg",
        phone: "098 765 432",
        tone: "Moderna, ágil, ideal para pasar sin desvíos.",
    },
    {
        id: 3,
        name: "New Brothers Beach",
        address: "Rambla Costanera 500",
        image: "/images/branches/sucursal-beach.jpg",
        phone: "091 112 233",
        tone: "Relajada, costera, con la misma precisión NB.",
    },
]

// Rutas de la aplicación
export const ROUTES = {
    HOME: '/',
    RESERVAR: '/reservar',
    TIENDA: '/tienda',
    LOOKBOOK: '/lookbook',
    CONTACTO: '/contacto',
    LOGIN: '/login',
    REGISTER: '/register',
    MI_CUENTA: '/mi-cuenta',

    // Admin
    ADMIN_DASHBOARD: '/admin/dashboard',
    ADMIN_CITAS: '/admin/citas',
    ADMIN_CLIENTES: '/admin/clientes',
    ADMIN_MENSAJES: '/admin/mensajes',
    ADMIN_PRODUCTOS: '/admin/productos',
    ADMIN_PEDIDOS: '/admin/pedidos',
    ADMIN_POS: '/admin/pos',
    ADMIN_CAJA: '/admin/caja',
    ADMIN_LIQUIDACIONES: '/admin/liquidaciones',
    ADMIN_SUCURSALES: '/admin/sucursales',
    ADMIN_BARBEROS: '/admin/barberos',
    ADMIN_SERVICIOS: '/admin/servicios',
    ADMIN_CONFIGURACION: '/admin/configuracion',
    ADMIN_ASISTENTE: '/admin/asistente',

    // Barbero
    BARBERO_AGENDA: '/barbero/mi-agenda',

    // Auth Admin
    ADMIN_LOGIN: '/admin-login',
} as const

// Días de inactividad para marcar a un cliente
export const INACTIVE_DAYS = 30;
