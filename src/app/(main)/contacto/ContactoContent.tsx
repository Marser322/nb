"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    ArrowRight,
    Clock,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    Scissors,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Header, Footer } from "@/components/layout";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { BUSINESS_CONFIG, BRANCHES, ROUTES } from "@/lib/constants";
import { useFeatures } from "@/lib/features";
import { normalizeUyPhone, buildWaLink } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/client";

type TeamMember = {
    slug: string;
    name: string;
    role: string;
    bio: string;
    image: string | null;
};

// Fallback estático: se muestra si la tabla `barbers` no tiene activos o la query falla
// (mismo patrón que home/lookbook, FASE 25).
const TEAM: TeamMember[] = [
    {
        slug: "carlos",
        name: "Carlos",
        role: "Cortes clásicos y modernos",
        bio: "Referente de la casa en fades y cortes de precisión. Carlos combina técnica de barbería tradicional con las tendencias que traen los clientes de referencia en mano.",
        image: "/images/barbers/carlos.jpg",
    },
    {
        slug: "miguel",
        name: "Miguel",
        role: "Diseño de barba y estilos urbanos",
        bio: "Especialista en perfilado de barba y en los cortes urbanos que marcan tendencia en Montevideo. Cada visita es una sesión de styling a medida.",
        image: "/images/barbers/miguel.jpg",
    },
    {
        slug: "diego",
        name: "Diego",
        role: "10 años de oficio",
        bio: "Una década de tijera y navaja. Diego es la mano de confianza para afeitados clásicos y esos detalles que solo da la experiencia.",
        image: "/images/barbers/diego.jpg",
    },
];

const DEFAULT_ROLE = "Barbero de la casa";
const DEFAULT_BIO = "Profesional del equipo NB, listo para tu próximo corte.";

