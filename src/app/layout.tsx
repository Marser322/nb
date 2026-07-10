import type { Metadata, Viewport } from "next";
import { Inter, Oswald } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TourOverlay } from "@/components/tour/TourOverlay";
import { HelpFab } from "@/components/tour/HelpFab";
import { AiAssistant } from "@/components/chat/AiAssistant";
import { ThemeProvider } from "@/components/theme-provider";
import { VisualSkinInitScript } from "@/components/admin/VisualSkinInitScript";
import { BUSINESS_CONFIG } from "@/lib/constants";
import { getBusinessConfigServer, type BusinessConfig } from "@/lib/business-config-shared";
import { createClient } from "@/lib/supabase/server";
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

/** name/location son branding fijo (no editable); el resto sale de la config vigente. */
function buildJsonLd(config: BusinessConfig) {
  return {
    "@context": "https://schema.org",
    "@type": "Barbershop",
    name: BUSINESS_CONFIG.name,
    description: "New Brothers: barbería premium en Uruguay. Reservá tu turno online para corte de cabello, barba y cuidado personal masculino.",
    image: `${SITE_URL}/opengraph-image`,
    telephone: config.phone,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Av. Principal 1234",
      addressLocality: "Centro",
      addressCountry: "UY",
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: config.workingDays.map(
        (d) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]
      ),
      opens: `${String(config.workingHours.start).padStart(2, "0")}:00`,
      closes: `${String(config.workingHours.end).padStart(2, "0")}:00`,
    },
    sameAs: ["https://instagram.com/nbbarber"],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El JSON-LD nunca debe romper el render: ante cualquier falla (DB, red,
  // migración 027 sin correr todavía) cae a BUSINESS_CONFIG (DEFAULTS).
  let businessConfig: BusinessConfig;
  try {
    const supabase = await createClient();
    businessConfig = await getBusinessConfigServer(supabase);
  } catch (err) {
    console.error("Error fetching business config for JSON-LD, using defaults:", err);
    businessConfig = {
      phone: BUSINESS_CONFIG.phone,
      email: BUSINESS_CONFIG.email,
      instagram: BUSINESS_CONFIG.instagram,
      workingHours: BUSINESS_CONFIG.workingHours,
      workingDays: BUSINESS_CONFIG.workingDays,
      cancellationWindowMinutes: BUSINESS_CONFIG.cancellationWindow,
      lateToleranceMinutes: BUSINESS_CONFIG.lateToleranceMinutes,
      bankTransfer: { bank: "", account: "", holder: "" },
    };
  }
  const jsonLd = buildJsonLd(businessConfig);

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <VisualSkinInitScript />
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
