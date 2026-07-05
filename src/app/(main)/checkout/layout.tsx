import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Finalizar Compra | New Brothers",
    description: "Completá tu compra en New Brothers de forma segura y rápida.",
};

export default function CheckoutLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
