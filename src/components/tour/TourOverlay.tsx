"use client";

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { TourStep, useTourStore } from '@/lib/store/tour-store';
import { Button } from '@/components/ui/button';
import { ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function TourOverlay() {
    const { isOpen, currentTourKey, steps, currentStepIndex, nextStep, prevStep, closeTour } = useTourStore();
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const prefersReducedMotion = useReducedMotion();
    const currentStep = steps[currentStepIndex];
    // Dirección de navegación, para saltar pasos con target invisible hacia el lado correcto.
    const skipDirection = useRef<1 | -1>(1);
    const handleNext = () => { skipDirection.current = 1; nextStep(); };
    const handlePrev = () => { skipDirection.current = -1; prevStep(); };

    // Re-calculate position on step change, scroll or resize.
    // El spotlight SIGUE al elemento durante y después del scroll suave (antes se leía
    // una sola vez tras un timeout, y quedaba desalineado si el scroll no había terminado).
    useEffect(() => {
        if (!isOpen || !currentStep) return;

        // Todas las actualizaciones de estado quedan dentro de un rAF: el efecto solo
        // suscribe listeners y programa el primer tick, nunca llama setState de forma
        // síncrona en su cuerpo (evita cascading renders / lint set-state-in-effect).
        let rafId = 0;
        let cancelled = false;

        // Paso tipo modal centrado (sin target concreto)
        if (currentStep.target === 'body') {
            rafId = requestAnimationFrame(() => {
                if (!cancelled) setTargetRect(null);
            });
            return () => {
                cancelled = true;
                cancelAnimationFrame(rafId);
            };
        }

        const element = document.querySelector(currentStep.target);

        // Target ausente o no visible en este breakpoint (ej. nav de escritorio oculto en mobile):
        // saltamos al paso vecino con un target real en vez de mostrar un card apuntando a la nada.
        const rect0 = element?.getBoundingClientRect();
        const notVisible = !element || !rect0 || (rect0.width === 0 && rect0.height === 0);
        if (notVisible) {
            rafId = requestAnimationFrame(() => {
                if (cancelled) return;
                if (skipDirection.current >= 0 && currentStepIndex < steps.length - 1) { nextStep(); return; }
                if (skipDirection.current < 0 && currentStepIndex > 0) { prevStep(); return; }
                setTargetRect(null); // sin paso vecino disponible → centrado sin spotlight
            });
            return () => {
                cancelled = true;
                cancelAnimationFrame(rafId);
            };
        }

        const el = element;
        const update = () => {
            const rect = el.getBoundingClientRect();
            // Si el elemento se oculta luego (resize) → sin spotlight fantasma
            setTargetRect(rect.width === 0 && rect.height === 0 ? null : rect);
        };

        // Llevar el elemento al centro y leer su posición en el próximo frame
        el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });

        // Acompañar el scroll suave por ~900ms para que el recuadro termine alineado
        let elapsed = 0;
        const tick = () => {
            if (cancelled) return;
            update();
            elapsed += 16;
            if (elapsed < 900) rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        // Mantener el spotlight pegado al elemento ante cualquier scroll/resize posterior
        window.addEventListener('scroll', update, { passive: true, capture: true });
        window.addEventListener('resize', update);

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
            window.removeEventListener('scroll', update, { capture: true } as EventListenerOptions);
            window.removeEventListener('resize', update);
        };
    }, [isOpen, currentStepIndex, currentStep, steps.length, nextStep, prevStep, prefersReducedMotion]);

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeTour();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [closeTour, isOpen]);

    if (!isOpen || !currentStep) return null;

    // Render Portal
    return createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none">
            {/* 1. Backdrop / Spotlight Effect */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                    "pointer-events-auto absolute inset-0 transition-colors duration-500",
                    // Con target: el padre queda transparente y el oscurecido exterior lo hace
                    // SOLO el box-shadow del spotlight hijo, así el interior del recorte queda
                    // 100% nítido (sin velo ni blur encima del elemento enfocado).
                    // Sin target (pasos centrados tipo modal): se mantiene el velo + blur completos.
                    targetRect ? "bg-transparent" : "bg-background/70 backdrop-blur-[3px]"
                )}
            >
                {targetRect && (
                    <motion.div
                        layoutId="spotlight"
                        initial={false}
                        transition={{ type: "spring", stiffness: 160, damping: 26, mass: 0.9 }}
                        style={{
                            position: 'absolute',
                            top: targetRect.top - 10,
                            left: targetRect.left - 10,
                            width: targetRect.width + 20,
                            height: targetRect.height + 20,
                            borderRadius: '16px',
                            boxShadow: '0 0 0 9999px color-mix(in oklab, var(--background) 85%, transparent), 0 0 44px color-mix(in oklab, var(--primary) 45%, transparent), inset 0 0 0 1px color-mix(in oklab, var(--primary) 30%, transparent)',
                            border: '1px solid color-mix(in oklab, var(--primary) 62%, transparent)',
                            zIndex: 10
                        }}
                    />
                )}
            </motion.div>

            {/* 2. Tooltip Card */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <Tooltip
                    step={currentStep}
                    index={currentStepIndex}
                    total={steps.length}
                    targetRect={targetRect}
                    tourKey={currentTourKey}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onClose={closeTour}
                />
            </div>
        </div>,
        document.body
    );
}

