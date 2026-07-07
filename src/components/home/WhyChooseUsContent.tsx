"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Star, Clock, Sparkles, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function WhyChooseUsContent() {
    const [activeFeature, setActiveFeature] = useState(0);

    const features = [
        {
            id: 0,
            icon: Star,
            title: "Profesionales Expertos",
            description: "Barberos con años de experiencia y capacitación continua.",
            image: "/images/hero/ambiente-barberia.jpg",
            secondaryImage: "/images/hero/detalle-corte.jpg",
        },
        {
            id: 1,
            icon: Clock,
            title: "Reservas Online",
            description: "Elegí tu horario desde cualquier lugar, sin esperas.",
            image: "/images/features/reservas-online.jpg",
            secondaryImage: "/images/hero/herramientas-barberia.jpg",
        },
        {
            id: 2,
            icon: Sparkles,
            title: "Productos Premium",
            description: "Usamos y vendemos solo productos de la más alta calidad.",
            image: "/images/features/productos-premium.jpg",
            secondaryImage: "/images/features/producto-textura.jpg",
        },
    ];

    return (
        <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                <div className="relative z-10">
                    <h2 className="text-4xl md:text-5xl font-bold mb-8 leading-tight">
                        ¿Por qué elegir
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">New Brothers</span>?
                    </h2>

                    <div className="space-y-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                className={`flex gap-5 group cursor-pointer p-4 rounded-2xl transition-all duration-300 ${activeFeature === index ? "bg-card border border-border" : "hover:bg-card/50 border border-transparent"}`}
                                onMouseEnter={() => setActiveFeature(index)}
                                whileHover={{ scale: 1.02, x: 10 }}
                            >
                                <div className={`h-14 w-14 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${activeFeature === index ? "border-primary bg-primary/20" : "border-border bg-card group-hover:border-primary/50"}`}>
                                    <feature.icon className={`h-6 w-6 transition-colors ${activeFeature === index ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                                </div>
                                <div>
                                    <h4 className={`text-xl font-bold mb-2 transition-colors ${activeFeature === index ? "text-primary" : "text-foreground group-hover:text-primary"}`}>
                                        {feature.title}
                                    </h4>
                                    <p className="text-muted-foreground leading-relaxed">
                                        {feature.description}
                                    </p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>

                <div className="relative h-[500px] lg:h-[600px] flex items-center justify-center">
                    <div className="absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

                    {/* Main Image with AnimatePresence */}
                    <div className="relative w-full h-full max-w-md mx-auto">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeFeature}
                                initial={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
                                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                                exit={{ opacity: 0, scale: 1.05, filter: "blur(10px)" }}
                                transition={{ duration: 0.5 }}
                                className="relative w-full h-full z-10"
                            >
                                <Image
                                    src={features[activeFeature].image}
                                    alt={features[activeFeature].title}
                                    fill
                                    sizes="(max-width: 1024px) 100vw, 50vw"
                                    className="object-cover rounded-[2rem] shadow-2xl border border-border"
                                />
                            </motion.div>
                        </AnimatePresence>

                        {/* Secondary Floating Image (Parallax feel) */}
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`sec-${activeFeature}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.5, delay: 0.1 }}
                                className="absolute -bottom-10 -right-10 w-48 h-48 hidden md:block z-20"
                            >
                                {/* Wrapper for animation */}
                                <motion.div
                                    animate={{ y: [0, -10, 0] }}
                                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                                    className="w-full h-full relative"
                                >
                                    <Image
                                        src={features[activeFeature].secondaryImage}
                                        alt={`Detalle de ${features[activeFeature].title}`}
                                        fill
                                        sizes="192px"
                                        className="object-cover rounded-2xl shadow-xl border border-border"
                                    />
                                </motion.div>
                            </motion.div>
                        </AnimatePresence>


                        {/* Floating "Next Booking" Card */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.5 }}
                            className="absolute bottom-10 -left-10 z-30"
                        >
                            <Card className="border-primary/20 bg-card/85 backdrop-blur-xl shadow-2xl shadow-primary/10 w-auto">
                                <CardContent className="p-4 md:p-6 flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                                        <Calendar className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Próximo Turno</p>
                                        <p className="text-lg font-bold text-foreground">Hoy, 15:30</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>
                </div>
            </div>
        </div>
    );
}
