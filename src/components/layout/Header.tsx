"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Menu, ShoppingBag, User, LogOut, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ROUTES } from "@/lib/constants";
import { useCartStore } from "@/stores/cartStore";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { toast } from "sonner";
import { useFeatures } from "@/lib/features";
import { ThemeToggle } from "@/components/theme-toggle";

const navLinks = [
    { href: ROUTES.HOME, label: "Inicio" },
    { href: ROUTES.RESERVAR, label: "Reservar", feature: "reservas_online" },
    { href: ROUTES.TIENDA, label: "Tienda", feature: "tienda" },
    { href: ROUTES.LOOKBOOK, label: "Lookbook", feature: "lookbook" },
    { href: ROUTES.CONTACTO, label: "Contacto" },
];

export function Header() {
    const { features } = useFeatures();
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [user, setUser] = useState<SupabaseUser | null>(null);
    const totalItems = useCartStore((state) => state.getTotalItems());
    const openCart = useCartStore((state) => state.openCart);
    const supabase = createClient();
    const router = useRouter();

    const filteredNavLinks = navLinks.filter(
        (link) => !("feature" in link) || features[link.feature as keyof typeof features]
    );

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50);
        };
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Obtener usuario actual
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();

        // Escuchar cambios de autenticación
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                setUser(session?.user ?? null);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        toast.success("Sesión cerrada");
        router.push(ROUTES.HOME);
        router.refresh();
    };

    const getUserInitials = () => {
        if (!user) return "??";
        const name = user.user_metadata?.full_name || user.email || "";
        const parts = name.split(" ");
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled
                ? "bg-background/80 backdrop-blur-lg border-b border-border"
                : "bg-transparent"
                }`}
        >
            <div className="container mx-auto px-4">
                <nav className="flex items-center justify-between h-16 md:h-20">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-3">
                        <Image
                            src="/logo.png"
                            alt="New Brothers Logo"
                            width={48}
                            height={48}
                            className="h-10 w-10 md:h-12 md:w-12 rounded-full border border-border object-cover"
                            priority
                        />
                        <span className="font-display text-xl md:text-2xl font-bold uppercase tracking-normal">
                            NEW <span className="text-primary">BROTHERS</span>
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-8">
                        {filteredNavLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                id={`nav-${link.label.toLowerCase()}`}
                                className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 md:gap-4">
                        <ThemeToggle />
                        {/* Admin Access (Desktop) */}
                        <Button variant="ghost" size="icon" className="hidden md:inline-flex text-muted-foreground hover:text-amber-500" asChild>
                            <Link href={ROUTES.ADMIN_LOGIN} title="Acceso Admin">
                                <Lock className="h-5 w-5" />
                            </Link>
                        </Button>

                        {/* Cart */}
                        {features.tienda && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="relative"
                                id="cart-trigger"
                                onClick={openCart}
                            >
                                <ShoppingBag className="h-5 w-5" />
                                {totalItems > 0 && (
                                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-[10px] font-bold flex items-center justify-center text-primary-foreground">
                                        {totalItems}
                                    </span>
                                )}
                            </Button>
                        )}

                        {/* User Menu */}
                        {user ? (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="rounded-full">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                                {getUserInitials()}
                                            </AvatarFallback>
                                        </Avatar>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <div className="px-2 py-1.5">
                                        <p className="text-sm font-medium truncate">
                                            {user.user_metadata?.full_name || "Usuario"}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {user.email}
                                        </p>
                                    </div>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem asChild>
                                        <Link href={ROUTES.MI_CUENTA}>
                                            <User className="mr-2 h-4 w-4" />
                                            Mi Cuenta
                                        </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={handleLogout} className="text-red-400">
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Cerrar Sesión
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        ) : (
                            <Button variant="ghost" size="icon" asChild>
                                <Link href={ROUTES.LOGIN}>
                                    <User className="h-5 w-5" />
                                </Link>
                            </Button>
                        )}

                        {/* CTA Desktop */}
                        {features.reservas_online && (
                            <Button asChild className="hidden md:inline-flex">
                                <Link href={ROUTES.RESERVAR}>Reservar Turno</Link>
                            </Button>
                        )}

                        {/* Mobile Menu */}
                        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                            <SheetTrigger asChild className="md:hidden">
                                <Button variant="ghost" size="icon">
                                    <Menu className="h-5 w-5" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-[300px] bg-background">
                                <div className="flex items-center justify-between mt-4 pb-4 border-b border-border">
                                    <span className="font-display font-bold uppercase tracking-normal">
                                        NEW <span className="text-primary">BROTHERS</span>
                                    </span>
                                    <ThemeToggle />
                                </div>
                                <div className="flex flex-col gap-6 mt-6">
                                    {user && (
                                        <div className="flex items-center gap-3 pb-4 border-b border-border">
                                            <Avatar className="h-10 w-10">
                                                <AvatarFallback className="bg-primary/20 text-primary">
                                                    {getUserInitials()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="font-medium truncate">
                                                    {user.user_metadata?.full_name || "Usuario"}
                                                </p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {user.email}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {filteredNavLinks.map((link) => (
                                        <Link
                                            key={link.href}
                                            href={link.href}
                                            className="text-lg font-medium hover:text-primary transition-colors"
                                            onClick={() => setIsMobileMenuOpen(false)}
                                        >
                                            {link.label}
                                        </Link>
                                    ))}

                                    {features.reservas_online && (
                                        <Button asChild className="mt-4">
                                            <Link href={ROUTES.RESERVAR}>Reservar Turno</Link>
                                        </Button>
                                    )}

                                    {user ? (
                                        <Button
                                            variant="outline"
                                            onClick={() => {
                                                handleLogout();
                                                setIsMobileMenuOpen(false);
                                            }}
                                            className="text-red-400 border-red-400/30"
                                        >
                                            <LogOut className="mr-2 h-4 w-4" />
                                            Cerrar Sesión
                                        </Button>
                                    ) : (
                                        <Button variant="outline" asChild>
                                            <Link href={ROUTES.LOGIN}>Iniciar Sesión</Link>
                                        </Button>
                                    )}

                                    <div className="border-t border-border pt-4 mt-auto">
                                        <Link
                                            href={ROUTES.ADMIN_LOGIN}
                                            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-amber-500 p-2"
                                            onClick={() => setIsMobileMenuOpen(false)}
                                        >
                                            <Lock className="h-4 w-4" />
                                            Acceso Administrativo
                                        </Link>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </nav>
            </div>
        </header>
    );
}
