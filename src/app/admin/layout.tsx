"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Calendar,
    Contact,
    MessageSquare,
    Package,
    ClipboardList,
    ShoppingCart,
    Wallet,
    LogOut,
    Menu,
    Building2,
    Users,
    Sparkles,
    Settings,
    Bot,
    HelpCircle,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useFeatures } from "@/lib/features";
import type { Permission } from "@/lib/permissions";
import { usePermissions } from "@/lib/usePermissions";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { isDemoMode } from "@/lib/demo";
import { logoutAdmin } from "./actions";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { VisualSkinSelector } from "@/components/admin/VisualSkinSelector";
import { VisualSkinProvider } from "@/components/admin/VisualSkinProvider";
import { useAssistiveHub } from "@/components/assistive/AssistiveHubProvider";
import { useTourStore } from "@/lib/store/tour-store";
import { APP_TOURS } from "@/lib/tours-data";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SidebarGroup = "operacion" | "clientes" | "catalogo" | "equipo" | "sistema";

const SIDEBAR_GROUP_LABELS: Record<SidebarGroup, string> = {
    operacion: "Operación",
    clientes: "Clientes",
    catalogo: "Catálogo",
    equipo: "Equipo",
    sistema: "Sistema",
};

const SIDEBAR_GROUP_ORDER: SidebarGroup[] = ["operacion", "clientes", "catalogo", "equipo", "sistema"];

const sidebarLinks: {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    group: SidebarGroup;
    /** Si se define, el link solo se muestra a quien tenga este permiso (admin siempre lo tiene). */
    permission?: Permission;
}[] = [
    {
        href: ROUTES.ADMIN_DASHBOARD,
        label: "Dashboard",
        icon: LayoutDashboard,
        group: "operacion",
    },
    {
        href: ROUTES.ADMIN_CITAS,
        label: "Citas",
        icon: Calendar,
        group: "operacion",
        permission: "agenda.all",
    },
    {
        href: ROUTES.ADMIN_CLIENTES,
        label: "Clientes",
        icon: Contact,
        group: "clientes",
        permission: "clients.view",
    },
    {
        href: ROUTES.ADMIN_MENSAJES,
        label: "Mensajes",
        icon: MessageSquare,
        group: "clientes",
        permission: "clients.view",
    },
    {
        href: ROUTES.ADMIN_PRODUCTOS,
        label: "Productos",
        icon: Package,
        group: "catalogo",
        permission: "products.manage",
    },
    {
        href: ROUTES.ADMIN_PEDIDOS,
        label: "Pedidos",
        icon: ClipboardList,
        group: "catalogo",
        permission: "products.manage",
    },
    {
        href: ROUTES.ADMIN_POS,
        label: "Punto de venta",
        icon: ShoppingCart,
        group: "operacion",
        permission: "cash.operate",
    },
    {
        href: ROUTES.ADMIN_CAJA,
        label: "Caja",
        icon: Wallet,
        group: "operacion",
        permission: "cash.operate",
    },
    {
        href: ROUTES.ADMIN_LIQUIDACIONES,
        label: "Liquidaciones",
        icon: Wallet,
        group: "operacion",
        permission: "finances.view",
    },
    {
        href: ROUTES.ADMIN_SUCURSALES,
        label: "Sucursales",
        icon: Building2,
        group: "equipo",
        permission: "branches.manage",
    },
    {
        href: ROUTES.ADMIN_BARBEROS,
        label: "Barberos",
        icon: Users,
        group: "equipo",
        permission: "staff.manage",
    },
    {
        href: ROUTES.ADMIN_SERVICIOS,
        label: "Servicios",
        icon: Sparkles,
        group: "catalogo",
        permission: "services.manage",
    },
    {
        href: ROUTES.ADMIN_CONFIGURACION || "/admin/configuracion",
        label: "Configuración",
        icon: Settings,
        group: "sistema",
        permission: "settings.manage",
    },
    {
        href: ROUTES.ADMIN_ASISTENTE,
        label: "Asistente IA",
        icon: Bot,
        group: "sistema",
        permission: "settings.manage",
    },
];

