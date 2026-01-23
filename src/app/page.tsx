"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { ArrowRight, Calendar, Clock, Star, Scissors, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Header, Footer } from "@/components/layout";
import { ROUTES } from "@/lib/constants";
import { BeforeAfterSlider } from "@/components/ui/before-after-slider";
import { WhyChooseUsContent } from "@/components/home/WhyChooseUsContent";

// Servicios destacados (luego vendrán de la BD)
const services = [
  {
    id: "1",
    name: "Corte Clásico",
    description: "Corte de precisión adaptado a tu estilo personal",
    price: 450,
    duration: 30,
    icon: Scissors,
    image: "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=500&q=80",
  },
  {
    id: "2",
    name: "Corte + Barba",
    description: "El combo completo para el caballero moderno",
    price: 750,
    duration: 60,
    icon: Sparkles,
    image: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=500&q=80",
  },
  {
    id: "3",
    name: "Diseño de Barba",
    description: "Perfilado y mantenimiento profesional",
    price: 350,
    duration: 30,
    icon: Star,
    image: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=500&q=80",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-20">
        {/* Background Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/95 via-black/80 to-background z-0" />
        <div className="absolute inset-0 bg-noise opacity-30 mix-blend-overlay z-0" />

        {/* Floating Images Composition - Symmetrical & Clean */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">

          {/* Left Column - Tools & Details */}
          <div className="absolute top-0 left-0 bottom-0 w-[15%] md:w-[25%] flex flex-col justify-between py-20 pl-4 md:pl-10">
            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-24 h-24 md:w-40 md:h-40 opacity-30"
            >
              <Image src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&q=80" alt="Atmosphere" fill className="object-cover rounded-2xl grayscale border border-white/10" />
            </motion.div>

            <motion.div
              animate={{ y: [0, 20, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="relative w-32 h-32 md:w-56 md:h-56 opacity-20 ml-8 md:ml-12"
            >
              <Image src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&q=80" alt="Tools" fill className="object-cover rounded-full grayscale blur-[1px]" />
            </motion.div>

            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-28 h-28 md:w-48 md:h-48 opacity-30"
            >
              <Image src="https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&q=80" alt="Cut Detail" fill className="object-cover rounded-[30px]" />
            </motion.div>
          </div>

          {/* Right Column - Styles & Cuts */}
          <div className="absolute top-0 right-0 bottom-0 w-[15%] md:w-[25%] flex flex-col justify-between py-20 pr-4 md:pr-10 items-end">
            <motion.div
              animate={{ y: [0, 15, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="relative w-28 h-28 md:w-48 md:h-48 opacity-30"
            >
              <Image src="https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=400&q=80" alt="Style" fill className="object-cover rounded-2xl border border-white/10" />
            </motion.div>

            <motion.div
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              className="relative w-32 h-32 md:w-56 md:h-56 opacity-20 mr-8 md:mr-12"
            >
              <Image src="https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=400&q=80" alt="Machine" fill className="object-cover rounded-full grayscale blur-[1px]" />
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
              className="relative w-24 h-24 md:w-44 md:h-44 opacity-30"
            >
              <Image src="https://images.unsplash.com/photo-1534297635766-a262cdcb8ee4?w=400&q=80" alt="Beard" fill className="object-cover rounded-[30px]" />
            </motion.div>
          </div>

          {/* Center Glow (Subtle) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-4xl bg-background/60 blur-[100px] z-0 rounded-full" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            className="max-w-4xl mx-auto text-center"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm mb-8">
              <Scissors className="h-4 w-4" />
              <span>New Brothers | Salón de Estética Masculina</span>
            </div>

            {/* Main Heading */}
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 leading-[1.1]">
              Tu Estilo,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-primary to-yellow-600">
                Nuestra Pasión
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
              Más que un corte, una experiencia de lujo diseñada para el caballero moderno.
              Reservá tu turno online y descubrí la evolución de la barbería clásica.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" asChild className="text-lg h-14 px-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/20">
                <Link href={ROUTES.RESERVAR}>
                  Reservar Turno
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg h-14 px-10 rounded-full border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10">
                <Link href={ROUTES.TIENDA}>Ver Productos</Link>
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 mt-20 max-w-xl mx-auto">
              <div className="space-y-1">
                <p className="text-3xl md:text-5xl font-bold text-white">5+</p>
                <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">Años</p>
              </div>
              <div className="space-y-1">
                <p className="text-3xl md:text-5xl font-bold text-white">1000+</p>
                <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">Clientes</p>
              </div>
              <div className="space-y-1 border-primary/20">
                <p className="text-3xl md:text-5xl font-bold text-primary">4.9</p>
                <p className="text-xs md:text-sm text-muted-foreground uppercase tracking-wider">Estrellas</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <div className="w-6 h-10 border-2 border-muted-foreground/30 rounded-full flex items-start justify-center p-2 backdrop-blur-sm">
            <div className="w-1.5 h-1.5 bg-primary rounded-full" />
          </div>
        </motion.div>
      </section>

      {/* Services Section */}
      {/* Services Section */}
      <section className="py-24 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none" />
        <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] -translate-y-1/2 -z-10" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
              Nuestros <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">Servicios</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Experiencias de cuidado personal diseñadas para el caballero moderno.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {services.map((service, index) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -10 }}
                className="group relative h-full"
              >
                <Card className="h-full border-white/5 bg-zinc-900/50 backdrop-blur-md overflow-hidden transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10">
                  {/* Dynamic Background Image on Hover */}
                  <div className="absolute inset-0 z-0">
                    <Image
                      src={service.image}
                      alt={service.name}
                      fill
                      className="object-cover opacity-0 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent z-10" />
                  </div>

                  {/* Floating Accessory/Effect */}
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 blur-[60px] rounded-full group-hover:bg-primary/30 transition-all duration-500" />

                  <CardContent className="p-8 relative z-20 flex flex-col h-full">
                    <div className="mb-6 flex justify-between items-start">
                      <div className="h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-500 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                        <service.icon className="h-7 w-7 text-white transition-colors" />
                      </div>
                      {/* Animated Badge on Hover */}
                      <motion.div
                        className="bg-white/10 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        animate={{ rotate: [0, 15, -15, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <Scissors className="h-4 w-4 text-primary" />
                      </motion.div>
                    </div>

                    <h3 className="text-2xl font-bold mb-3 text-white group-hover:text-primary transition-colors duration-300">
                      {service.name}
                    </h3>

                    <p className="text-gray-400 mb-8 leading-relaxed group-hover:text-gray-200 transition-colors duration-300">
                      {service.description}
                    </p>

                    <div className="mt-auto flex items-center justify-between pt-6 border-t border-white/10 group-hover:border-white/20 transition-colors">
                      <div className="flex items-center gap-2 text-sm text-gray-400 group-hover:text-white transition-colors">
                        <Clock className="h-4 w-4 text-primary" />
                        {service.duration} min
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-primary">$</span>
                        <span className="text-2xl font-bold text-white group-hover:text-amber-400 transition-colors text-glow">
                          {service.price}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Button size="lg" className="h-14 px-8 text-lg rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300" asChild>
              <Link href={ROUTES.RESERVAR}>
                <Calendar className="mr-2 h-5 w-5" />
                Reservar Cita
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      {/* Transformations Section */}
      <section className="py-24 relative bg-black/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">
              Antes y <span className="text-primary">Después</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Un buen corte no solo cambia tu imagen, cambia tu actitud.
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-16">
            <div className="space-y-4">
              {/* Slider 1: Beard & Hair Transformation */}
              <BeforeAfterSlider
                beforeImage="/images/before-makeover.png"
                afterImage="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&q=80"
              />
              <div className="text-center">
                <h3 className="text-xl font-bold text-white">Full Makeover</h3>
                <p className="text-sm text-gray-400">Corte + Barba + Styling</p>
              </div>
            </div>
            <div className="space-y-4">
              {/* Slider 2: Sharp Fade Transformation */}
              <BeforeAfterSlider
                beforeImage="https://images.unsplash.com/photo-1599351431202-1e0f0137899a?w=800&q=80"
                afterImage="https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800&q=80"
              />
              <div className="text-center">
                <h3 className="text-xl font-bold text-white">Classic Fade</h3>
                <p className="text-sm text-gray-400">Degradado perfecto y líneas limpias</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Us - Interactive Section */}
      <section className="py-24 relative overflow-hidden">
        <WhyChooseUsContent />
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1585747860715-2ba37e788b70?q=80&w=2074"
            alt="Background"
            fill
            className="object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
        </div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            ¿Listo para tu <span className="text-primary">nuevo look</span>?
          </h2>
          <p className="text-gray-300 mb-10 max-w-xl mx-auto text-lg leading-relaxed">
            Reservá tu turno ahora y viví la experiencia NB Barber. No es solo un corte, es tu momento.
          </p>
          <Button size="lg" asChild className="text-lg px-10 py-8 rounded-full shadow-2xl shadow-primary/20 hover:scale-105 transition-transform bg-primary hover:bg-primary/90 text-primary-foreground">
            <Link href={ROUTES.RESERVAR}>
              Reservar Turno
              <ArrowRight className="ml-2 h-6 w-6" />
            </Link>
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
