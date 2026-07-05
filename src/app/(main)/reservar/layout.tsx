import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Reservar Turno | New Brothers",
    description: "Reservá tu turno online en New Brothers: elegí sucursal, barbero, servicio y horario en simples pasos.",
};

export default function ReservarLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
