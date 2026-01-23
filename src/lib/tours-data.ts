import { TourStep } from "./store/tour-store";

export const APP_TOURS: Record<string, TourStep[]> = {
    '/': [
        {
            target: 'body', // Fallback/Global
            title: 'Bienvenido a NB Barber',
            content: 'Descubre la nueva experiencia digital de tu barbería favorita. Te guiaremos brevemente por las funcionalidades clave.',
            position: 'center'
        },
        {
            target: '#nav-reservar', // Necesitaremos agregar estos IDs
            title: 'Reserva tu Turno',
            content: 'Agenda tu cita en segundos. Elige sucursal, barbero y horario. ¡Sin esperas!',
            position: 'bottom'
        },
        {
            target: '#nav-tienda',
            title: 'Tienda Oficial',
            content: 'Encuentra los mejores productos para el cuidado de tu barba y cabello. Envíos a todo el país.',
            position: 'bottom'
        },
        {
            target: '#hero-cta',
            title: 'Comienza Ahora',
            content: '¿Listo para tu cambio de look? Haz click aquí para empezar.',
            position: 'top'
        }
    ],
    '/admin/dashboard': [
        {
            target: 'body',
            title: 'Panel Administrativo',
            content: 'Aquí tienes el control total de tu negocio. Repasemos las secciones principales.',
            position: 'center'
        },
        {
            target: '#admin-stats',
            title: 'Métricas en Tiempo Real',
            content: 'Visualiza ingresos, citas del día y productos vendidos de un vistazo.',
            position: 'bottom'
        },
        {
            target: '#sidebar-citas',
            title: 'Gestión de Agenda',
            content: 'Administra todas las reservas. Crea citas manuales, cancela o marca como completadas.',
            position: 'right'
        },
        {
            target: '#sidebar-caja',
            title: 'Caja Registradora',
            content: 'Control de flujo de caja. Registra ingresos y egresos, y ve el desglose por método de pago.',
            position: 'right'
        }
    ]
};