function SidebarContent({ isMobile = false }: { isMobile?: boolean }) {
    const pathname = usePathname();
    const { features } = useFeatures();
    const { can, isLoaded: permissionsLoaded } = usePermissions();

    const handleLogout = async () => {
        try {
            await logoutAdmin();
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    };

    const filteredLinks = sidebarLinks.filter((link) => {
        if (link.href === ROUTES.ADMIN_CAJA && !features.contabilidad) return false;
        if (link.href === ROUTES.ADMIN_LIQUIDACIONES && !features.contabilidad) return false;
        if (link.href === ROUTES.ADMIN_MENSAJES && !features.mensajes_crm) return false;
        if (link.href === ROUTES.ADMIN_PRODUCTOS && !features.tienda) return false;
        if (link.href === ROUTES.ADMIN_PEDIDOS && !features.tienda) return false;
        if (link.href === ROUTES.ADMIN_POS && (!features.tienda || !features.contabilidad)) return false;
        // Gating por permisos (RBAC): mientras no cargó el perfil, no mostramos
        // de más — se revela recién cuando sabemos qué puede ver esta persona.
        if (link.permission && (!permissionsLoaded || !can(link.permission))) return false;
        return true;
    });

    return (
        <div className="flex h-full flex-col">
            {/* Logo */}
            <div className="admin-sidebar-brand border-b border-border/60 p-5">
                <Link href="/" className="flex items-center gap-3">
                    <span className="admin-brand-mark flex h-12 w-12 items-center justify-center rounded-xl">
                        <Image
                            src="/logo-transparent-512.png"
                            alt="NB Barber"
                            width={42}
                            height={42}
                            unoptimized
                            className="h-10 w-10 object-contain"
                        />
                    </span>
                    <div className="min-w-0">
                        <span className="flex items-center gap-2 truncate text-xl font-bold">
                            NB Barber
                            {isDemoMode && (
                                <span className="admin-demo-pill rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider">
                                    DEMO
                                </span>
                            )}
                        </span>
                        <p className="text-xs text-muted-foreground">Centro operativo</p>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto overscroll-contain p-4">
                {(isMobile ? SIDEBAR_GROUP_ORDER : [null]).map((group) => {
                    const groupLinks = group ? filteredLinks.filter((link) => link.group === group) : filteredLinks;
                    if (groupLinks.length === 0) return null;

                    return (
                    <div key={group || "all"} className={cn("space-y-1.5", group && "mb-5 last:mb-0")}>
                    {group && (
                        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {SIDEBAR_GROUP_LABELS[group]}
                        </p>
                    )}
                    {groupLinks.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        id={!isMobile ? `sidebar-${link.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}` : undefined}
                        className={cn(
                            "admin-nav-link flex items-center gap-3 rounded-xl px-4 py-3 transition-colors",
                            pathname === link.href
                                ? "admin-nav-link-active"
                                : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                        )}
                    >
                        <link.icon className="h-5 w-5" aria-hidden="true" />
                        {link.label}
                    </Link>
                    ))}
                    </div>
                    );
                })}
            </nav>

            {/* Bottom */}
            <div className="space-y-2 border-t border-border/60 p-4">
                <Link
                    href="/"
                    className="admin-nav-link flex items-center gap-3 rounded-xl px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
                >
                    Volver al inicio
                </Link>
                <button
                    onClick={handleLogout}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-4 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
}

function AdminAssistiveMenu() {
    const pathname = usePathname();
    const { setAssistantOpen } = useAssistiveHub();
    const { startTour } = useTourStore();
    const tour = APP_TOURS[pathname];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Abrir ayuda del panel" className="admin-chip">
                    <HelpCircle className="h-4 w-4" aria-hidden="true" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Ayuda del panel</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => setAssistantOpen(true)} className="gap-2">
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    Abrir Coach de Gestión
                </DropdownMenuItem>
                {tour && (
                    <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => startTour(pathname, tour)} className="gap-2">
                            <Sparkles className="h-4 w-4" aria-hidden="true" />
                            Recorrer esta sección
                        </DropdownMenuItem>
                    </>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <VisualSkinProvider>
            <div className="admin-shell min-h-screen bg-background text-foreground">
                {/* Topbar / Header */}
                <header className="admin-topbar fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-border/70 px-4 backdrop-blur-xl md:left-72 md:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <Sheet>
                            <SheetTrigger asChild className="md:hidden">
                                <Button variant="ghost" size="icon" aria-label="Abrir menú admin">
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="admin-mobile-sheet w-72 p-0" aria-describedby={undefined}>
                                <SheetTitle className="sr-only">Menú de navegación admin</SheetTitle>
                                <SidebarContent isMobile={true} />
                            </SheetContent>
                        </Sheet>
                        <div className="min-w-0">
                            <span className="block truncate font-semibold text-foreground">NB Barber Admin</span>
                            <span className="hidden text-xs text-muted-foreground sm:block">
                                Agenda, caja y fidelización en tiempo real
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <AdminAssistiveMenu />
                        <VisualSkinSelector />
                        <ThemeToggle />
                    </div>
                </header>

                {/* Desktop Sidebar */}
                <aside className="admin-sidebar fixed bottom-0 left-0 top-0 z-50 hidden w-72 flex-col border-r border-border/70 md:flex">
                    <SidebarContent />
                </aside>

                {/* Main Content */}
                <main className="admin-main min-h-screen pt-16 md:ml-72">
                    <div className="admin-main-inner p-4 md:p-6 2xl:p-7">{children}</div>
                </main>
                <WelcomeModal role="admin" />
            </div>
        </VisualSkinProvider>
    );
}
