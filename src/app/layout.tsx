import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { HelpFab } from "@/components/tour/HelpFab";
import { AiAssistant } from "@/components/chat/AiAssistant";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "New Brothers | Salón de Estética Masculina",
  description: "New Brothers: Tu espacio de estética masculina. Reservá tu turno para corte de cabello, barba y cuidado personal.",
  keywords: ["barbería", "new brothers", "corte de pelo", "barba", "Uruguay", "estética masculina"],
  icons: {
    icon: "/icon.png",
  },
  openGraph: {
    title: "New Brothers | Estética Masculina",
    description: "La evolución de la barbería clásica. Reservá tu experiencia online.",
    type: "website",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        {children}
        <TourOverlay />
        <HelpFab />
        <AiAssistant />
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
