"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { invalidateFeatures } from "@/lib/features";
import { AlertCircle, Loader2, Settings, ShoppingBag, Repeat, Wallet, MessageSquare, Sparkles, Camera, Calendar, Users } from "lucide-react";

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
};

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
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-400 text-sm flex items-start gap-3 backdrop-blur-md">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
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
                        const isUpdating = updatingKeys.has(item.key);

                        return (
                            <Card key={item.key} className="border-border bg-card/50 backdrop-blur-md relative overflow-hidden group hover:border-primary/20 transition-all duration-300">
                                <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <Icon className="h-24 w-24 text-primary" />
                                </div>
                                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                                    <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/20">
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <CardTitle className="text-lg text-foreground font-bold">{title}</CardTitle>
                                        <CardDescription className="text-xs text-zinc-500 font-mono">
                                            {item.key}
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-2">
                                    <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                                        {item.description}
                                    </p>
                                    <div className="flex items-center justify-between border-t border-border pt-4">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Estado del módulo
                                        </span>
                                        <div className="flex items-center gap-3">
                                            {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                                            <span className={`text-xs font-bold transition-colors ${item.value ? "text-primary text-glow" : "text-zinc-500"}`}>
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
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
