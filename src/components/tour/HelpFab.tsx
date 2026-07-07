"use client";

import { usePathname } from 'next/navigation';
import { HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTourStore } from '@/lib/store/tour-store';
import { APP_TOURS } from '@/lib/tours-data';
import { Button } from '@/components/ui/button';

export function HelpFab() {
    const pathname = usePathname();
    const { startTour, isOpen } = useTourStore();

    // Determine if there is a tour for the current page
    const tourKey = APP_TOURS[pathname] ? pathname : null;

    if (!tourKey || isOpen) return null; // Don't show if no tour or tour is already open

    return (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="fixed right-4 z-50 sm:right-6"
            style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
        >
            <Button
                onClick={() => startTour(tourKey!, APP_TOURS[tourKey!])}
                size="icon"
                aria-label="Abrir ayuda"
                className="h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-110 hover:bg-primary/90"
            >
                <HelpCircle className="h-6 w-6" aria-hidden="true" />
                <span className="sr-only">Ayuda</span>
            </Button>

            {/* Pulse effect hint */}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-3 w-3 rounded-full bg-primary"></span>
            </span>
        </motion.div>
    );
}
