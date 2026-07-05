"use client";
import { motion } from "framer-motion";
import { useState } from "react";
import { Camera, Instagram, Hash, Star, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Header, Footer } from "@/components/layout";
import type { Lookbook } from "@/types/database.types";
import Link from "next/link";
import Image from "next/image";
import { ROUTES } from "@/lib/constants";
import { STATIC_STYLES, getServiceIdForStyle } from "@/lib/static-data";

export default function LookbookPage() {
    const styles: Lookbook[] = STATIC_STYLES;
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const isLoading = false;

    // Obtener todos los tags únicos
    const allTags = [...new Set(styles.flatMap((s) => s.tags || []))];

    // Filtrar por tag
    const filteredStyles = selectedTag
        ? styles.filter((s) => s.tags?.includes(selectedTag))
        : styles;

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="pb-24">
                {/* Hero Section */}
                {/* Hero Section */}
                <div className="relative h-[45vh] min-h-[400px] flex items-center justify-center overflow-hidden mb-16">
                    {/* Background Overlay - Consistent with Home */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/95 via-black/80 to-background z-0" />
                    <div className="absolute inset-0 bg-noise opacity-30 mix-blend-overlay z-0" />

                    {/* Floating Images Composition - Symmetrical & Clean */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                        {/* Left Column */}
                        <div className="absolute top-0 left-0 bottom-0 w-[15%] md:w-[25%] flex flex-col justify-center py-10 pl-4 md:pl-10">
                            <motion.div
                                animate={{ y: [0, -15, 0] }}
                                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                                className="relative w-24 h-24 md:w-32 md:h-32 opacity-25"
                            >
                                <Image src="/images/features/producto-textura.jpg" alt="Corte Style" fill className="object-cover rounded-3xl" />
                            </motion.div>
                        </div>

                        {/* Right Column */}
                        <div className="absolute top-0 right-0 bottom-0 w-[15%] md:w-[25%] flex flex-col justify-center py-10 pr-4 md:pr-10 items-end">
                            <motion.div
                                animate={{ y: [0, 20, 0] }}
                                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                                className="relative w-20 h-20 md:w-28 md:h-28 opacity-20"
                            >
                                <Image src="/images/hero/tijera-detalle.jpg" alt="Scissor" fill className="object-cover rounded-full grayscale" />
                            </motion.div>
                        </div>
                    </div>

                    <motion.div
                        className="relative z-10 text-center px-4 pt-20"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <Badge className="mb-4 bg-primary/20 text-primary hover:bg-primary/30 border-primary/20 backdrop-blur-sm px-4 py-1.5 text-sm">
                            Galería de Estilos
                        </Badge>
                        <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">
                            Nuestro <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">Lookbook</span>
                        </h1>
                        <p className="text-xl text-gray-300 max-w-2xl mx-auto font-light leading-relaxed">
                            Inspiración para tu próximo corte. Calidad que habla por sí sola.
                        </p>
                    </motion.div>
                </div>

                <div className="container mx-auto px-4">
                    {/* Tags Filter */}
                    {allTags.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-3 mb-16">
                            <Button
                                variant={selectedTag === null ? "default" : "outline"}
                                onClick={() => setSelectedTag(null)}
                                className={`rounded-full px-6 h-10 transition-all ${selectedTag === null
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
                                    : "border-white/10 hover:border-primary/50 bg-white/5 text-muted-foreground hover:text-primary"
                                    }`}
                            >
                                Todos
                            </Button>
                            {allTags.map((tag) => (
                                <Button
                                    key={tag}
                                    variant={selectedTag === tag ? "default" : "outline"}
                                    onClick={() => setSelectedTag(tag)}
                                    className={`rounded-full px-6 h-10 transition-all ${selectedTag === tag
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
                                        : "border-white/10 hover:border-primary/50 bg-white/5 text-muted-foreground hover:text-primary"
                                        }`}
                                >
                                    <Hash className="h-3 w-3 mr-1 opacity-70" />
                                    {tag}
                                </Button>
                            ))}
                        </div>
                    )}

                    {/* Gallery - Masonry Layout using Columns */}
                    {isLoading ? (
                        <div className="columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6">
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="aspect-[3/4] bg-white/5 rounded-2xl animate-pulse break-inside-avoid border border-white/5" />
                            ))}
                        </div>
                    ) : filteredStyles.length === 0 ? (
                        <div className="text-center py-24 bg-white/5 rounded-3xl border border-white/10">
                            <div className="h-20 w-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Camera className="h-10 w-10 text-muted-foreground/50" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Aún no hay estilos</h3>
                            <p className="text-muted-foreground mb-8 text-lg">
                                Estamos preparando nuestra galería de cortes.
                            </p>
                            <Button asChild size="lg" className="rounded-full">
                                <Link href={ROUTES.RESERVAR}>
                                    Reservar Turno
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Link>
                            </Button>
                        </div>
                    ) : (
                        <div className="columns-2 md:columns-3 lg:columns-4 gap-6 space-y-6 pb-20">
                            {filteredStyles.map((style) => (
                                <div key={style.id} className="break-inside-avoid relative group">
                                    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-card shadow-lg transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-2xl group-hover:shadow-primary/10">
                                        {style.image_url ? (
                                            <div className="relative">
                                                <Image
                                                    src={style.image_url}
                                                    alt={style.title}
                                                    width={500}
                                                    height={600}
                                                    className="w-full h-auto object-cover"
                                                    sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                            </div>
                                        ) : (
                                            <div className="aspect-square flex items-center justify-center bg-zinc-900">
                                                <Camera className="h-12 w-12 text-zinc-700" />
                                            </div>
                                        )}

                                        {style.is_featured && (
                                            <div className="absolute top-3 left-3 z-20">
                                                <Badge className="bg-amber-500 text-black border-none shadow-lg backdrop-blur-sm font-bold">
                                                    <Star className="h-3 w-3 mr-1 fill-black" />
                                                    Destacado
                                                </Badge>
                                            </div>
                                        )}

                                        <div className="absolute bottom-0 left-0 right-0 p-5 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 z-20 bg-gradient-to-t from-black via-black/80 to-transparent">
                                            <h3 className="font-bold text-lg text-white mb-2 leading-tight">{style.title}</h3>

                                            {style.tags && (
                                                <div className="flex flex-wrap gap-1 mb-3">
                                                    {style.tags.slice(0, 3).map(tag => (
                                                        <span key={tag} className="text-[10px] uppercase tracking-wider bg-white/20 text-white px-2 py-1 rounded-sm backdrop-blur-md">
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                            {getServiceIdForStyle(style.id) && (
                                                <Button asChild size="sm" className="w-full mt-3 rounded-full bg-primary hover:bg-primary/90 text-black font-bold text-xs h-8">
                                                    <Link href={`/reservar?styleId=${style.id}&serviceId=${getServiceIdForStyle(style.id)}`}>
                                                        Reservar Estilo
                                                        <ArrowRight className="ml-1.5 h-3 w-3" />
                                                    </Link>
                                                </Button>
                                            )}

                                            {style.instagram_url && (
                                                <a
                                                    href={style.instagram_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center justify-center text-[10px] text-amber-400 font-bold hover:text-amber-300 uppercase tracking-widest mt-3 transition-colors"
                                                >
                                                    <Instagram className="h-3 w-3 mr-1" />
                                                    Ver en Instagram
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* CTA Footer */}
                    <div className="relative rounded-3xl overflow-hidden border border-white/10 p-8 md:p-16 text-center">
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent -z-10" />
                        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent -z-10" />

                        <h2 className="text-3xl md:text-4xl font-bold mb-4">
                            ¿Listo para renovar tu imagen?
                        </h2>
                        <p className="text-muted-foreground mb-8 text-lg max-w-xl mx-auto">
                            Nuestros profesionales están listos para lograr el estilo que buscás.
                            Traenos tu referencia o dejate asesorar.
                        </p>
                        <Button size="lg" asChild className="h-12 px-8 rounded-full shadow-xl shadow-primary/20 text-lg">
                            <Link href={ROUTES.RESERVAR}>
                                Reservar Cita Ahora
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
