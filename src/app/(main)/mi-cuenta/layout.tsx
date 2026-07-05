import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Mi Cuenta | New Brothers",
    description: "Gestioná tus reservas, historial de cortes y compras en tu cuenta de New Brothers.",
};

export default function MiCuentaLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
