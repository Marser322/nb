import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Lookbook | New Brothers",
    description: "Inspirate con los estilos y cortes destacados de New Brothers. Elegí tu look favorito y reservá tu turno en un clic.",
};

export default function LookbookLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
