"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Calendar, Clock, LayoutDashboard, Loader2, Star, Scissors, Sparkles, Wand2, Droplets, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Header, Footer } from "@/components/layout";
import { ROUTES } from "@/lib/constants";
import { BeforeAfterSlider } from "@/components/ui/before-after-slider";
import { WhyChooseUsContent } from "@/components/home/WhyChooseUsContent";
import { useFeatures } from "@/lib/features";
import { useBusinessConfig } from "@/lib/business-config";
import { buildWaLink } from "@/lib/whatsapp";
import { WelcomeModal } from "@/components/onboarding/WelcomeModal";
import { useDemoAdminLogin } from "@/hooks/useDemoAdminLogin";
import { isDemoMode } from "@/lib/demo";
import { formatPrice } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { STATIC_SERVICES, STATIC_STYLES, getServiceIdForStyle } from "@/lib/static-data";
import type { Service, Lookbook } from "@/types/database.types";

// Icono e imagen local por categoría de servicio (evita el acople por índice:
// un servicio nuevo se ve bien sin tocar código, fallback a "otro" si no matchea).
const SERVICE_VISUALS_BY_CATEGORY: Record<string, { icon: typeof Star; image: string }> = {
  corte: { icon: Scissors, image: "/images/hero/maquina-clippers.jpg" },
  barba: { icon: Wand2, image: "/images/hero/detalle-barba.jpg" },
  combo: { icon: Sparkles, image: "/images/hero/detalle-corte.jpg" },
  tratamiento: { icon: Droplets, image: "/images/hero/detalle-corte.jpg" },
  color: { icon: Palette, image: "/images/hero/maquina-clippers.jpg" },
  otro: { icon: Star, image: "/images/hero/herramientas-barberia.jpg" },
};

function getServiceVisual(category?: string | null) {
  return SERVICE_VISUALS_BY_CATEGORY[category || "otro"] || SERVICE_VISUALS_BY_CATEGORY.otro;
}

type StyleItem = Lookbook & { serviceId?: string | null };