export function ContactoContent() {
    const { features } = useFeatures();
    const hours = `${BUSINESS_CONFIG.workingHours.start}:00 - ${BUSINESS_CONFIG.workingHours.end}:00`;
    const supabase = useMemo(() => createClient(), []);

    const [team, setTeam] = useState<TeamMember[]>(TEAM);
    const [isLoadingTeam, setIsLoadingTeam] = useState(true);

    // Cargar el equipo real desde `barbers` (activos), con fallback al array estático
    // si la query falla o viene vacía (patrón FASE 25, src/app/page.tsx:50-54).
    useEffect(() => {
        async function loadTeam() {
            setIsLoadingTeam(true);
            const { data } = await supabase
                .from("barbers")
                .select("id, name, bio, avatar_url")
                .eq("is_active", true)
                .order("created_at");

            if (data && data.length > 0) {
                setTeam(
                    data.map((barber) => ({
                        slug: barber.id,
                        name: barber.name,
                        role: DEFAULT_ROLE,
                        bio: barber.bio || DEFAULT_BIO,
                        image: barber.avatar_url,
                    }))
                );
            } else {
                setTeam(TEAM);
            }
            setIsLoadingTeam(false);
        }

        loadTeam();
    }, [supabase]);

    return (
        <div className="min-h-screen bg-background">
            <Header />

            <main className="pb-16">
                {/* Hero */}
                <section className="relative h-[45vh] min-h-[400px] w-full flex items-center justify-center overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-black/95 via-black/80 to-background z-0" />
                    <div className="absolute inset-0 bg-noise opacity-30 mix-blend-overlay z-0" />

                    <motion.div
                        className="relative z-10 text-center px-4 max-w-3xl pt-16"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <Badge
                            variant="outline"
                            className="mb-6 border-primary/50 text-white bg-white/5 backdrop-blur-md px-4 py-1 uppercase tracking-[0.2em] text-xs"
                        >
                            Contacto y Sucursales
                        </Badge>
                        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-4 text-white tracking-tighter">
                            Encontranos en{" "}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">
                                tu barrio
                            </span>
                        </h1>
                        <p className="text-base md:text-lg text-zinc-300 max-w-2xl mx-auto leading-relaxed font-light">
                            Tres sedes, un mismo estándar. Elegí la más cercana, escribinos por WhatsApp o reservá directo online.
                        </p>
                    </motion.div>
                </section>

                {/* Nuestra Historia */}
                <section className="relative py-24 overflow-hidden">
                    <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none" />
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

                    <div className="container mx-auto px-4 relative z-10">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
                            <motion.div
                                initial={{ opacity: 0, x: -30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.7 }}
                                className="relative aspect-[4/5] rounded-3xl overflow-hidden border border-border shadow-2xl"
                            >
                                <Image
                                    src="/images/hero/ambiente-barberia.jpg"
                                    alt="Interior de New Brothers"
                                    fill
                                    sizes="(max-width: 1024px) 100vw, 50vw"
                                    className="object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: 30 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.7, delay: 0.1 }}
                            >
                                <p className="font-display text-sm uppercase tracking-[0.25em] text-primary mb-4">
                                    Nuestra Historia
                                </p>
                                <h2 className="text-3xl md:text-5xl font-bold mb-8 leading-tight text-foreground">
                                    Más de 5 años afilando el oficio
                                </h2>
                                <div className="space-y-5 text-muted-foreground leading-relaxed">
                                    <p>
                                        New Brothers nació de una idea simple: un corte de pelo es una decisión, no un
                                        trámite. Empezamos como un sillón y una tijera en el centro de Montevideo, con
                                        la convicción de que la barbería uruguaya merecía el mismo nivel de detalle que
                                        cualquier estudio de barbería europeo.
                                    </p>
                                    <p>
                                        Hoy somos tres sucursales y un equipo que se capacita todo el año en fades,
                                        diseño de barba y afeitado clásico. Pero la base sigue siendo la misma: escuchar
                                        lo que el cliente quiere, no lo que está de moda esa semana.
                                    </p>
                                    <p>
                                        Trabajamos con productos premium, instrumentos de precisión y una regla que no
                                        negociamos — salís de la silla exactamente con el look que viniste a buscar.
                                    </p>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* El Equipo */}
                <section className="relative py-24 overflow-hidden bg-muted/30">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

                    <div className="container mx-auto px-4 relative z-10">
                        <motion.div
                            className="text-center mb-16"
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                        >
                            <p className="font-display text-sm uppercase tracking-[0.25em] text-primary mb-4">
                                El Equipo
                            </p>
                            <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-6">
                                Las manos detrás de cada corte
                            </h2>
                            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                                Profesionales con oficio real, capacitación constante y una obsesión compartida por el detalle.
                            </p>
                        </motion.div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                            {isLoadingTeam ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="rounded-2xl overflow-hidden border border-border bg-card/50"
                                    >
                                        <div className="aspect-square bg-muted animate-pulse" />
                                        <div className="p-6 space-y-3">
                                            <div className="h-5 w-2/3 rounded bg-muted animate-pulse" />
                                            <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
                                            <div className="h-16 w-full rounded bg-muted animate-pulse" />
                                        </div>
                                    </div>
                                ))
                            ) : (
                                team.map((member, index) => (
                                    <motion.div
                                        key={member.slug}
                                        initial={{ opacity: 0, y: 24 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: index * 0.1, duration: 0.6 }}
                                        className="group relative rounded-2xl overflow-hidden border border-border bg-card/50 backdrop-blur-md transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10"
                                    >
                                        <div className="relative aspect-square overflow-hidden bg-muted">
                                            <ImageWithFallback
                                                src={member.image}
                                                alt={member.name}
                                                fill
                                                sizes="(max-width: 768px) 100vw, 33vw"
                                                className="object-cover transition-transform duration-700 group-hover:scale-105"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                                        </div>
                                        <div className="p-6 relative">
                                            <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                                                {member.name}
                                            </h3>
                                            <p className="text-xs uppercase tracking-wider text-primary/80 mt-1 mb-3">
                                                {member.role}
                                            </p>
                                            <p className="text-sm text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                                                {member.bio}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>
                </section>

                {/* Sucursales */}
                <section className="relative py-24 overflow-hidden">
                    <div className="absolute inset-0 bg-noise opacity-5 pointer-events-none" />

                    <div className="container mx-auto px-4 relative z-10">
                        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-16">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                            >
                                <p className="font-display text-sm uppercase tracking-[0.25em] text-primary mb-4">
                                    Sucursales
                                </p>
                                <h2 className="text-3xl md:text-5xl font-bold text-foreground">
                                    Tres formas de vivir la experiencia NB
                                </h2>
                            </motion.div>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: 0.1 }}
                                className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-full px-4 py-2 bg-muted"
                            >
                                <Clock className="h-4 w-4 text-primary" />
                                Lun a sáb · {hours}
                            </motion.div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                            {BRANCHES.map((branch, index) => {
                                const normalizedPhone = normalizeUyPhone(branch.phone);
                                const telHref = normalizedPhone ? `tel:+${normalizedPhone}` : `tel:${branch.phone}`;
                                const waHref = buildWaLink(
                                    branch.phone,
                                    `Hola! Quiero consultar por un turno en ${branch.name}.`
                                );

                                return (
                                    <motion.article
                                        key={branch.id}
                                        initial={{ opacity: 0, y: 24 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true }}
                                        transition={{ delay: index * 0.1, duration: 0.6 }}
                                        className="flex flex-col h-full rounded-2xl overflow-hidden border border-border bg-card/50 backdrop-blur-md transition-all duration-500 hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/10"
                                    >
                                        <div className="relative aspect-[4/3] w-full overflow-hidden">
                                            <Image
                                                src={branch.image}
                                                alt={branch.name}
                                                fill
                                                sizes="(max-width: 768px) 100vw, 33vw"
                                                className="object-cover transition-transform duration-500 hover:scale-110"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                                            <div className="absolute bottom-0 left-0 p-5">
                                                <h3 className="font-bold text-white text-xl">{branch.name}</h3>
                                            </div>
                                        </div>

                                        <div className="p-6 flex flex-col flex-grow">
                                            <p className="text-sm text-muted-foreground mb-4">{branch.tone}</p>

                                            <div className="space-y-3 mb-6">
                                                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                                                    <MapPin className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                                    {branch.address}
                                                </p>
                                                <a
                                                    href={telHref}
                                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
                                                >
                                                    <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                                                    {branch.phone}
                                                </a>
                                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                                    <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                                                    Lun a sáb · {hours}
                                                </p>
                                            </div>

                                            <div className="mt-auto flex flex-col gap-2">
                                                <Button
                                                    asChild
                                                    className="w-full rounded-full bg-[#25D366] hover:bg-[#1ebc59] text-black font-bold"
                                                >
                                                    <a href={waHref} target="_blank" rel="noopener noreferrer">
                                                        <MessageCircle className="mr-2 h-4 w-4" />
                                                        WhatsApp
                                                    </a>
                                                </Button>
                                                {features.reservas_online && (
                                                    <Button asChild variant="outline" className="w-full rounded-full border-border bg-muted hover:bg-accent hover:text-accent-foreground">
                                                        <Link href={ROUTES.RESERVAR}>Reservar en esta sede</Link>
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </motion.article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                {/* CTA Final */}
                <section className="relative py-24 overflow-hidden">
                    <div className="absolute inset-0">
                        <Image
                            src="/images/hero/ambiente-barberia.jpg"
                            alt="Interior de New Brothers"
                            fill
                            sizes="100vw"
                            className="object-cover opacity-20"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/60" />
                        <div className="absolute inset-0 bg-noise opacity-20 mix-blend-overlay" />
                    </div>

                    <motion.div
                        className="container mx-auto px-4 text-center relative z-10"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                    >
                        <div className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-black/35 px-4 py-2 text-sm text-primary backdrop-blur-md mb-6">
                            <Scissors className="h-4 w-4" />
                            <span>Tu silla te espera</span>
                        </div>
                        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
                            ¿Hablamos o reservás{" "}
                            <span className="text-primary">directo</span>?
                        </h2>
                        <p className="text-gray-300 mb-10 max-w-xl mx-auto text-lg leading-relaxed">
                            Escribinos por WhatsApp, llamanos o elegí tu horario ahora mismo. Cualquier camino te lleva a la misma silla.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            {features.reservas_online && (
                                <Button
                                    size="lg"
                                    asChild
                                    className="text-lg px-10 py-8 rounded-full shadow-2xl shadow-primary/20 hover:scale-105 transition-transform bg-primary hover:bg-primary/90 text-primary-foreground"
                                >
                                    <Link href={ROUTES.RESERVAR}>
                                        Reservar Turno
                                        <ArrowRight className="ml-2 h-6 w-6" />
                                    </Link>
                                </Button>
                            )}
                            <Button
                                size="lg"
                                variant="outline"
                                asChild
                                className="text-lg px-10 py-8 rounded-full border-white/15 bg-white/5 backdrop-blur-sm hover:bg-white/10 text-white"
                            >
                                <a href={`mailto:${BUSINESS_CONFIG.email}`}>
                                    <Mail className="mr-2 h-5 w-5" />
                                    Escribirnos
                                </a>
                            </Button>
                        </div>
                    </motion.div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