interface TooltipProps {
    step: TourStep;
    index: number;
    total: number;
    targetRect: DOMRect | null;
    tourKey: string | null;
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
}

function Tooltip({ step, index, total, targetRect, tourKey, onNext, onPrev, onClose }: TooltipProps) {
    const router = useRouter();
    const cardRef = useRef<HTMLDivElement>(null);
    const prefersReducedMotion = useReducedMotion();
    const isFinalStep = index === total - 1;
    const progress = ((index + 1) / total) * 100;
    const StepIcon = step.icon;
    const isAdminTour = tourKey?.startsWith('/admin');

    useEffect(() => {
        cardRef.current?.focus();
    }, [index]);

    const finishTour = () => {
        onClose();
        router.push(isAdminTour ? '/admin/dashboard' : '/reservar');
    };

    const handleStepCta = () => {
        if (!step.href) return;
        onClose();
        router.push(step.href);
    };

    let style: CSSProperties = {};
    const SPACING = 20;
    const CARD_WIDTH = 384;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : CARD_WIDTH + 32;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;
    const centerX = targetRect ? targetRect.left + targetRect.width / 2 : viewportWidth / 2;
    const centerY = targetRect ? targetRect.top + targetRect.height / 2 : viewportHeight / 2;
    const clampedCenterX = Math.min(Math.max(centerX, CARD_WIDTH / 2 + 16), viewportWidth - CARD_WIDTH / 2 - 16);
    const clampedCenterY = Math.min(Math.max(centerY, 160), viewportHeight - 160);

    if (targetRect && viewportWidth < 640) {
        style = { position: 'fixed', left: 16, right: 16, bottom: 16, width: 'auto', transform: 'none' };
    } else if (targetRect) {
        if (step.position === 'top') {
            style = { position: 'fixed', top: targetRect.top - SPACING, left: clampedCenterX, transform: 'translate(-50%, -100%)' };
        } else if (step.position === 'bottom') {
            style = { position: 'fixed', top: targetRect.bottom + SPACING, left: clampedCenterX, transform: 'translate(-50%, 0)' };
        } else if (step.position === 'left') {
            style = { position: 'fixed', top: clampedCenterY, left: targetRect.left - SPACING, transform: 'translate(-100%, -50%)' };
        } else if (step.position === 'right') {
            style = { position: 'fixed', top: clampedCenterY, left: targetRect.right + SPACING, transform: 'translate(0, -50%)' };
        } else {
            style = { position: 'fixed', left: clampedCenterX, top: clampedCenterY, transform: 'translate(-50%, -50%)' };
        }
    } else {
        style = { position: 'relative' }; // Centered by parent flex
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                ref={cardRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tour-step-title"
                aria-describedby="tour-step-content"
                tabIndex={-1}
                initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.96, y: prefersReducedMotion ? 0 : 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.98, y: prefersReducedMotion ? 0 : -8 }}
                key={index}
                transition={{ duration: prefersReducedMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-auto absolute z-20 w-full max-w-[min(calc(100vw-2rem),24rem)] outline-none"
                style={style}
            >
                <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/95 p-5 text-card-foreground shadow-2xl shadow-foreground/10 backdrop-blur-xl sm:p-6">
                    <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-transparent via-primary to-transparent opacity-70" />

                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Cerrar tour"
                    >
                        <X size={18} />
                    </button>

                    <div className="mb-5 pr-8">
                        <div className="mb-3 flex items-center gap-3">
                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-primary/25 bg-primary/10 text-primary">
                                {step.image ? (
                                    <span className="relative h-full w-full overflow-hidden rounded-full">
                                        <Image
                                            src={step.image}
                                            alt={step.imageAlt || step.title}
                                            fill
                                            unoptimized
                                            sizes="40px"
                                            className="object-cover"
                                        />
                                    </span>
                                ) : StepIcon ? (
                                    <StepIcon className="h-5 w-5" />
                                ) : isFinalStep ? (
                                    <CheckCircle2 className="h-5 w-5" />
                                ) : (
                                    <Sparkles className="h-5 w-5" />
                                )}
                            </span>
                            <div className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                                    Paso {index + 1} de {total}
                                </span>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                    <motion.div
                                        className="h-full rounded-full bg-primary"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: prefersReducedMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
                                    />
                                </div>
                            </div>
                        </div>
                        <h3 id="tour-step-title" className="text-xl font-bold text-foreground">
                            {step.title}
                        </h3>
                        <p id="tour-step-content" className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {step.content}
                        </p>
                        {isFinalStep && (
                            <p className="mt-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-medium text-foreground">
                                Listo. Ya tenés el mapa para moverte con seguridad por la experiencia NB.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onPrev}
                            disabled={index === 0}
                            className="text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                            Anterior
                        </Button>
                        <Button
                            size="sm"
                            onClick={isFinalStep ? finishTour : onNext}
                            className="rounded-full px-5 font-semibold"
                        >
                            {isFinalStep ? (isAdminTour ? 'Ir al dashboard' : 'Reservá tu primer turno') : 'Siguiente'}
                            <ArrowRight size={16} className="ml-2" />
                        </Button>
                    </div>

                    {step.href && (
                        <Button
                            type="button"
                            onClick={handleStepCta}
                            className="mt-4 w-full rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90"
                        >
                            {step.ctaLabel ?? 'Ir'}
                            <ArrowRight size={16} className="ml-2" />
                        </Button>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
