import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { HelpFab } from "@/components/tour/HelpFab";
import { AiAssistant } from "@/components/chat/AiAssistant";
import { ThemeProvider } from "@/components/theme-provider";
import { BUSINESS_CONFIG } from "@/lib/constants";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://nbbarber.vercel.app";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "New Brothers | Barbería Premium en Uruguay",
  description: "New Brothers: barbería premium en Uruguay. Reservá tu turno online para corte de cabello, barba y cuidado personal masculino.",
  keywords: ["barbería", "new brothers", "corte de pelo", "barba", "Uruguay", "estética masculina", "reserva de turnos"],
  icons: {
    icon: "/icon.png",
  },
  openGraph: {
    title: "New Brothers | Barbería Premium en Uruguay",
    description: "La evolución de la barbería clásica. Reservá tu experiencia online.",
    type: "website",
    locale: "es_UY",
    siteName: "New Brothers",
  },
  twitter: {
    card: "summary_large_image",
    title: "New Brothers | Barbería Premium en Uruguay",
    description: "Reservá tu experiencia premium de barbería online.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Barbershop",
  name: BUSINESS_CONFIG.name,
  description: "New Brothers: barbería premium en Uruguay. Reservá tu turno online para corte de cabello, barba y cuidado personal masculino.",
  image: `${SITE_URL}/opengraph-image`,
  telephone: BUSINESS_CONFIG.phone,
  address: {
    "@type": "PostalAddress",
    streetAddress: "Av. Principal 1234",
    addressLocality: "Centro",
    addressCountry: "UY",
  },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: BUSINESS_CONFIG.workingDays.map(
      (d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]
    ),
    opens: `${String(BUSINESS_CONFIG.workingHours.start).padStart(2, "0")}:00`,
    closes: `${String(BUSINESS_CONFIG.workingHours.end).padStart(2, "0")}:00`,
  },
  sameAs: ["https://instagram.com/nbbarber"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${inter.variable} ${oswald.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <TourOverlay />
          <HelpFab />
          <AiAssistant />
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
