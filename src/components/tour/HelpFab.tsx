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
    // We check for exact match or partial match for admin
    let tourKey = null;

    if (APP_TOURS[pathname]) {
        tourKey = pathname;
    } else if (pathname.startsWith('/admin') && APP_TOURS['/admin/dashboard']) {
        // For now, generic admin tour if specific one doesn't exist? 
        // Or just only show on dashboard? Let's show dashboard tour on dashboard only for now to be safe.
        if (pathname === '/admin/dashboard') tourKey = '/admin/dashboard';
    }

    if (!tourKey || isOpen) return null; // Don't show if no tour or tour is already open

    return (
        <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="fixed bottom-6 right-6 z-50"
        >
            <Button
                onClick={() => startTour(tourKey!, APP_TOURS[tourKey!])}
                size="icon"
                className="h-12 w-12 rounded-full bg-amber-500 hover:bg-amber-600 text-black shadow-lg shadow-amber-500/20 transition-all hover:scale-110"
            >
                <HelpCircle className="h-6 w-6" />
                <span className="sr-only">Ayuda</span>
            </Button>

            {/* Pulse effect hint */}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
        </motion.div>
    );
}
