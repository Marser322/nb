// Constantes de la aplicación NB Barber

// Configuración del negocio
export const BUSINESS_CONFIG = {
    name: "New Brothers",
    location: "Uruguay",
    phone: "+598 99 123 456",
    email: "contacto@nbbarber.com",
    instagram: "@newbrothers.uy",

    // Horarios de atención (24h format)
    workingHours: {
        start: 9,  // 9:00 AM
        end: 20,   // 8:00 PM
    },

    // Días de trabajo (0 = Domingo, 6 = Sábado)
    workingDays: [1, 2, 3, 4, 5, 6], // Lunes a Sábado

    // Política de cancelaciones (en minutos)
    cancellationWindow: 120, // 2 horas antes

    // Duración del intervalo de tiempo (en minutos)
    timeSlotMinutes: 30,
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

// Métodos de pago
export const PAYMENT_METHODS = {
    EFECTIVO: 'efectivo',
    TRANSFERENCIA: 'transferencia',
    MERCADOPAGO: 'mercadopago',
} as const

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Transferencia',
    mercadopago: 'MercadoPago',
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
        image: "/images/branches/sucursal-central.png",
        phone: "099 123 456",
        tone: "Urbana, precisa, cerca de todo.",
    },
    {
        id: 2,
        name: "New Brothers Norte",
        address: "Shopping Norte, Local 5",
        image: "/images/branches/sucursal-norte.png",
        phone: "098 765 432",
        tone: "Moderna, ágil, ideal para pasar sin desvíos.",
    },
    {
        id: 3,
        name: "New Brothers Beach",
        address: "Rambla Costanera 500",
        image: "/images/branches/sucursal-beach.png",
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
    ADMIN_PRODUCTOS: '/admin/productos',
    ADMIN_CAJA: '/admin/caja',
    ADMIN_SUCURSALES: '/admin/sucursales',
    ADMIN_BARBEROS: '/admin/barberos',
    ADMIN_SERVICIOS: '/admin/servicios',

    // Barbero
    BARBERO_AGENDA: '/barbero/mi-agenda',

    // Auth Admin
    ADMIN_LOGIN: '/admin-login',
} as const
