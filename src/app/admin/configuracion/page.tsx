"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invalidateFeatures } from "@/lib/features";
import { invalidateBusinessConfig, DAY_NAMES } from "@/lib/business-config";
import { BUSINESS_CONFIG, BANK_TRANSFER_INFO } from "@/lib/constants";
import { AlertCircle, Loader2, Settings, ShoppingBag, Repeat, Wallet, MessageSquare, Sparkles, Camera, Calendar, Users, Bot, Building2, Save, Phone, Mail, Instagram, Clock, Timer, Landmark } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-ui";

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

type BusinessFormState = {
    phone: string;
    email: string;
    instagram: string;
    hoursStart: string;
    hoursEnd: string;
    workingDays: number[];
    cancellationWindowMinutes: string;
    lateToleranceMinutes: string;
    bankName: string;
    bankAccount: string;
    bankHolder: string;
};

const BUSINESS_DEFAULTS_FORM: BusinessFormState = {
    phone: BUSINESS_CONFIG.phone,
    email: BUSINESS_CONFIG.email,
    instagram: BUSINESS_CONFIG.instagram,
    hoursStart: String(BUSINESS_CONFIG.workingHours.start),
    hoursEnd: String(BUSINESS_CONFIG.workingHours.end),
    workingDays: [...BUSINESS_CONFIG.workingDays],
    cancellationWindowMinutes: String(BUSINESS_CONFIG.cancellationWindow),
    lateToleranceMinutes: String(BUSINESS_CONFIG.lateToleranceMinutes),
    bankName: BANK_TRANSFER_INFO.bank,
    bankAccount: BANK_TRANSFER_INFO.account,
    bankHolder: BANK_TRANSFER_INFO.holder,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Aplica una fila de app_settings (business.%) sobre el form, sin tocar lo que no matchea. */
function applyBusinessRow(form: BusinessFormState, key: string, value: unknown): BusinessFormState {
    const name = key.replace("business.", "");
    switch (name) {
        case "phone":
            return typeof value === "string" ? { ...form, phone: value } : form;
        case "email":
            return typeof value === "string" ? { ...form, email: value } : form;
        case "instagram":
            return typeof value === "string" ? { ...form, instagram: value } : form;
        case "working_hours":
            if (value && typeof value === "object" && "start" in value && "end" in value) {
                const v = value as { start: number; end: number };
                return { ...form, hoursStart: String(v.start), hoursEnd: String(v.end) };
            }
            return form;
        case "working_days":
            return Array.isArray(value) ? { ...form, workingDays: value.map((d) => Number(d)) } : form;
        case "cancellation_window_minutes":
            return value !== null && value !== undefined ? { ...form, cancellationWindowMinutes: String(value) } : form;
        case "late_tolerance_minutes":
            return value !== null && value !== undefined ? { ...form, lateToleranceMinutes: String(value) } : form;
        case "bank_transfer":
            if (value && typeof value === "object") {
                const v = value as { bank?: string; account?: string; holder?: string };
                return { ...form, bankName: v.bank ?? "", bankAccount: v.account ?? "", bankHolder: v.holder ?? "" };
            }
            return form;
        default:
            return form;
    }
}

function BusinessSettingsCard() {
    const supabase = useMemo(() => createClient(), []);
    const [form, setForm] = useState<BusinessFormState>(BUSINESS_DEFAULTS_FORM);
    const [initialForm, setInitialForm] = useState<BusinessFormState>(BUSINESS_DEFAULTS_FORM);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let active = true;

        async function loadBusinessSettings() {
            setIsLoading(true);
            try {
                const { data, error } = await supabase
                    .from("app_settings")
                    .select("key, value")
                    .like("key", "business.%");

                if (error) {
                    toast.error("Error al cargar los datos del negocio.");
                    console.error(error);
                    return;
                }

                if (!active) return;

                let loaded = BUSINESS_DEFAULTS_FORM;
                (data || []).forEach((row: { key: string; value: unknown }) => {
                    loaded = applyBusinessRow(loaded, row.key, row.value);
                });
                setForm(loaded);
                setInitialForm(loaded);
            } catch (err) {
                console.error("Error fetching business settings:", err);
                toast.error("Error de conexión al cargar los datos del negocio.");
            } finally {
                if (active) setIsLoading(false);
            }
        }

        loadBusinessSettings();
        return () => {
            active = false;
        };
    }, [supabase]);

    const toggleDay = (day: number) => {
        setForm((prev) => ({
            ...prev,
            workingDays: prev.workingDays.includes(day)
                ? prev.workingDays.filter((d) => d !== day)
                : [...prev.workingDays, day].sort((a, b) => a - b),
        }));
    };

    const hoursStartNum = Number(form.hoursStart);
    const hoursEndNum = Number(form.hoursEnd);
    const windowNum = Number(form.cancellationWindowMinutes);
    const toleranceNum = Number(form.lateToleranceMinutes);

    const errors: Partial<Record<keyof BusinessFormState, string>> = {};
    if (Number.isNaN(hoursStartNum) || Number.isNaN(hoursEndNum)) {
        errors.hoursEnd = "Ingresá horas válidas";
    } else if (hoursEndNum <= hoursStartNum) {
        errors.hoursEnd = "El cierre tiene que ser después de la apertura";
    }
    if (Number.isNaN(windowNum) || windowNum < 0) {
        errors.cancellationWindowMinutes = "Ingresá un número igual o mayor a 0";
    }
    if (Number.isNaN(toleranceNum) || toleranceNum < 0) {
        errors.lateToleranceMinutes = "Ingresá un número igual o mayor a 0";
    }
    if (form.email.trim() && !EMAIL_REGEX.test(form.email.trim())) {
        errors.email = "Ingresá un email válido";
    }

    const hasErrors = Object.keys(errors).length > 0;
    const hasChanges = JSON.stringify(form) !== JSON.stringify(initialForm);

    const handleSave = async () => {
        if (hasErrors) {
            toast.error("Revisá los campos marcados antes de guardar.");
            return;
        }

        setIsSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const now = new Date().toISOString();

            const rows = [
                { key: "business.phone", value: form.phone.trim() },
                { key: "business.email", value: form.email.trim() },
                { key: "business.instagram", value: form.instagram.trim() },
                { key: "business.working_hours", value: { start: hoursStartNum, end: hoursEndNum } },
                { key: "business.working_days", value: form.workingDays },
                { key: "business.cancellation_window_minutes", value: windowNum },
                { key: "business.late_tolerance_minutes", value: toleranceNum },
                {
                    key: "business.bank_transfer",
                    value: { bank: form.bankName.trim(), account: form.bankAccount.trim(), holder: form.bankHolder.trim() },
                },
            ].map((row) => ({ ...row, updated_at: now, updated_by: user?.id || null }));

            const { error } = await supabase.from("app_settings").upsert(rows, { onConflict: "key" });

            if (error) {
                toast.error("No se pudieron guardar los datos del negocio.");
                console.error(error);
                return;
            }

            toast.success("Datos del negocio actualizados con éxito.");
            setInitialForm(form);
            invalidateBusinessConfig();
        } catch (err) {
            console.error("Error saving business settings:", err);
            toast.error("Ocurrió un error al guardar los cambios.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <details open className="group rounded-2xl border border-border bg-card/70 md:rounded-none md:border-0 md:bg-transparent">
            <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 md:hidden">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-foreground">Datos del negocio</span>
                    <span className="text-xs text-muted-foreground">Contacto, horarios y políticas</span>
                </span>
                <span className="text-lg text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <Card id="business-settings-card" className="rounded-none border-0 bg-transparent shadow-none md:rounded-xl md:border md:border-border md:bg-card/50 md:shadow-sm md:backdrop-blur-md">
            <CardHeader className="hidden flex-row items-center gap-4 md:flex">
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 text-primary">
                    <Building2 className="h-6 w-6" />
                </div>
                <div className="space-y-0.5">
                    <CardTitle className="text-lg font-bold text-foreground">Datos del negocio</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                        Contacto, horario de copy, política de cancelación y datos bancarios. Se reflejan en el sitio sin deploy.
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent className="border-t border-border/60 p-4 md:border-t-0 md:p-6">
                {isLoading ? (
                    <div className="flex items-center justify-center py-10">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="business-phone" className="text-xs text-muted-foreground">
                                    <Phone className="h-3.5 w-3.5 text-primary" /> Teléfono
                                </Label>
                                <Input
                                    id="business-phone"
                                    value={form.phone}
                                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                                    placeholder="+598 99 123 456"
                                />
                                <p className="text-[11px] text-muted-foreground">Se usa para los botones de WhatsApp.</p>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="business-email" className="text-xs text-muted-foreground">
                                    <Mail className="h-3.5 w-3.5 text-primary" /> Email
                                </Label>
                                <Input
                                    id="business-email"
                                    value={form.email}
                                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                                    placeholder="contacto@nbbarber.com"
                                    aria-invalid={Boolean(errors.email)}
                                />
                                {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="business-instagram" className="text-xs text-muted-foreground">
                                    <Instagram className="h-3.5 w-3.5 text-primary" /> Instagram
                                </Label>
                                <Input
                                    id="business-instagram"
                                    value={form.instagram}
                                    onChange={(e) => setForm((prev) => ({ ...prev, instagram: e.target.value }))}
                                    placeholder="@newbrothers.uy"
                                />
                            </div>
                        </div>

                        <div className="space-y-3 border-t border-border pt-5">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                <Clock className="h-3.5 w-3.5 text-primary" /> Horario de atención (copy)
                            </Label>
                            <div className="grid grid-cols-2 gap-4 sm:max-w-xs">
                                <div className="space-y-1.5">
                                    <Label htmlFor="business-hours-start" className="text-xs text-muted-foreground">Apertura</Label>
                                    <Input
                                        id="business-hours-start"
                                        type="number"
                                        min={0}
                                        max={23}
                                        value={form.hoursStart}
                                        onChange={(e) => setForm((prev) => ({ ...prev, hoursStart: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="business-hours-end" className="text-xs text-muted-foreground">Cierre</Label>
                                    <Input
                                        id="business-hours-end"
                                        type="number"
                                        min={0}
                                        max={23}
                                        value={form.hoursEnd}
                                        onChange={(e) => setForm((prev) => ({ ...prev, hoursEnd: e.target.value }))}
                                        aria-invalid={Boolean(errors.hoursEnd)}
                                    />
                                </div>
                            </div>
                            {errors.hoursEnd && <p className="text-[11px] text-destructive">{errors.hoursEnd}</p>}
                            <div className="flex flex-wrap gap-2 pt-1">
                                {DAY_NAMES.map((name, index) => {
                                    const active = form.workingDays.includes(index);
                                    return (
                                        <button
                                            key={index}
                                            type="button"
                                            onClick={() => toggleDay(index)}
                                            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${active
                                                ? "border-primary bg-primary/15 text-primary"
                                                : "border-border bg-muted text-muted-foreground hover:text-foreground"
                                                }`}
                                        >
                                            {name.slice(0, 3)}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Es el horario que se muestra en el sitio; la disponibilidad real se gestiona por barbero y sucursal.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label htmlFor="business-window" className="text-xs text-muted-foreground">
                                    <Timer className="h-3.5 w-3.5 text-primary" /> Ventana de cancelación (minutos)
                                </Label>
                                <Input
                                    id="business-window"
                                    type="number"
                                    min={0}
                                    value={form.cancellationWindowMinutes}
                                    onChange={(e) => setForm((prev) => ({ ...prev, cancellationWindowMinutes: e.target.value }))}
                                    aria-invalid={Boolean(errors.cancellationWindowMinutes)}
                                />
                                {errors.cancellationWindowMinutes ? (
                                    <p className="text-[11px] text-destructive">{errors.cancellationWindowMinutes}</p>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        El cliente puede cancelar hasta X minutos antes; se aplica también en el servidor.
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="business-tolerance" className="text-xs text-muted-foreground">
                                    <Timer className="h-3.5 w-3.5 text-primary" /> Tolerancia de llegada (minutos)
                                </Label>
                                <Input
                                    id="business-tolerance"
                                    type="number"
                                    min={0}
                                    value={form.lateToleranceMinutes}
                                    onChange={(e) => setForm((prev) => ({ ...prev, lateToleranceMinutes: e.target.value }))}
                                    aria-invalid={Boolean(errors.lateToleranceMinutes)}
                                />
                                {errors.lateToleranceMinutes && (
                                    <p className="text-[11px] text-destructive">{errors.lateToleranceMinutes}</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 border-t border-border pt-5">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                <Landmark className="h-3.5 w-3.5 text-primary" /> Datos bancarios
                            </Label>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="business-bank-name" className="text-xs text-muted-foreground">Banco</Label>
                                    <Input
                                        id="business-bank-name"
                                        value={form.bankName}
                                        onChange={(e) => setForm((prev) => ({ ...prev, bankName: e.target.value }))}
                                        placeholder="Ej: BROU"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="business-bank-account" className="text-xs text-muted-foreground">Cuenta</Label>
                                    <Input
                                        id="business-bank-account"
                                        value={form.bankAccount}
                                        onChange={(e) => setForm((prev) => ({ ...prev, bankAccount: e.target.value }))}
                                        placeholder="Número de cuenta"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="business-bank-holder" className="text-xs text-muted-foreground">Titular</Label>
                                    <Input
                                        id="business-bank-holder"
                                        value={form.bankHolder}
                                        onChange={(e) => setForm((prev) => ({ ...prev, bankHolder: e.target.value }))}
                                        placeholder="Nombre del titular"
                                    />
                                </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Si están vacíos, el checkout ofrece coordinar por WhatsApp.
                            </p>
                        </div>

                        <div className="flex justify-end border-t border-border pt-5">
                            <Button onClick={handleSave} disabled={!hasChanges || hasErrors || isSaving} className="gap-2">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Guardar cambios
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
            </Card>
        </details>
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
            <AdminPageHeader
                eyebrow="Sistema"
                title="Configuración"
                icon={Settings}
                description="Datos del negocio y módulos activos de la barbería, editables en tiempo real."
            />

            {/* Advertencia de Caché */}
            <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground backdrop-blur-md">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                    <span className="font-semibold block text-foreground">Importante sobre la sincronización</span>
                    Los cambios pueden tardar hasta 5 minutos en reflejarse para visitantes externos que tengan la página abierta en este momento, debido a la caché de rendimiento.
                </div>
            </div>

            <BusinessSettingsCard />

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
                            <div key={item.key} className="contents">
                            <details className="group rounded-2xl border border-border bg-card/70 md:hidden">
                                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                                    <span className="min-w-0 flex-1"><span className="block font-semibold text-foreground">{title}</span><span className={item.value ? "text-xs font-semibold text-primary" : "text-xs text-muted-foreground"}>{item.value ? "Activo" : "Inactivo"}</span></span>
                                    <span className="text-lg text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                                </summary>
                                <div className="border-t border-border/60 p-4">
                                    <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                                    <div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estado del módulo</span><div className="flex items-center gap-2">{isUpdating && <Loader2 className="h-4 w-4 animate-spin text-primary" />}<Switch checked={item.value} onCheckedChange={() => handleToggle(item.key, item.value)} disabled={isUpdating} aria-label={`${item.value ? "Desactivar" : "Activar"} ${title}`} /></div></div>
                                </div>
                            </details>
                            <Card className="group relative hidden overflow-hidden border-border bg-card/50 transition-[border-color,box-shadow,transform] duration-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 md:flex">
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
                                                        aria-label={`${item.value ? "Desactivar" : "Activar"} ${title}`}
                                                        className="data-[state=checked]:bg-primary"
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </div>
                                </div>
                            </Card>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
