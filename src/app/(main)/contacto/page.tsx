import type { Metadata } from "next";
import { ContactoContent } from "./ContactoContent";

export const metadata: Metadata = {
    title: "Contacto y Sucursales | New Brothers",
    description:
        "Conocé la historia de New Brothers, nuestro equipo de barberos y las tres sucursales en Uruguay. Reservá turno, llamanos o escribinos por WhatsApp.",
};

export default function ContactoPage() {
    return <ContactoContent />;
}
