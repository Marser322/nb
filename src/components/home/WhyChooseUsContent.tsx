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
            image: "https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=800&q=80",
            secondaryImage: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&q=80",
        },
        {
            id: 1,
            icon: Clock,
            title: "Reservas Online",
            description: "Elegí tu horario desde cualquier lugar, sin esperas.",
            image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80",
            secondaryImage: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&q=80",
        },
        {
            id: 2,
            icon: Sparkles,
            title: "Productos Premium",
            description: "Usamos y vendemos solo productos de la más alta calidad.",
            image: "https://images.unsplash.com/photo-1595152772835-219674b2a8a6?w=800&q=80",
            secondaryImage: "https://images.unsplash.com/photo-1593702295094-aea8c5c13d73?w=400&q=80",
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
                                className={`flex gap-5 group cursor-pointer p-4 rounded-2xl transition-all duration-300 ${activeFeature === index ? "bg-white/5 border border-white/5" : "hover:bg-white/5 border border-transparent"}`}
                                onMouseEnter={() => setActiveFeature(index)}
                                whileHover={{ scale: 1.02, x: 10 }}
                            >
                                <div className={`h-14 w-14 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-colors duration-300 ${activeFeature === index ? "border-primary bg-primary/20" : "border-white/10 bg-white/5 group-hover:border-primary/50"}`}>
                                    <feature.icon className={`h-6 w-6 transition-colors ${activeFeature === index ? "text-primary" : "text-gray-400 group-hover:text-primary"}`} />
                                </div>
                                <div>
                                    <h4 className={`text-xl font-bold mb-2 transition-colors ${activeFeature === index ? "text-primary" : "text-white group-hover:text-white"}`}>
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
                    {/* Decorative Background Blob */}
                    <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full transform rotate-12" />

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
                                    className="object-cover rounded-[2rem] shadow-2xl border border-white/10"
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
                                        alt="Detail"
                                        fill
                                        className="object-cover rounded-2xl shadow-xl border border-white/10"
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
                            <Card className="border-primary/20 bg-black/80 backdrop-blur-xl shadow-2xl shadow-primary/10 w-auto">
                                <CardContent className="p-4 md:p-6 flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                                        <Calendar className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Próximo Turno</p>
                                        <p className="text-lg font-bold text-white">Hoy, 15:30</p>
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
