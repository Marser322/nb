"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FEATURED_PRODUCTS = [
    {
        id: "banner-1",
        title: "Cera Mate Premium",
        subtitle: "Fijación fuerte, acabado natural. La elección del caballero moderno.",
        image: "/products/matte-clay.png",
        color: "from-black/60 via-black/40 to-transparent", // Darker overlay for better contrast
        badge: "Más Vendido"
    },
    {
        id: "banner-2",
        title: "Beard Elixir",
        subtitle: "Hidratación profunda con notas de sándalo. Tu barba, tu legado.",
        image: "/products/beard-elixir.png",
        color: "from-black/60 via-black/40 to-transparent",
        badge: "Nuevo Ingreso"
    },
    {
        id: "banner-3",
        title: "Classic Pomade",
        subtitle: "Brillo medio y control total. Para estilos clásicos que perduran.",
        image: "/products/classic-pomade.png",
        color: "from-black/60 via-black/40 to-transparent",
        badge: "Edición Limitada"
    }
];

export function FeaturedProductsCarousel() {
    const [currentIndex, setCurrentIndex] = useState(0);

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev === 0 ? FEATURED_PRODUCTS.length - 1 : prev - 1));
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % FEATURED_PRODUCTS.length);
    };

    useEffect(() => {
        const timer = setInterval(() => {
            handleNext();
        }, 6000); // Slower interval for better readability
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="relative h-[500px] w-full overflow-hidden rounded-2xl mb-12 group shadow-2xl">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0"
                >
                    <Image
                        src={FEATURED_PRODUCTS[currentIndex].image}
                        alt={FEATURED_PRODUCTS[currentIndex].title}
                        fill
                        className="object-cover"
                        priority
                    />
                    {/* Gradient Overlay for Text Readability */}
                    <div className={`absolute inset-0 bg-gradient-to-r ${FEATURED_PRODUCTS[currentIndex].color}`} />
                    {/* Additional Bottom/Top Gradients for Depth */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30 opacity-90" />
                </motion.div>
            </AnimatePresence>

            {/* Content */}
            <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 z-10 w-full md:w-2/3">
                <motion.div
                    key={`text-${currentIndex}`}
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                >
                    <div className="flex items-center gap-2 mb-6">
                        <span className="px-4 py-1.5 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/50 text-xs font-bold text-amber-400 uppercase tracking-widest flex items-center gap-2 shadow-lg">
                            <Star className="h-3 w-3 fill-amber-400" />
                            {FEATURED_PRODUCTS[currentIndex].badge}
                        </span>
                    </div>
                    <h2 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight drop-shadow-lg">
                        {FEATURED_PRODUCTS[currentIndex].title}
                    </h2>
                    <p className="text-xl text-gray-200 mb-8 max-w-xl leading-relaxed drop-shadow-md">
                        {FEATURED_PRODUCTS[currentIndex].subtitle}
                    </p>
                    <Button size="lg" className="h-14 px-8 rounded-full bg-white text-black hover:bg-amber-50 hover:scale-105 transition-all duration-300 font-bold text-lg shadow-[0_0_20px_rgba(255,255,255,0.3)] border-none">
                        Ver Oferta
                        <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                </motion.div>
            </div>

            {/* Navigation Arrows */}
            <div className="absolute inset-y-0 left-4 flex items-center z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button
                    onClick={handlePrev}
                    className="p-3 rounded-full bg-black/30 hover:bg-black/60 text-white backdrop-blur-sm border border-white/10 transition-all hover:scale-110"
                >
                    <ArrowLeft className="h-8 w-8" />
                </button>
            </div>
            <div className="absolute inset-y-0 right-4 flex items-center z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <button
                    onClick={handleNext}
                    className="p-3 rounded-full bg-black/30 hover:bg-black/60 text-white backdrop-blur-sm border border-white/10 transition-all hover:scale-110"
                >
                    <ArrowRight className="h-8 w-8" />
                </button>
            </div>

            {/* Pagination Dots */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-20">
                {FEATURED_PRODUCTS.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => setCurrentIndex(idx)}
                        className={`transition-all duration-300 rounded-full shadow-lg ${idx === currentIndex
                            ? "w-10 h-3 bg-amber-500"
                            : "w-3 h-3 bg-white/40 hover:bg-white/70"
                            }`}
                    />
                ))}
            </div>
        </div>
    );
}