export default function HomePage() {
  const { features } = useFeatures();
  const { config } = useBusinessConfig();
  const waLink = buildWaLink(config.phone, "Hola, me gustaría reservar un turno.");
  const { loginAsDemoAdmin, isDemoLoading } = useDemoAdminLogin();
  const supabase = useMemo(() => createClient(), []);

  const [services, setServices] = useState<Service[]>(STATIC_SERVICES.slice(0, 3));
  const [hasMoreServices, setHasMoreServices] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [featuredStyles, setFeaturedStyles] = useState<StyleItem[]>([]);

  // Cargar servicios activos y estilos del lookbook desde la DB, con fallback estático
  // (mismo patrón que el wizard, FASE 21). Se pide hasta 4 para saber si hay más de 3
  // y mostrar el link "Ver todos" sin depender de un count aparte.
  useEffect(() => {
    async function loadData() {
      setIsLoadingServices(true);
      const [servicesRes, lookbookRes] = await Promise.all([
        supabase.from("services").select("*").eq("is_active", true).order("sort_order").limit(4),
        supabase.from("lookbook").select("*").order("created_at", { ascending: false }),
      ]);

      const allLoadedServices = servicesRes?.data && servicesRes.data.length > 0 ? servicesRes.data : STATIC_SERVICES.slice(0, 3);
      const loadedServices = allLoadedServices.slice(0, 3);
      setHasMoreServices(allLoadedServices.length > 3);
      const loadedStyles: StyleItem[] =
        lookbookRes?.data && lookbookRes.data.length > 0
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ? lookbookRes.data.map((s: any) => ({
              id: s.id,
              title: s.title,
              image_url: s.image_url,
              instagram_url: s.instagram_url ?? null,
              tags: s.tags ?? [],
              is_featured: s.is_featured ?? false,
              created_at: s.created_at,
              serviceId: s.serviceId ?? null,
            }))
          : STATIC_STYLES;

      const featured = loadedStyles.filter((s) => s.is_featured);
      const styleHighlights = (featured.length > 0 ? featured : loadedStyles).slice(0, 4);

      setServices(loadedServices);
      setFeaturedStyles(styleHighlights);
      setIsLoadingServices(false);
    }
    loadData();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-background">
      <WelcomeModal role="cliente" />
      <Header />

      <section className="relative min-h-screen overflow-hidden pt-28 pb-16 flex items-center">
        <div className="absolute inset-0">
          <Image
            src="/images/hero/ambiente-barberia.jpg"
            alt="Interior premium de New Brothers"
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/78 to-black/30" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-black/70" />
          <div className="absolute inset-0 bg-noise opacity-25 mix-blend-overlay" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            className="max-w-4xl"
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-black/35 px-4 py-2 text-sm text-primary backdrop-blur-md mb-8">
              <Scissors className="h-4 w-4" />
              <span>New Brothers | Barbería premium en Uruguay</span>
            </div>

            <h1 className="font-display text-6xl md:text-8xl lg:text-9xl font-bold uppercase leading-none text-white">
              New
              <span className="block text-primary">Brothers</span>
            </h1>

            <div className="luxury-rule my-7 max-w-lg" />

            <p className="text-lg md:text-xl text-zinc-300 max-w-2xl leading-relaxed">
              Corte, barba y styling con precisión de taller privado. {features.reservas_online ? "Reservá online, elegí barbero y llegá directo a tu silla." : `Reservas por WhatsApp o teléfono al ${config.phone}.`}
            </p>

            <div className="mt-9 flex flex-col sm:flex-row gap-4">
              {features.reservas_online ? (
                <Button id="hero-cta" size="lg" asChild className="text-base md:text-lg h-14 px-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-xl shadow-primary/20">
                  <Link href={ROUTES.RESERVAR}>
                    Reservar Turno
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              ) : (
                <Button id="hero-cta" size="lg" asChild className="text-base md:text-lg h-14 px-9 rounded-full bg-[#25D366] hover:bg-[#1ebc59] text-black font-bold shadow-xl shadow-green-500/20">
                  <a href={waLink || "#"} target="_blank" rel="noopener noreferrer">
                    Reservar por WhatsApp
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
              )}
              {features.lookbook && (
                <Button size="lg" variant="outline" asChild className="text-base md:text-lg h-14 px-9 rounded-full border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/10 text-white">
                  <Link href={ROUTES.LOOKBOOK}>Ver estilos</Link>
                </Button>
              )}
            </div>

            <div id="admin-demo-entry" className="mt-6 max-w-2xl overflow-hidden rounded-2xl border border-primary/35 bg-black/45 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-md md:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    Cuenta admin pública
                  </div>
                  <p className="text-sm leading-relaxed text-zinc-200 md:text-base">
                    Para dueños: entrá al panel demo con agenda, clientes, caja, stock y reportes listos.
                  </p>
                </div>
                {isDemoMode ? (
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 shrink-0 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                    disabled={isDemoLoading}
                    onClick={loginAsDemoAdmin}
                  >
                    {isDemoLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                    )}
                    Entrar al panel
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    asChild
                    className="h-12 shrink-0 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    <Link href={ROUTES.ADMIN_LOGIN}>
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      Panel administrativo
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-16 grid grid-cols-3 gap-4 max-w-2xl">
              <div className="border-l border-primary/50 pl-4">
                <p className="font-display text-4xl md:text-5xl font-bold text-white">5+</p>
                <p className="text-xs md:text-sm text-zinc-400 uppercase tracking-[0.18em]">Años</p>
              </div>
              <div className="border-l border-white/15 pl-4">
                <p className="font-display text-4xl md:text-5xl font-bold text-white">1000+</p>
                <p className="text-xs md:text-sm text-zinc-400 uppercase tracking-[0.18em]">Clientes</p>
              </div>
              <div className="border-l border-white/15 pl-4">
                <p className="font-display text-4xl md:text-5xl font-bold text-primary">4.9</p>
                <p className="text-xs md:text-sm text-zinc-400 uppercase tracking-[0.18em]">Estrellas</p>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="absolute bottom-8 right-6 hidden md:block text-right">
          <p className="font-display text-xs uppercase tracking-[0.3em] text-primary">Sillón listo</p>
          <p className="text-sm text-zinc-300">Reservas online · Lun a sáb</p>
        </div>
      </section>

      {isDemoMode && (
        <motion.section
          id="demo-admin-cta"
          className="relative overflow-hidden border-y border-primary/20 bg-primary/5 py-10 md:py-12"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="absolute inset-0 bg-noise opacity-10 pointer-events-none" />
          <div className="container mx-auto px-4 relative z-10">
            <div className="glass-card overflow-hidden rounded-2xl border border-primary/30 bg-card/60 p-5 shadow-2xl shadow-primary/10 md:p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-3xl">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    <LayoutDashboard className="h-4 w-4" />
                    Demo para dueños de barberías
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">
                    ¿Gestionás una barbería? Mirá el panel por dentro
                  </h2>
                  <p className="mt-3 text-base leading-relaxed text-muted-foreground md:text-lg">
                    Agenda, caja, clientes, stock y liquidaciones en un solo lugar. Entrá al panel de administración de demostración sin crear cuenta.
                  </p>
                </div>
                <Button
                  size="lg"
                  type="button"
                  className="h-14 w-full rounded-full px-6 text-base font-semibold shadow-lg shadow-primary/20 md:w-auto"
                  disabled={isDemoLoading}
                  onClick={loginAsDemoAdmin}
                >
                  {isDemoLoading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <LayoutDashboard className="mr-2 h-5 w-5" />
                  )}
                  Entrar al panel demo
                </Button>
              </div>
            </div>
          </div>
        </motion.section>
      )}

      {/* Services Section */}
      {/* Services Section */}
      <section className="py-24 relative overflow-hidden">
        {/* Background Elements */}
        <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

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
            {isLoadingServices ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="h-full min-h-[340px] rounded-2xl border border-border bg-card/50 animate-pulse" />
              ))
            ) : (
              services.map((service, index) => {
                const visual = getServiceVisual(service.category);
                const ServiceIcon = visual.icon;
                const cardImage = service.image_url || visual.image;

                const cardContent = (
                  <Card className="h-full border-border bg-card/50 backdrop-blur-md overflow-hidden transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10">
                    {/* Dynamic Background Image on Hover */}
                    <div className="absolute inset-0 z-0">
                      <Image
                        src={cardImage}
                        alt={service.name}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover opacity-0 group-hover:opacity-20 transition-all duration-700 group-hover:scale-110 grayscale group-hover:grayscale-0"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent z-10" />
                    </div>

                    {/* Floating Accessory/Effect */}
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 blur-[60px] rounded-full group-hover:bg-primary/30 transition-all duration-500" />

                    <CardContent className="p-8 relative z-20 flex flex-col h-full">
                      <div className="mb-6 flex justify-between items-start">
                        <div className="h-14 w-14 rounded-2xl bg-muted border border-border flex items-center justify-center group-hover:bg-primary group-hover:border-primary transition-all duration-500 group-hover:shadow-[0_0_20px_rgba(234,179,8,0.3)]">
                          <ServiceIcon className="h-7 w-7 text-foreground group-hover:text-primary-foreground transition-colors" />
                        </div>
                        {/* Animated Badge on Hover */}
                        <motion.div
                          className="bg-primary/10 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                          animate={{ rotate: [0, 15, -15, 0] }}
                          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <Scissors className="h-4 w-4 text-primary" />
                        </motion.div>
                      </div>

                      <h3 className="text-2xl font-bold mb-3 text-foreground group-hover:text-primary transition-colors duration-300">
                        {service.name}
                      </h3>

                      <p className="text-muted-foreground mb-8 leading-relaxed group-hover:text-foreground transition-colors duration-300">
                        {service.description}
                      </p>

                      <div className="mt-auto flex items-center justify-between pt-6 border-t border-border group-hover:border-border/80 transition-colors">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                          <Clock className="h-4 w-4 text-primary" />
                          {service.duration_minutes} min
                        </div>
                        <span className="text-2xl font-bold text-foreground group-hover:text-primary transition-colors text-glow">
                          {formatPrice(service.price)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );

                return (
                  <motion.div
                    key={service.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ y: -10 }}
                    className="group relative h-full"
                  >
                    {features.reservas_online ? (
                      <Link href={`${ROUTES.RESERVAR}?serviceId=${service.id}`} className="block h-full">
                        {cardContent}
                      </Link>
                    ) : (
                      cardContent
                    )}
                  </motion.div>
                );
              })
            )}
          </div>

          {features.reservas_online && (
            <div className="text-center mt-16">
              <Button size="lg" className="h-14 px-8 text-lg rounded-full shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all duration-300" asChild>
                <Link href={ROUTES.RESERVAR}>
                  <Calendar className="mr-2 h-5 w-5" />
                  Reservar Cita
                </Link>
              </Button>
            </div>
          )}

          {features.reservas_online && hasMoreServices && (
            <div className="text-center mt-6">
              <Link
                href={ROUTES.RESERVAR}
                className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                Ver todos los servicios
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Estilos destacados del Lookbook */}
      {features.lookbook && featuredStyles.length > 0 && (
        <section className="py-24 relative overflow-hidden bg-muted/35">
          <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none" />
          <div className="container mx-auto px-4 relative z-10">
            <motion.div
              className="text-center mb-16"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight">
                Estilos que piden <span className="text-primary">hora</span>
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                Elegí tu referencia del Lookbook y llegá a la silla con el look ya decidido.
              </p>
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
              {featuredStyles.map((style, index) => {
                const resolvedServiceId = style.serviceId ?? getServiceIdForStyle(style.id);
                const href = resolvedServiceId
                  ? `${ROUTES.RESERVAR}?styleId=${style.id}&serviceId=${resolvedServiceId}`
                  : `${ROUTES.RESERVAR}?styleId=${style.id}`;

                return (
                  <motion.div
                    key={style.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="group relative rounded-2xl overflow-hidden border border-border bg-card shadow-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl hover:shadow-primary/10"
                  >
                    <div className="relative aspect-[3/4]">
                      <Image
                        src={style.image_url}
                        alt={style.title}
                        fill
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="font-bold text-white mb-2 leading-tight text-sm md:text-base">{style.title}</h3>
                      {features.reservas_online && (
                        <Button asChild size="sm" className="w-full rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-8">
                          <Link href={href}>
                            Reservar estilo
                            <ArrowRight className="ml-1.5 h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="text-center mt-12">
              <Button size="lg" variant="outline" className="h-12 px-8 rounded-full" asChild>
                <Link href={ROUTES.LOOKBOOK}>
                  Ver todo el lookbook
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Why Choose Us */}
      {/* Transformations Section */}
      <section className="py-24 relative bg-muted/35">
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
                beforeImage="/images/before-makeover.jpg"
                afterImage="/images/after-makeover.jpg"
              />
              <div className="text-center">
                <h3 className="text-xl font-bold text-foreground">Full Makeover</h3>
                <p className="text-sm text-muted-foreground">Corte + Barba + Styling</p>
              </div>
            </div>
            <div className="space-y-4">
              {/* Slider 2: Sharp Fade Transformation */}
              <BeforeAfterSlider
                beforeImage="/images/hero/maquina-clippers.jpg"
                afterImage="/images/hero/estilo-moderno.jpg"
              />
              <div className="text-center">
                <h3 className="text-xl font-bold text-foreground">Classic Fade</h3>
                <p className="text-sm text-muted-foreground">Degradado perfecto y líneas limpias</p>
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
            src="/images/hero/ambiente-barberia.jpg"
            alt="Interior de New Brothers"
            fill
            sizes="100vw"
            className="object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
        </div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
            ¿Listo para tu <span className="text-primary">nuevo look</span>?
          </h2>
          <p className="text-gray-300 mb-10 max-w-xl mx-auto text-lg leading-relaxed">
            {features.reservas_online ? "Reservá tu turno ahora y viví la experiencia NB Barber. No es solo un corte, es tu momento." : `Escribinos por WhatsApp o llamanos ahora y viví la experiencia NB Barber. No es solo un corte, es tu momento.`}
          </p>
          {features.reservas_online ? (
            <Button size="lg" asChild className="text-lg px-10 py-8 rounded-full shadow-2xl shadow-primary/20 hover:scale-105 transition-transform bg-primary hover:bg-primary/90 text-primary-foreground">
              <Link href={ROUTES.RESERVAR}>
                Reservar Turno
                <ArrowRight className="ml-2 h-6 w-6" />
              </Link>
            </Button>
          ) : (
            <Button size="lg" asChild className="text-lg px-10 py-8 rounded-full shadow-2xl shadow-green-500/20 hover:scale-105 transition-transform bg-[#25D366] hover:bg-[#1ebc59] text-black font-bold">
              <a href={waLink || "#"} target="_blank" rel="noopener noreferrer">
                Reservar por WhatsApp
                <ArrowRight className="ml-2 h-6 w-6" />
              </a>
            </Button>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
