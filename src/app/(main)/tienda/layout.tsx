import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Tienda | New Brothers",
    description: "Comprá productos premium de grooming: pomadas, aceites y cuidado de barba de New Brothers, con envío en Uruguay.",
};

export default function TiendaLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
