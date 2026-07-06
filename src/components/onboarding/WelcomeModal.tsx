"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogDescription,
    DialogOverlay,
    DialogPortal,
    DialogTitle,
} from "@/components/ui/dialog";
import { APP_TOURS } from "@/lib/tours-data";
import { useTourStore, type TourStep } from "@/lib/store/tour-store";
import { cn } from "@/lib/utils";

type WelcomeRole = "cliente" | "admin";

interface WelcomeModalProps {
    role: WelcomeRole;
}

const WELCOME_CONTENT: Record<
    WelcomeRole,
    {
        storageKey: string;
        image: string;
        imageAlt: string;
        eyebrow: string;
        title: string;
        description: string;
        bullets: string[];
        tourCta: string;
        exploreCta: string;
        fallbackTour: TourStep[];
    }
> = {
    cliente: {
        storageKey: "nb-welcome-cliente",
        image: "/images/onboarding/welcome-cliente.webp",
        imageAlt: "Cliente entrando a una experiencia premium en New Brothers",
        eyebrow: "Experiencia NB",
        title: "Bienvenido a New Brothers - tu mejor versión empieza acá",
        description: "Reservas, productos y referencias de estilo en una experiencia pensada para llegar, elegir y salir impecable.",
        bullets: ["Reservá en segundos", "Elegí tu barbero", "Tu estilo guardado"],
        tourCta: "Hacer el tour",
        exploreCta: "Explorar",
        fallbackTour: [
            {
                target: "body",
                title: "Tu experiencia New Brothers",
                content: "Desde acá podés reservar, explorar productos y guardar referencias para tu próxima visita.",
                position: "center",
                icon: Sparkles,
            },
        ],
    },
    admin: {
        storageKey: "nb-welcome-admin",
        image: "/images/onboarding/welcome-admin.webp",
        imageAlt: "Panel premium de administración para la barbería New Brothers",
        eyebrow: "Centro de mando",
        title: "Bienvenido a tu centro de mando",
        description: "Todo el pulso de la barbería en una interfaz clara: agenda, caja, clientes y módulos listos para operar.",
        bullets: ["Agenda y caja en vivo", "Clientes y fidelización", "Módulos configurables"],
        tourCta: "Recorrer el panel",
        exploreCta: "Empezar",
        fallbackTour: [
            {
                target: "body",
                title: "Tu centro de mando",
                content: "Desde el panel administrás la agenda, el inventario, la caja y las herramientas de fidelización.",
                position: "center",
                icon: Sparkles,
            },
        ],
    },
};

export function WelcomeModal({ role }: WelcomeModalProps) {
    const pathname = usePathname();
    const prefersReducedMotion = useReducedMotion();
    const [isOpen, setIsOpen] = useState(false);
    const { startTour } = useTourStore();
    const content = WELCOME_CONTENT[role];

    const stepsForCurrentRoute = useMemo(
        () => APP_TOURS[pathname] ?? content.fallbackTour,
        [content.fallbackTour, pathname]
    );

    useEffect(() => {
        let shouldShow = false;

        try {
            shouldShow = localStorage.getItem(content.storageKey) !== "seen";
        } catch {
            shouldShow = true;
        }

        if (!shouldShow) return;

        const timeoutId = window.setTimeout(() => setIsOpen(true), 0);
        return () => window.clearTimeout(timeoutId);
    }, [content.storageKey]);

    const rememberAndClose = () => {
        try {
            localStorage.setItem(content.storageKey, "seen");
        } catch {
            // Ignore storage failures; the modal should still be dismissible.
        }
        setIsOpen(false);
    };

    const handleOpenChange = (open: boolean) => {
        if (!open) {
            rememberAndClose();
        }
    };

    const handleStartTour = () => {
        rememberAndClose();
        window.setTimeout(() => {
            startTour(pathname, stepsForCurrentRoute);
        }, 180);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogPortal forceMount>
                <AnimatePresence>
                    {isOpen && (
                        <>
                            <DialogOverlay asChild forceMount>
                                <motion.div
                                    className="fixed inset-0 z-50 bg-background/75 backdrop-blur-xl"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: prefersReducedMotion ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
                                />
                            </DialogOverlay>
                            <DialogPrimitive.Content asChild forceMount>
                                <motion.div
                                    className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl shadow-foreground/10 outline-none"
                                    initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 18 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.98, y: prefersReducedMotion ? 0 : 12 }}
                                    transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
                                >
                                    <div className="grid max-h-[90vh] overflow-y-auto md:grid-cols-[0.96fr_1.04fr]">
                                        <div className="relative min-h-[220px] overflow-hidden bg-muted md:min-h-full">
                                            <Image
                                                src={content.image}
                                                alt={content.imageAlt}
                                                fill
                                                priority
                                                unoptimized
                                                sizes="(max-width: 768px) 100vw, 42vw"
                                                className="object-cover"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/15 to-transparent md:bg-gradient-to-r" />
                                            <div className="absolute inset-x-5 bottom-5 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
                                        </div>

                                        <div className="relative p-6 sm:p-8">
                                            <DialogPrimitive.Close asChild>
                                                <button
                                                    type="button"
                                                    className="absolute right-4 top-4 rounded-full border border-border bg-background/70 p-2 text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                                    aria-label="Cerrar bienvenida"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </DialogPrimitive.Close>

                                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                                <Sparkles className="h-3.5 w-3.5" />
                                                {content.eyebrow}
                                            </div>

                                            <DialogTitle className="pr-10 font-display text-3xl font-bold leading-tight text-foreground sm:text-4xl">
                                                {content.title}
                                            </DialogTitle>
                                            <DialogDescription className="mt-3 text-base leading-relaxed text-muted-foreground">
                                                {content.description}
                                            </DialogDescription>

                                            <div className="mt-6 space-y-3">
                                                {content.bullets.map((bullet) => (
                                                    <div key={bullet} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/45 px-4 py-3">
                                                        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                                                        <span className="text-sm font-medium text-foreground">{bullet}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                                <Button className="rounded-full font-semibold" onClick={handleStartTour}>
                                                    {content.tourCta}
                                                </Button>
                                                <Button variant="outline" className="rounded-full" onClick={rememberAndClose}>
                                                    {content.exploreCta}
                                                </Button>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={rememberAndClose}
                                                className={cn(
                                                    "mt-5 text-sm text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline",
                                                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card"
                                                )}
                                            >
                                                No volver a mostrar
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            </DialogPrimitive.Content>
                        </>
                    )}
                </AnimatePresence>
            </DialogPortal>
        </Dialog>
    );
}
