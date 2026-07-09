"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { invalidateFeatures } from "@/lib/features";
import { AlertCircle, Loader2, Settings, ShoppingBag, Repeat, Wallet, MessageSquare, Sparkles, Camera, Calendar, Users, Bot } from "lucide-react";

interface AppSetting {
    key: string;
    value: boolean;
    description: string;
    updated_at?: string;
}

const FEATURE_ICONS: Record<string, typeof ShoppingBag> = {
    "feature.tienda": ShoppingBag,
    "feature.suscripciones": Repeat,
    "feature.contabilidad": Wallet,
    "feature.propinas": Sparkles,
    "feature.mensajes_crm": MessageSquare,
    "feature.lookbook": Camera,
    "feature.reservas_online": Calendar,
    "feature.portal_barbero": Users,
    "feature.chat_aprendizaje": Bot,
};

const FEATURE_TITLES: Record<string, string> = {
    "feature.tienda": "Tienda Online",
    "feature.suscripciones": "Turnos Fijos (Suscripciones)",
    "feature.contabilidad": "Módulo Contable y Caja",
    "feature.propinas": "Propinas",
    "feature.mensajes_crm": "Mensajes CRM y WhatsApp",
    "feature.lookbook": "Galería de Estilos (Lookbook)",
    "feature.reservas_online": "Reservas Online (Wizard)",
    "feature.portal_barbero": "Portal de Barberos (Agenda)",
    "feature.chat_aprendizaje": "Auto-aprendizaje del Asistente IA",
};

const FEATURE_IMAGES: Record<string, string> = {
    "feature.tienda": "/images/modulos/tienda.webp",
    "feature.suscripciones": "/images/modulos/suscripciones.webp",
    "feature.contabilidad": "/images/modulos/contabilidad.webp",
    "feature.propinas": "/images/modulos/propinas.webp",
    "feature.mensajes_crm": "/images/modulos/mensajes.webp",
    "feature.lookbook": "/images/modulos/lookbook.webp",
    "feature.reservas_online": "/images/modulos/reservas.webp",
    "feature.portal_barbero": "/images/modulos/portal-barbero.webp",
    // No hay asset propio para este módulo y el componente no tiene fallback de imagen; reusamos mensajes.webp.
    "feature.chat_aprendizaje": "/images/modulos/mensajes.webp",
};

function FeatureModuleArtwork({
    imageSrc,
    imageAlt,
    Icon,
}: {
    imageSrc?: string;
    imageAlt: string;
    Icon: typeof ShoppingBag;
}) {
    const [imageFailed, setImageFailed] = useState(false);
    const showImage = imageSrc && !imageFailed;

    return (
        <div className="relative min-h-40 overflow-hidden border-b border-border bg-muted sm:min-h-full sm:border-b-0 sm:border-r">
            {showImage ? (
                <Image
                    src={imageSrc}
                    alt={imageAlt}
                    fill
                    unoptimized
                    sizes="(max-width: 640px) 100vw, 180px"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={() => setImageFailed(true)}
                />
            ) : (
                <div className="flex h-full min-h-40 items-center justify-center bg-primary/10">
                    <Icon className="h-12 w-12 text-primary/70" />
                </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent sm:bg-gradient-to-r" />
            <div className="absolute inset-x-5 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
        </div>
    );
}

export default function AdminConfiguracionPage() {
    const supabase = useMemo(() => createClient(), []);
    const [settings, setSettings] = useState<AppSetting[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from("app_settings")
                .select("key, value, description")
                .like("key", "feature.%")
                .order("key");

            if (error) {
                toast.error("Error al cargar la configuración.");
                console.error(error);
                return;
            }

            if (data) {
                const mappedSettings = (data as { key: string; value: unknown; description: string | null }[]).map((item) => ({
                    key: item.key,
                    value: item.value === true || item.value === "true",
                    description: item.description || "",
                }));
                setSettings(mappedSettings);
            }
        } catch (err) {
            console.error("Error fetching settings:", err);
            toast.error("Error de conexión al cargar la configuración.");
        } finally {
            setIsLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleToggle = async (key: string, currentValue: boolean) => {
        setUpdatingKeys((prev) => {
            const next = new Set(prev);
            next.add(key);
            return next;
        });

        const newValue = !currentValue;

        try {
            const { data: { user } } = await supabase.auth.getUser();

            const { error } = await supabase
                .from("app_settings")
                .update({
                    value: newValue,
                    updated_at: new Date().toISOString(),
                    updated_by: user?.id || null,
                })
                .eq("key", key);

            if (error) {
                toast.error("No se pudo actualizar la configuración.");
                console.error(error);
                return;
            }

            toast.success(`Módulo ${newValue ? "activado" : "desactivado"} con éxito.`);
            
            // Actualizar estado local
            setSettings((prev) =>
                prev.map((item) => (item.key === key ? { ...item, value: newValue } : item))
            );

            // Invalidar caché local de features para actualizar la UI del admin de inmediato
            invalidateFeatures();
        } catch (err) {
            console.error("Error updating setting:", err);
            toast.error("Ocurrió un error al guardar los cambios.");
        } finally {
            setUpdatingKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <Settings className="h-8 w-8 text-primary" />
                    Configuración de Módulos
                </h1>
                <p className="text-muted-foreground">
                    Activá o desactivá módulos y características de la barbería en tiempo real.
                </p>
            </div>

            {/* Advertencia de Caché */}
            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground backdrop-blur-md">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                    <span className="font-semibold block text-foreground">Importante sobre la sincronización</span>
                    Los cambios pueden tardar hasta 5 minutos en reflejarse para visitantes externos que tengan la página abierta en este momento, debido a la caché de rendimiento.
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : (
                <div id="features-gating-card" className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {settings.map((item) => {
                        const Icon = FEATURE_ICONS[item.key] || Settings;
                        const title = FEATURE_TITLES[item.key] || item.key;
                        const imageSrc = FEATURE_IMAGES[item.key];
                        const isUpdating = updatingKeys.has(item.key);

                        return (
                            <Card key={item.key} className="group relative overflow-hidden border-border bg-card/50 backdrop-blur-md transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10">
                                <div className="grid h-full sm:grid-cols-[170px_1fr]">
                                    <FeatureModuleArtwork imageSrc={imageSrc} imageAlt={`Miniatura del módulo ${title}`} Icon={Icon} />
                                    <div className="flex flex-col">
                                        <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                            <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary">
                                                <Icon className="h-6 w-6" />
                                            </div>
                                            <div className="space-y-0.5">
                                                <CardTitle className="text-lg font-bold text-foreground">{title}</CardTitle>
                                                <CardDescription className="font-mono text-xs text-muted-foreground">
                                                    {item.key}
                                                </CardDescription>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="flex flex-1 flex-col pt-2">
                                            <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                                                {item.description}
                                            </p>
                                            <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
                                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                                    Estado del módulo
                                                </span>
                                                <div className="flex items-center gap-3">
                                                    {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                                    <span className={`text-xs font-bold transition-colors ${item.value ? "text-primary text-glow" : "text-muted-foreground"}`}>
                                                        {item.value ? "ACTIVO" : "INACTIVO"}
                                                    </span>
                                                    <Switch
                                                        checked={item.value}
                                                        onCheckedChange={() => handleToggle(item.key, item.value)}
                                                        disabled={isUpdating}
                                                        className="data-[state=checked]:bg-primary"
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
