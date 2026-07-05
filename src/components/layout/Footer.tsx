"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scissors, Instagram, Phone, MapPin, Clock } from "lucide-react";
import { ROUTES, BUSINESS_CONFIG } from "@/lib/constants";

export function Footer() {
    const [clickCount, setClickCount] = useState(0);
    const router = useRouter();

    // Triple-click handler for hidden admin access
    const handleSecretClick = () => {
        const newCount = clickCount + 1;
        setClickCount(newCount);

        if (newCount >= 5) {
            router.push(ROUTES.ADMIN_DASHBOARD);
            setClickCount(0);
        }

        // Reset after 2 seconds
        setTimeout(() => setClickCount(0), 2000);
    };

    return (
        <footer className="bg-card border-t border-border">
            <div className="container mx-auto px-4 py-12 md:py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
                    {/* Brand */}
                    <div className="space-y-4">
                        <Link href="/" className="flex items-center gap-2">
                            <Scissors className="h-8 w-8 text-primary" />
                            <span className="font-display text-2xl font-bold uppercase tracking-normal">
                                NB <span className="text-primary">Barber</span>
                            </span>
                        </Link>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                            Tu destino para el cuidado masculino premium. Cortes de precisión,
                            barba impecable y productos de calidad.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg">Enlaces Rápidos</h4>
                        <ul className="space-y-2">
                            <li>
                                <Link
                                    href={ROUTES.RESERVAR}
                                    className="text-muted-foreground hover:text-primary transition-colors text-sm"
                                >
                                    Reservar Turno
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href={ROUTES.TIENDA}
                                    className="text-muted-foreground hover:text-primary transition-colors text-sm"
                                >
                                    Tienda Online
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href={ROUTES.LOOKBOOK}
                                    className="text-muted-foreground hover:text-primary transition-colors text-sm"
                                >
                                    Lookbook
                                </Link>
                            </li>
                            <li>
                                <Link
                                    href={ROUTES.CONTACTO}
                                    className="text-muted-foreground hover:text-primary transition-colors text-sm"
                                >
                                    Contacto
                                </Link>
                            </li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg">Contacto</h4>
                        <ul className="space-y-3">
                            <li className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-4 w-4 text-primary" />
                                {BUSINESS_CONFIG.phone}
                            </li>
                            <li className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Instagram className="h-4 w-4 text-primary" />
                                {BUSINESS_CONFIG.instagram}
                            </li>
                            <li className="flex items-center gap-2 text-sm text-muted-foreground">
                                <MapPin className="h-4 w-4 text-primary" />
                                {BUSINESS_CONFIG.location}
                            </li>
                        </ul>
                    </div>

                    {/* Hours */}
                    <div className="space-y-4">
                        <h4 className="font-semibold text-lg">Horarios</h4>
                        <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4 text-primary mt-0.5" />
                            <div>
                                <p>Lunes a Viernes</p>
                                <p className="text-foreground font-medium">
                                    {BUSINESS_CONFIG.workingHours.start}:00 -{" "}
                                    {BUSINESS_CONFIG.workingHours.end}:00
                                </p>
                                <p className="mt-2">Sábados</p>
                                <p className="text-foreground font-medium">
                                    {BUSINESS_CONFIG.workingHours.start}:00 -{" "}
                                    {BUSINESS_CONFIG.workingHours.end}:00
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom */}
                <div className="mt-12 pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-sm text-muted-foreground">
                        © {new Date().getFullYear()} NB Barber. Todos los derechos
                        reservados.
                    </p>
                    <div className="flex items-center gap-4">
                        <a
                            href="#"
                            className="text-muted-foreground hover:text-primary transition-colors"
                        >
                            <Instagram className="h-5 w-5" />
                        </a>
                        {/* Hidden admin access - 5 clicks activates */}
                        <span
                            onClick={handleSecretClick}
                            className="text-xs text-muted-foreground/70 cursor-pointer select-none hover:text-muted-foreground transition-colors"
                        >
                            v1.0.0
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
