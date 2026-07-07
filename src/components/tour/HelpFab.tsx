"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HelpCircle, Loader2, LogIn, Mail, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTourStore } from '@/lib/store/tour-store';
import { APP_TOURS } from '@/lib/tours-data';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isDemoMode, useDemoAdminLogin } from '@/hooks/useDemoAdminLogin';
import { ROUTES } from '@/lib/constants';

export function HelpFab() {
    const pathname = usePathname();
    const { startTour, isOpen } = useTourStore();
    const { loginAsDemoAdmin, isDemoLoading } = useDemoAdminLogin();

    // Determine if there is a tour for the current page
    const tourKey = APP_TOURS[pathname] ? pathname : null;
    const isReservedRoute = pathname.startsWith('/admin') || pathname.startsWith('/barbero');
    const shouldShow = !isOpen && !isReservedRoute && (isDemoMode || Boolean(tourKey));

    if (!shouldShow) return null;

    return (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="fixed right-4 z-50 sm:right-6"
            style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        size="icon"
                        aria-label="Abrir ayuda"
                        className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-110 hover:bg-primary/90"
                    >
                        <HelpCircle className="h-6 w-6" aria-hidden="true" />
                        <span className="sr-only">Ayuda</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="end"
                    side="top"
                    sideOffset={12}
                    className="glass-card w-64 border-border/60 bg-card/95 p-2 shadow-2xl shadow-foreground/10"
                >
                    <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Ayuda rápida
                    </DropdownMenuLabel>
                    {tourKey && (
                        <DropdownMenuItem
                            className="cursor-pointer gap-3 rounded-md px-3 py-2"
                            onSelect={() => startTour(tourKey, APP_TOURS[tourKey])}
                        >
                            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                            Ver tour de esta página
                        </DropdownMenuItem>
                    )}
                    {isDemoMode && (
                        <DropdownMenuItem
                            className="cursor-pointer gap-3 rounded-md px-3 py-2"
                            disabled={isDemoLoading}
                            onSelect={() => {
                                void loginAsDemoAdmin();
                            }}
                        >
                            {isDemoLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" />
                            ) : (
                                <LogIn className="h-4 w-4 text-primary" aria-hidden="true" />
                            )}
                            Entrar como Admin demo
                        </DropdownMenuItem>
                    )}
                    {(tourKey || isDemoMode) && <DropdownMenuSeparator className="bg-border/70" />}
                    <DropdownMenuItem asChild className="cursor-pointer gap-3 rounded-md px-3 py-2">
                        <Link href={ROUTES.CONTACTO}>
                            <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
                            Contacto
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Pulse effect hint */}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary"></span>
            </span>
        </motion.div>
    );
}
