import { TourStep } from "./store/tour-store";
import { ROUTES } from "./constants";
import {
    BadgeDollarSign,
    BarChart3,
    BellRing,
    CalendarCheck,
    CalendarDays,
    Camera,
    CheckCircle2,
    ClipboardList,
    Contact,
    Images,
    LayoutDashboard,
    MapPin,
    MessageSquare,
    Package,
    PlusCircle,
    Scissors,
    Search,
    Settings,
    ShoppingBag,
    ShoppingCart,
    SlidersHorizontal,
    Sparkles,
    UserPlus,
    UserRound,
    UsersRound,
    Wallet,
} from "lucide-react";

export const APP_TOURS: Record<string, TourStep[]> = {
    '/': [
        {
            target: 'body',
            title: 'Bienvenido a NB Barber',
            content: 'Descubrí la nueva experiencia digital de tu barbería favorita. Te guiaremos brevemente por las funcionalidades clave.',
            position: 'center',
            icon: Sparkles
        },
        {
            target: '#nav-reservar',
            title: 'Reserva tu Turno',
            content: 'Agendá tu cita en segundos. Elegí sucursal, barbero y horario. ¡Sin esperas!',
            position: 'bottom',
            icon: CalendarCheck
        },
        {
            target: '#nav-tienda',
            title: 'Tienda Oficial',
            content: 'Encontrá los mejores productos para el cuidado de tu barba y cabello. Retirá en el local o coordiná el envío.',
            position: 'bottom',
            icon: ShoppingBag
        },
        {
            target: '#nav-lookbook',
            title: 'Galería de Estilos (Lookbook)',
            content: 'Explorá cortes reales de nuestros clientes y seleccioná tu favorito como referencia para tu reserva.',
            position: 'bottom',
            icon: Images
        },
        {
            target: '#demo-admin-cta',
            title: 'Panel de gestión (demo)',
            content: 'Detrás de la vidriera hay un CRM completo: agenda, caja, clientes, stock y liquidaciones. Entrá y recorré el panel de administración de demostración.',
            position: 'top',
            icon: LayoutDashboard,
            href: ROUTES.ADMIN_LOGIN,
            ctaLabel: 'Ver el panel'
        },
        {
            target: '#hero-cta',
            title: 'Comenzá Ahora',
            content: '¿Listo para renovar tu look? Hacé clic aquí para iniciar tu proceso de reserva.',
            position: 'top',
            icon: Scissors
        }
    ],
    '/reservar': [
        {
            target: '#booking-wizard-card',
            title: 'Asistente de Reservas',
            content: 'Te damos la bienvenida al asistente de reservas. Te guiaremos paso a paso para agendar tu turno.',
            position: 'center',
            icon: CalendarCheck
        },
        {
            target: '#step-indicator-0',
            title: 'Paso 1: Sucursal',
            content: 'Elegí cuál de nuestras sucursales premium te queda más cómoda para tu visita.',
            position: 'bottom',
            icon: MapPin
        },
        {
            target: '#step-indicator-1',
            title: 'Paso 2: Servicio',
            content: 'Seleccioná el corte, servicio de barba o combo de cuidado que querés realizarte.',
            position: 'bottom',
            icon: Scissors
        },
        {
            target: '#step-indicator-2',
            title: 'Paso 3: Referencia (Lookbook)',
            content: 'Podés elegir opcionalmente una foto del Lookbook para indicarle a tu barbero exactamente qué estilo buscás.',
            position: 'bottom',
            icon: Camera
        },
        {
            target: '#step-indicator-3',
            title: 'Paso 4: Barbero',
            content: 'Elegí a tu barbero preferido de la sucursal o seleccioná "Cualquiera" para ver más horarios disponibles.',
            position: 'bottom',
            icon: UserRound
        },
        {
            target: '#step-indicator-4',
            title: 'Paso 5: Fecha y Hora',
            content: 'Buscá los días y horarios disponibles que mejor se adapten a tu día a día.',
            position: 'bottom',
            icon: CalendarDays
        },
        {
            target: '#step-indicator-5',
            title: 'Paso 6: Confirmación',
            content: 'Revisá el resumen de tu cita y confirmá tu reserva en segundos. ¡Eso es todo!',
            position: 'bottom',
            icon: CheckCircle2
        }
    ],
    '/tienda': [
        {
            target: 'body',
            title: 'Tienda Oficial NB Barber',
            content: 'Adquirí los mejores productos para el mantenimiento de tu cabello y barba en casa.',
            position: 'center',
            icon: ShoppingBag
        },
        {
            target: '#shop-search',
            title: 'Buscador y Filtros',
            content: 'Ingresá palabras clave o filtrá por categorías (ceras, aceites, champús) para encontrar rápidamente lo que buscás.',
            position: 'bottom',
            icon: Search
        },
        {
            target: '#productos',
            title: 'Catálogo de Productos',
            content: 'Aquí verás todos los productos con su precio, descripción y disponibilidad. Agregalos directamente al carrito.',
            position: 'top',
            icon: Package
        },
        {
            target: '#cart-trigger',
            title: 'Carrito de Compras',
            content: 'Visualizá tus productos seleccionados, modificá cantidades y procedé al pago online o retiro en sucursal.',
            position: 'bottom',
            icon: ShoppingCart
        }
    ],
    '/lookbook': [
        {
            target: 'body',
            title: 'Galería de Estilos',
            content: 'Inspirate para tu próximo look con cortes reales realizados por nuestro equipo de barberos.',
            position: 'center',
            icon: Images
        },
        {
            target: '#lookbook-grid',
            title: 'Lookbook Interactivo',
            content: 'Hacé clic en cualquier estilo para ver los detalles. Al seleccionarlo, podés agendar directamente tu reserva usando esa referencia visual.',
            position: 'top',
            icon: Camera
        }
    ],
    '/mi-cuenta': [
        {
            target: 'body',
            title: 'Tu Cuenta Personal',
            content: 'Gestioná toda tu información de perfil, historial de visitas y reservas en un solo lugar.',
            position: 'center',
            icon: UserRound
        },
        {
            target: '#profile-card',
            title: 'Perfil de Usuario',
            content: 'Mantené tus datos de contacto actualizados para recibir avisos y recordatorios de tus citas.',
            position: 'bottom',
            icon: Contact
        },
        {
            target: '#last-experience-card',
            title: 'Última Experiencia (Fidelización)',
            content: 'El sistema recuerda tu último corte. Hacé clic en "Reservar lo mismo" para agendar exactamente el mismo servicio en segundos.',
            position: 'top',
            icon: Sparkles
        },
        {
            target: '#upcoming-reservations-card',
            title: 'Próximas Reservas',
            content: 'Revisá los detalles de tus citas agendadas, barberos asignados o cancelá turnos con hasta 2 horas de anticipación.',
            position: 'top',
            icon: CalendarCheck
        },
        {
            target: '#subscriptions-card',
            title: 'Turnos Fijos Activos',
            content: 'Si contás con una suscripción semanal o turno recurrente fijado con tu barbero, podrás ver y administrar los detalles aquí.',
            position: 'top',
            icon: BellRing
        }
    ],
    '/admin/dashboard': [
        {
            target: 'body',
            title: 'Panel Administrativo CRM',
            content: 'Bienvenido al panel de control de NB Barber. Repasemos las métricas principales y flujos del negocio.',
            position: 'center',
            icon: LayoutDashboard
        },
        {
            target: '#admin-stats',
            title: 'Métricas en Tiempo Real',
            content: 'Visualizá ingresos, cantidad de citas, clientes nuevos, inactivos y alertas de stock bajo al instante.',
            position: 'bottom',
            icon: BarChart3
        },
        {
            target: '#sidebar-citas',
            title: 'Gestión de la Agenda',
            content: 'Controlá todas las citas. Creá reservas manuales para clientes que entran directo al local, reprogramá o marcá como completadas.',
            position: 'right',
            icon: CalendarCheck
        },
        {
            target: '#sidebar-caja',
            title: 'Flujo de Caja',
            content: 'Control de caja registradora. Monitoreá ingresos por servicios e ingresá egresos de caja para compras o gastos.',
            position: 'right',
            icon: Wallet
        },
        {
            target: '#sidebar-configuracion',
            title: 'Configuraciones de la Plataforma',
            content: 'Habilitá o deshabilitá módulos avanzados como e-commerce, reservas online, propinas o turnos fijos.',
            position: 'right',
            icon: Settings
        }
    ],
    '/admin/citas': [
        {
            target: 'body',
            title: 'Gestión de la Agenda',
            content: 'Administrá todas las reservas del día y controlá la disponibilidad de tus barberos.',
            position: 'center',
            icon: CalendarCheck
        },
        {
            target: '#admin-btn-new-appointment',
            title: 'Crear Cita Manual',
            content: 'Registrá clientes walk-in (sin cita previa web) seleccionando sucursal, barbero, servicio y hora.',
            position: 'bottom',
            icon: PlusCircle
        }
    ],
    '/admin/clientes': [
        {
            target: 'body',
            title: 'Maestro de Clientes',
            content: 'Visualizá la base de datos de tus clientes registrados. Analizá su comportamiento, visitas y consumos.',
            position: 'center',
            icon: UsersRound
        },
        {
            target: 'input',
            title: 'Buscador de Clientes',
            content: 'Buscá clientes por su nombre o teléfono de manera ágil.',
            position: 'bottom',
            icon: Search
        }
    ],
    '/admin/barberos': [
        {
            target: 'body',
            title: 'Equipo de Barberos',
            content: 'Administrá el staff, asigná sucursales de trabajo y editá los horarios laborales semanales.',
            position: 'center',
            icon: UsersRound
        },
        {
            target: '#admin-btn-new-barber',
            title: 'Agregar Profesional',
            content: 'Añadí un nuevo barbero a la sucursal, configurá su biografía e incluí su avatar.',
            position: 'bottom',
            icon: UserPlus
        }
    ],
    '/admin/servicios': [
        {
            target: 'body',
            title: 'Menú de Servicios',
            content: 'Definí los cortes de pelo, barba y tratamientos disponibles en tu catálogo.',
            position: 'center',
            icon: Scissors
        },
        {
            target: '#admin-btn-new-service',
            title: 'Añadir Servicio',
            content: 'Creá un nuevo servicio configurando su nombre, precio, duración en minutos e imagen representativa.',
            position: 'bottom',
            icon: PlusCircle
        }
    ],
    '/admin/productos': [
        {
            target: 'body',
            title: 'Control de Inventario',
            content: 'Gestioná el catálogo de productos disponibles en el e-commerce y controlá el stock físico del local.',
            position: 'center',
            icon: Package
        },
        {
            target: '#admin-btn-new-product',
            title: 'Registrar Producto',
            content: 'Agregá un nuevo producto definiendo el precio de venta, categoría, stock inicial y límite para alertas de bajo stock.',
            position: 'bottom',
            icon: PlusCircle
        }
    ],
    '/admin/caja': [
        {
            target: 'body',
            title: 'Movimientos de Caja',
            content: 'Registrá las operaciones diarias de caja registradora, conciliando el dinero en efectivo y digital.',
            position: 'center',
            icon: Wallet
        },
        {
            target: '#admin-btn-register-movement',
            title: 'Ingresos y Egresos Manuales',
            content: 'Registrá gastos del local (insumos, alquiler) o cobros extraordinarios seleccionando la categoría y el medio de pago.',
            position: 'bottom',
            icon: BadgeDollarSign
        }
    ],
    '/admin/liquidaciones': [
        {
            target: 'body',
            title: 'Liquidaciones de Barberos',
            content: 'Calculá el pago neto para cada barbero de acuerdo a su modelo comercial (comisiones por servicios, renta de sillón o híbridos).',
            position: 'center',
            icon: ClipboardList
        },
        {
            target: '#admin-liquidations-form',
            title: 'Cálculo del Período',
            content: 'Seleccioná un barbero y un rango de fechas para previsualizar y confirmar el desglose final de sus ingresos.',
            position: 'bottom',
            icon: CalendarDays
        }
    ],
    '/admin/mensajes': [
        {
            target: 'body',
            title: 'Fidelización y Mensajería CRM',
            content: 'Visualizá el historial de comunicaciones enviadas y configurá recordatorios automáticos para incentivar la vuelta de tus clientes.',
            position: 'center',
            icon: MessageSquare
        },
        {
            target: '#admin-reminders-card',
            title: 'Reglas de Reenganche',
            content: 'Establecé plantillas personalizadas y definí cuántos días de inactividad disparan las propuestas de retorno.',
            position: 'top',
            icon: BellRing
        }
    ],
    '/admin/configuracion': [
        {
            target: 'body',
            title: 'Configuraciones Generales',
            content: 'Gestioná los módulos activos de tu plataforma digital de forma centralizada.',
            position: 'center',
            icon: Settings
        },
        {
            target: '#features-gating-card',
            title: 'Interruptores de Funcionalidades',
            content: 'Habilitá o deshabilitá al instante la tienda e-commerce, reservas online, propinas, contabilidad de caja o el portal de barberos.',
            position: 'top',
            icon: SlidersHorizontal
        }
    ]
};
