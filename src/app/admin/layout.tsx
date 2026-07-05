"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Calendar,
    Package,
    Wallet,
    Scissors,
    LogOut,
    Menu,
    Building2,
    Users,
    Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

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
        href: ROUTES.ADMIN_PRODUCTOS,
        label: "Productos",
        icon: Package,
    },
    {
        href: ROUTES.ADMIN_CAJA,
        label: "Caja",
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
];

function SidebarContent() {
    const pathname = usePathname();

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
                        <span className="text-xl font-bold">NB Barber</span>
                        <p className="text-xs text-muted-foreground">Panel Admin</p>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2">
                {sidebarLinks.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        id={`sidebar-${link.label.toLowerCase()}`}
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
            <div className="p-4 border-t border-border">
                <Link
                    href="/"
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-primary/5 hover:text-foreground transition-colors"
                >
                    <LogOut className="h-5 w-5" />
                    Volver al inicio
                </Link>
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
            {/* Mobile Header */}
            <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border h-16 flex items-center px-4">
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-64">
                        <SidebarContent />
                    </SheetContent>
                </Sheet>
                <span className="ml-4 font-semibold">NB Barber Admin</span>
            </header>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-border bg-card flex-col">
                <SidebarContent />
            </aside>

            {/* Main Content */}
            <main className="md:ml-64 pt-16 md:pt-0 min-h-screen">
                <div className="p-6 md:p-8">{children}</div>
            </main>
        </div>
    );
}
