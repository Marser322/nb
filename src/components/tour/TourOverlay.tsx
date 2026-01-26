"use client";

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { TourStep, useTourStore } from '@/lib/store/tour-store';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeft, X } from 'lucide-react';

export function TourOverlay() {
    const { isOpen, steps, currentStepIndex, nextStep, prevStep, closeTour } = useTourStore();
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const currentStep = steps[currentStepIndex];

    // Re-calculate position on step change or resize
    useEffect(() => {
        if (!isOpen || !currentStep) return;

        const findTarget = () => {
            // Special case for centered modal style steps
            if (currentStep.target === 'body') {
                setTargetRect(null);
                return;
            }

            const element = document.querySelector(currentStep.target);
            if (element) {
                // Scroll element into view smoothly
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Wait a bit for scroll to finish then get rect (or resize observer)
                setTimeout(() => {
                    const rect = element.getBoundingClientRect();
                    setTargetRect(rect);
                }, 500);
            } else {
                // Fallback if target not found
                console.warn(`Target ${currentStep.target} not found`);
                setTargetRect(null);
            }
        };

        findTarget();
        window.addEventListener('resize', findTarget);
        return () => window.removeEventListener('resize', findTarget);
    }, [isOpen, currentStepIndex, currentStep]);

    if (!isOpen || !currentStep) return null;

    // Render Portal
    return createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none">
            {/* 1. Backdrop / Spotlight Effect */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-colors duration-500 pointer-events-auto"
            >
                {/* If we have a target, clip it out? Or just use SVG overlay. 
            For simplicity and elegance, just dim background and highlight the card.
            But user asked for "nice effects". Let's do a spotlight using SVG clipPath if possible,
            or just 4 div masks. The simplest robust way is a huge border or box-shadow. */}

                {targetRect && (
                    <motion.div
                        layoutId="spotlight"
                        initial={false}
                        transition={{ type: "spring", stiffness: 200, damping: 30 }}
                        style={{
                            position: 'absolute',
                            top: targetRect.top - 10,
                            left: targetRect.left - 10,
                            width: targetRect.width + 20,
                            height: targetRect.height + 20,
                            borderRadius: '12px',
                            boxShadow: '0 0 0 9999px rgba(0,0,0,0.7), 0 0 30px rgba(251, 191, 36, 0.4)', // Amber glow
                            border: '2px solid rgba(251, 191, 36, 0.5)', // Amber border
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
                    onNext={nextStep}
                    onPrev={prevStep}
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
    onNext: () => void;
    onPrev: () => void;
    onClose: () => void;
}

function Tooltip({ step, index, total, targetRect, onNext, onPrev, onClose }: TooltipProps) {
    // Calculate tooltip position relative to target
    // If targetRect is null (center), we center it.

    let style: React.CSSProperties = {};
    const SPACING = 20;

    if (targetRect) {
        if (step.position === 'top') {
            style = { top: targetRect.top - SPACING, left: targetRect.left + targetRect.width / 2, transform: 'translate(-50%, -100%)' };
        } else if (step.position === 'bottom') {
            style = { top: targetRect.bottom + SPACING, left: targetRect.left + targetRect.width / 2, transform: 'translate(-50%, 0)' };
        } else if (step.position === 'left') {
            style = { top: targetRect.top + targetRect.height / 2, left: targetRect.left - SPACING, transform: 'translate(-100%, -50%)' };
        } else if (step.position === 'right') {
            style = { top: targetRect.top + targetRect.height / 2, left: targetRect.right + SPACING, transform: 'translate(0, -50%)' };
        }
    } else {
        style = { position: 'relative' }; // Centered by parent flex
    }

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            key={index} // Re-animate on step change
            transition={{ type: "spring", duration: 0.5 }}
            className="pointer-events-auto absolute max-w-sm w-full"
            style={targetRect ? style : undefined}
        >
            <div className="bg-zinc-900/90 backdrop-blur-xl border border-amber-500/30 p-6 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden relative">
                {/* Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-50" />

                <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors">
                    <X size={18} />
                </button>

                <div className="mb-4">
                    <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2 block">
                        Paso {index + 1} de {total}
                    </span>
                    <h3 className="text-xl font-bold text-white mb-2">{step.title}</h3>
                    <p className="text-zinc-300 text-sm leading-relaxed">
                        {step.content}
                    </p>
                </div>

                <div className="flex items-center justify-between mt-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onPrev}
                        disabled={index === 0}
                        className="text-zinc-400 hover:text-white hover:bg-white/10"
                    >
                        Anterior
                    </Button>
                    <Button
                        size="sm"
                        onClick={onNext}
                        className="bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-full px-6"
                    >
                        {index === total - 1 ? 'Finalizar' : 'Siguiente'}
                        {index !== total - 1 && <ArrowRight size={16} className="ml-2" />}
                    </Button>
                </div>
            </div>
        </motion.div>
    );
}
