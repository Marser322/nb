"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { ArrowRight, ArrowLeft, Plus, Star } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatPrice } from "@/lib/utils";
import { FEATURED_PRODUCT_IDS } from "@/lib/static-data";
import type { Product } from "@/types/database.types";

type FeaturedProductsCarouselProps = {
    products: Product[];
    onAddToCart: (product: Product) => void;
    onSelectCategory: (category: string) => void;
};

export function FeaturedProductsCarousel({
    products,
    onAddToCart,
    onSelectCategory,
}: FeaturedProductsCarouselProps) {
    const featuredProducts = useMemo(() => {
        const featured = FEATURED_PRODUCT_IDS
            .map((id) => products.find((product) => product.id === id))
            .filter((product): product is Product => Boolean(product));

        return featured.length > 0 ? featured : products.slice(0, 3);
    }, [products]);

    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (featuredProducts.length <= 1) return;

        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % featuredProducts.length);
        }, 6500);

        return () => clearInterval(timer);
    }, [featuredProducts.length]);

    if (featuredProducts.length === 0) return null;

    const safeIndex = Math.min(currentIndex, featuredProducts.length - 1);
    const currentProduct = featuredProducts[safeIndex];
    const canBuy = currentProduct.stock > 0;

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev === 0 ? featuredProducts.length - 1 : prev - 1));
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % featuredProducts.length);
    };

    return (
        <div className="relative h-[440px] md:h-[520px] w-full overflow-hidden rounded-2xl mb-12 group border border-white/10 bg-black shadow-2xl">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentProduct.id}
                    initial={{ scale: 1.08, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0"
                >
                    <ImageWithFallback
                        src={currentProduct.image_url}
                        alt={currentProduct.name}
                        fill
                        sizes="100vw"
                        className="object-cover"
                        fallbackClassName="h-full w-full bg-zinc-950"
                        priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/20" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30" />
                </motion.div>
            </AnimatePresence>

            <div className="absolute inset-0 z-10 flex flex-col justify-center px-6 md:px-16 max-w-2xl">
                <motion.div
                    key={`text-${currentProduct.id}`}
                    initial={{ x: -24, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.15, duration: 0.5 }}
                >
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-primary backdrop-blur-md">
                        <Star className="h-3.5 w-3.5 fill-primary" />
                        {currentProduct.category}
                    </div>
                    <p className="mb-3 font-display text-sm uppercase tracking-[0.25em] text-zinc-300">
                        Selección NB
                    </p>
                    <h2 className="font-display text-4xl md:text-7xl font-bold uppercase leading-none text-white">
                        {currentProduct.name}
                    </h2>
                    <p className="mt-6 max-w-xl text-base md:text-lg leading-relaxed text-zinc-300">
                        {currentProduct.description}
                    </p>
                    <div className="mt-7 flex items-center gap-4">
                        <span className="text-3xl font-bold text-primary">
                            {formatPrice(currentProduct.price)}
                        </span>
                        {!canBuy && (
                            <span className="rounded-full border border-red-500/30 bg-red-500/15 px-3 py-1 text-xs font-bold text-red-300">
                                Agotado
                            </span>
                        )}
                    </div>
                    <div className="mt-8 flex flex-col sm:flex-row gap-3">
                        <Button
                            size="lg"
                            className="h-12 rounded-full px-7 font-bold"
                            onClick={() => onAddToCart(currentProduct)}
                            disabled={!canBuy}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Agregar al carrito
                        </Button>
                        <Button
                            size="lg"
                            variant="outline"
                            className="h-12 rounded-full border-white/15 bg-white/5 px-7 text-white hover:bg-white/10"
                            onClick={() => onSelectCategory(currentProduct.category)}
                        >
                            Ver {currentProduct.category}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </div>
                </motion.div>
            </div>

            {featuredProducts.length > 1 && (
                <>
                    <div className="absolute inset-y-0 left-4 z-20 hidden items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 md:flex">
                        <button
                            onClick={handlePrev}
                            aria-label="Producto anterior"
                            className="rounded-full border border-white/10 bg-black/40 p-3 text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/70"
                        >
                            <ArrowLeft className="h-6 w-6" />
                        </button>
                    </div>
                    <div className="absolute inset-y-0 right-4 z-20 hidden items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100 md:flex">
                        <button
                            onClick={handleNext}
                            aria-label="Producto siguiente"
                            className="rounded-full border border-white/10 bg-black/40 p-3 text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/70"
                        >
                            <ArrowRight className="h-6 w-6" />
                        </button>
                    </div>

                    <div className="absolute bottom-7 left-1/2 z-20 flex -translate-x-1/2 gap-3">
                        {featuredProducts.map((product, idx) => (
                            <button
                                key={product.id}
                                aria-label={`Ver ${product.name}`}
                                onClick={() => setCurrentIndex(idx)}
                                className={`rounded-full transition-all duration-300 ${idx === safeIndex
                                    ? "h-2.5 w-10 bg-primary"
                                    : "h-2.5 w-2.5 bg-white/40 hover:bg-white/70"
                                    }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
