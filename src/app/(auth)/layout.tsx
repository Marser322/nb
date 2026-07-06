import Image from "next/image";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen w-full flex bg-background text-foreground">
            {/* Sector Imagen (Desktop) - Izquierda */}
            <div className="hidden lg:relative lg:block lg:w-1/2 overflow-hidden bg-card border-r border-border">
                {/* Imagen de fondo */}
                <Image
                    src="/images/hero/detalle-corte.jpg"
                    alt="Interior Barbería NB"
                    fill
                    className="object-cover opacity-60 mix-blend-overlay"
                    priority
                    sizes="50vw"
                />

                {/* Degradados y Overlays */}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                <div className="absolute inset-0 bg-noise opacity-20" />

                {/* Contenido en Imagen */}
                <div className="absolute bottom-0 left-0 right-0 p-12 text-white z-20">
                    <h2 className="text-4xl font-bold mb-4 tracking-tight drop-shadow-md">
                        Tu Estilo, <br />
                        <span className="text-primary text-glow">Nuestra Pasión.</span>
                    </h2>
                    <blockquote className="text-lg text-zinc-300 italic border-l-2 border-primary pl-4 max-w-md">
                        &quot;La excelencia en el cuidado personal comienza aquí.&quot;
                    </blockquote>
                </div>
            </div>

            {/* Sector Formulario - Derecha */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 relative overflow-hidden">
                {/* Ambient Lights (Spotlights) */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[100px] translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                {/* Noise Texture */}
                <div className="absolute inset-0 bg-noise z-0 pointer-events-none" />

                <div className="w-full max-w-md relative z-10">
                    {children}
                </div>
            </div>
        </div>
    );
}
