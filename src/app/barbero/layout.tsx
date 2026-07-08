"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Calendar, Scissors, LogOut, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { resolveBarberSession } from "@/lib/barber-session";

const sidebarLinks = [
    {
        href: ROUTES.BARBERO_AGENDA,
        label: "Mi Agenda",
        icon: Calendar,
    },
];

export default function BarberoLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [barberName, setBarberName] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        resolveBarberSession(supabase).then((session) => {
            if (active && session.status === "ok") {
                setBarberName(session.barberName);
            }
        });
        return () => {
            active = false;
        };
    }, [supabase]);

    const handleSignOut = useCallback(async () => {
        await supabase.auth.signOut();
        router.replace("/");
    }, [supabase, router]);

    return (
        <div className="min-h-screen bg-background">
            {/* Header Mobile */}
            <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-background border-b border-border h-16 flex items-center justify-between px-4">
                <Link href="/" className="flex items-center gap-2">
                    <Scissors className="h-6 w-6 text-primary" />
                    <span className="font-bold">NB Barber</span>
                </Link>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/" aria-label="Volver al inicio">
                            <User className="h-5 w-5" />
                        </Link>
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Cerrar sesión"
                        onClick={handleSignOut}
                    >
                        <LogOut className="h-5 w-5" />
                    </Button>
                </div>
            </header>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 border-r border-border bg-card flex-col">
                {/* Logo */}
                <div className="p-6 border-b border-border">
                    <Link href="/" className="flex items-center gap-2">
                        <Scissors className="h-8 w-8 text-primary" />
                        <div>
                            <span className="text-xl font-bold">NB Barber</span>
                            <p className="text-xs text-muted-foreground">Panel Barbero</p>
                        </div>
                    </Link>
                </div>

                {/* User Info */}
                <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <p className="font-medium text-sm">{barberName || "Barbero"}</p>
                            <p className="text-xs text-muted-foreground">En servicio</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-2">
                    {sidebarLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
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
                <div className="p-4 border-t border-border space-y-1">
                    <Link
                        href="/"
                        className="flex items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-primary/5 hover:text-foreground transition-colors"
                    >
                        <User className="h-5 w-5" />
                        Volver al inicio
                    </Link>
                    <button
                        onClick={handleSignOut}
                        className="flex w-full items-center gap-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                        <LogOut className="h-5 w-5" />
                        Cerrar sesión
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="md:ml-64 pt-16 md:pt-0 min-h-screen">
                <div className="p-6 md:p-8">{children}</div>
            </main>
        </div>
    );
}
