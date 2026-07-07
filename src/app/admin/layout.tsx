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
} from "lucide-react";
import { useFeatures } from "@/lib/features";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { logoutAdmin } from "./actions";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";

const sidebarLinks = [
    {
        href: ROUTES.ADMIN_DASHBOARD,
        label: "Dashboard",
        icon: LayoutDashboard,
    },
    {
        href: ROUTES.ADMIN_CITAS,
        label: "Citas",
        icon: Calendar,
    },
    {
        href: ROUTES.ADMIN_CLIENTES,
        label: "Clientes",
        icon: Contact,
    },
    {
        href: ROUTES.ADMIN_MENSAJES,
        label: "Mensajes",
        icon: MessageSquare,
    },
    {
        href: ROUTES.ADMIN_PRODUCTOS,
        label: "Productos",
        icon: Package,
    },
    {
        href: ROUTES.ADMIN_PEDIDOS,
        label: "Pedidos",
        icon: ClipboardList,
    },
    {
        href: ROUTES.ADMIN_POS,
        label: "Punto de venta",
        icon: ShoppingCart,
    },
    {
        href: ROUTES.ADMIN_CAJA,
        label: "Caja",
        icon: Wallet,
    },
    {
        href: ROUTES.ADMIN_LIQUIDACIONES,
        label: "Liquidaciones",
        icon: Wallet,
    },
    {
        href: ROUTES.ADMIN_SUCURSALES,
        label: "Sucursales",
        icon: Building2,
    },
    {
        href: ROUTES.ADMIN_BARBEROS,
        label: "Barberos",
        icon: Users,
    },
    {
        href: ROUTES.ADMIN_SERVICIOS,
        label: "Servicios",
        icon: Sparkles,
    },
    {
        href: ROUTES.ADMIN_CONFIGURACION || "/admin/configuracion",
        label: "Configuración",
        icon: Settings,
    },
];

function SidebarContent({ isMobile = false }: { isMobile?: boolean }) {
    const pathname = usePathname();
    const { features } = useFeatures();

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
        return true;
    });

    return (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="p-6 border-b border-border">
                <Link href="/" className="flex items-center gap-3">
                    <Image
                        src="/logo.png"
                        alt="NB Barber"
                        width={40}
                        height={40}
                        className="h-10 w-10 object-contain"
                    />
                    <div>
                        <span className="text-xl font-bold flex items-center gap-2">
                            NB Barber
                            {process.env.NEXT_PUBLIC_DEMO_MODE === 'true' && (
                                <span className="text-[10px] font-semibold tracking-wider text-amber-500 border border-amber-500/40 rounded px-1.5 py-0.5">
                                    DEMO
                                </span>
                            )}
                        </span>
                        <p className="text-xs text-muted-foreground">Panel Admin</p>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
                {filteredLinks.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        id={!isMobile ? `sidebar-${link.label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}` : undefined}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                            pathname === link.href
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-primary/5 hover:text-foreground"
                        )}
                    >
                        <link.icon className="h-5 w-5" />
                        {link.label}
                    </Link>
                ))}
            </nav>

            {/* Bottom */}
            <div className="p-4 border-t border-border space-y-2">
                <Link
                    href="/"
                    className="flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-primary/5 hover:text-foreground transition-colors"
                >
                    Volver al inicio
                </Link>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer text-left"
                >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                </button>
            </div>
        </div>
    );
}

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background">
            {/* Topbar / Header */}
            <header className="fixed top-0 right-0 left-0 md:left-64 z-40 bg-background/80 backdrop-blur-md border-b border-border h-16 flex items-center justify-between px-4 md:px-6">
                <div className="flex items-center gap-3">
                    <Sheet>
                        <SheetTrigger asChild className="md:hidden">
                            <Button variant="ghost" size="icon" aria-label="Abrir menú admin">
                                <Menu className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="p-0 w-64">
                            <SidebarContent isMobile={true} />
                        </SheetContent>
                    </Sheet>
                    <span className="font-semibold text-foreground">NB Barber Admin</span>
                </div>
                <div className="flex items-center gap-2" />
            </header>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-border bg-card flex-col z-50">
                <SidebarContent />
            </aside>

            {/* Main Content */}
            <main className="md:ml-64 pt-16 min-h-screen">
                <div className="p-6 md:p-8">{children}</div>
            </main>
            <WelcomeModal role="admin" />
        </div>
    );
}
