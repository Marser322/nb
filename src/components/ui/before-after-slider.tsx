"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { MoveHorizontal } from "lucide-react";
import Image from "next/image";

interface BeforeAfterSliderProps {
    beforeImage: string;
    afterImage: string;
    className?: string;
}

export function BeforeAfterSlider({ beforeImage, afterImage, className = "" }: BeforeAfterSliderProps) {
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMove = (event: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
        if (!containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        const clientX = 'touches' in event ? event.touches[0].clientX : (event as React.MouseEvent).clientX;

        const relativeX = clientX - containerRect.left;
        const percentage = (relativeX / containerRect.width) * 100;

        setSliderPosition(Math.min(Math.max(percentage, 0), 100));
    };

    const handleMouseDown = () => setIsDragging(true);
    useEffect(() => {
        const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
            if (isDragging) handleMove(e);
        };
        const handleGlobalUp = () => setIsDragging(false);

        window.addEventListener("mousemove", handleGlobalMove);
        window.addEventListener("touchmove", handleGlobalMove);
        window.addEventListener("mouseup", handleGlobalUp);
        window.addEventListener("touchend", handleGlobalUp);

        return () => {
            window.removeEventListener("mousemove", handleGlobalMove);
            window.removeEventListener("touchmove", handleGlobalMove);
            window.removeEventListener("mouseup", handleGlobalUp);
            window.removeEventListener("touchend", handleGlobalUp);
        };
    }, [isDragging]);


    return (
        <div
            ref={containerRef}
            className={`relative w-full aspect-[4/5] md:aspect-square overflow-hidden rounded-2xl cursor-ew-resize select-none group ${className}`}
            onMouseDown={handleMouseDown}
            onTouchStart={handleMouseDown}
        >
            {/* After Image (Background) */}
            <Image
                src={afterImage}
                alt="Resultado después del corte"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                draggable={false}
            />
            <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white z-10 uppercase tracking-widest text-shadow">
                Después
            </div>

            {/* Before Image (Clipped) */}
            <motion.div
                className="absolute top-0 left-0 h-full w-full overflow-hidden"
                style={{ width: `${sliderPosition}%` }}
                transition={{ type: "spring", bounce: 0, duration: 0.1 }}
            >
                <Image
                    src={beforeImage}
                    alt="Antes del corte"
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} // Fix for clipped container
                // NextJS Image fill tries to fill relative parent. 
                // To keep aspect ratio correct when clipped, we need to counter-act the width restriction?
                // Actually, object-cover inside a changing width container distorts if not careful?
                // No, `fill` matches parent. If parent width changes, aspect ratio changes. 
                // FIX: Use a fixed width inner container or different approach.
                />
                {/* Hack: The image needs to stay full width even if container is clipped.
                     Normally done with clip-path or a strictly defined width inner.
                 */}
                <div className="relative w-full h-full">
                    {/* Actually, it's easier to use clip-path on a full-size absolute div */}
                </div>
            </motion.div>

            {/* Better Implementation using Clip Path to avoid image squash */}
            <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
            >
                <Image
                    src={beforeImage}
                    alt="Antes del corte"
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                    draggable={false}
                />
                <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white z-10 uppercase tracking-widest text-shadow">
                    Antes
                </div>
            </div>

            {/* Slider Line */}
            <div
                className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize z-20 shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                style={{ left: `${sliderPosition}%` }}
            >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg transform active:scale-110 transition-transform">
                    <MoveHorizontal className="h-4 w-4 text-primary" />
                </div>
            </div>
        </div>
    );
}
