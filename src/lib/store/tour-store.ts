import { create } from 'zustand';
import type { LucideIcon } from 'lucide-react';

export type TourStep = {
    target: string; // CSS selector ID or Class
    title: string;
    content: string;
    position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
    icon?: LucideIcon;
    image?: string;
    imageAlt?: string;
};

export type TourData = {
    [key: string]: TourStep[];
};

interface TourState {
    isOpen: boolean;
    currentTourKey: string | null;
    currentStepIndex: number;
    steps: TourStep[];

    // Actions
    startTour: (tourKey: string, steps: TourStep[]) => void;
    closeTour: () => void;
    nextStep: () => void;
    prevStep: () => void;
}

export const useTourStore = create<TourState>((set, get) => ({
    isOpen: false,
    currentTourKey: null,
    currentStepIndex: 0,
    steps: [],

    startTour: (tourKey, steps) => set({
        isOpen: true,
        currentTourKey: tourKey,
        steps: steps,
        currentStepIndex: 0
    }),

    closeTour: () => set({
        isOpen: false,
        currentTourKey: null,
        steps: [],
        currentStepIndex: 0
    }),

    nextStep: () => {
        const { currentStepIndex, steps } = get();
        if (currentStepIndex < steps.length - 1) {
            set({ currentStepIndex: currentStepIndex + 1 });
        } else {
            // End of tour
            set({ isOpen: false });
        }
    },

    prevStep: () => {
        const { currentStepIndex } = get();
        if (currentStepIndex > 0) {
            set({ currentStepIndex: currentStepIndex - 1 });
        }
    },
}));
