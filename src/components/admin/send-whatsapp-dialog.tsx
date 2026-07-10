"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MessageSquare, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { normalizeUyPhone, fillTemplate, buildWaLink } from "@/lib/whatsapp";
import { MESSAGE_EVENT_LABELS } from "@/lib/constants";
import type { RemindersConfig, MessageTemplate } from "@/types/database.types";

interface SendWhatsappDialogProps {
    clientId?: string;
    clientName: string;
    clientPhone: string | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onLogAdded?: () => void;
    /** Si se provee, el diálogo carga plantillas de message_templates para ese evento en vez de reminders_config. */
    eventType?: string;
    /** Diccionario completo de variables ({nombre} {fecha} {hora} {barbero} {servicio} {sucursal}) para precargar el mensaje del evento. */
    templateVars?: Record<string, string>;
    /** Cita de origen del aviso, se guarda en communication_logs.metadata para trazabilidad. */
    appointmentId?: string;
}

export function SendWhatsappDialog({
    clientId,
    clientName,
    clientPhone,
    isOpen,
    onOpenChange,
    onLogAdded,
    eventType,
    templateVars,
    appointmentId,
}: SendWhatsappDialogProps) {
    const [templates, setTemplates] = useState<RemindersConfig[]>([]);
    const [eventTemplates, setEventTemplates] = useState<MessageTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("custom");
    const [message, setMessage] = useState("");
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const supabase = createClient();

    const normalizedPhone = normalizeUyPhone(clientPhone);
    const isPhoneValid = !!normalizedPhone;

    // Cargar plantillas: de message_templates si hay eventType, si no las de reminders_config (comportamiento clásico)
    useEffect(() => {
        if (!isOpen) return;

        async function loadTemplates() {
            setIsLoadingTemplates(true);

            if (eventType) {
                const { data, error } = await supabase
                    .from("message_templates")
                    .select("*")
                    .eq("event_type", eventType)
                    .eq("is_active", true)
                    .order("sort_order");

                if (error) {
                    console.error("Error loading message templates:", error);
                    toast.error("Error al cargar las plantillas de mensaje");
                    setEventTemplates([]);
                } else {
                    const rows = data || [];
                    setEventTemplates(rows);
                    if (rows.length > 0) {
                        setSelectedTemplateId(rows[0].id);
                        setMessage(fillTemplate(rows[0].body, { nombre: clientName, ...templateVars }));
                    } else {
                        setSelectedTemplateId("custom");
                        setMessage("");
                    }
                }
            } else {
                const { data, error } = await supabase
                    .from("reminders_config")
                    .select("*")
                    .order("days_since_last_visit");

                if (error) {
                    console.error("Error loading templates:", error);
                    toast.error("Error al cargar las plantillas de mensaje");
                } else {
                    setTemplates(data || []);
                }
                setSelectedTemplateId("custom");
                setMessage("");
            }

            setIsLoadingTemplates(false);
        }

        loadTemplates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, supabase, eventType]);

    // Al cambiar la plantilla seleccionada
    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplateId(templateId);
        if (templateId === "custom") {
            setMessage("");
            return;
        }

        if (eventType) {
            const template = eventTemplates.find((t) => t.id === templateId);
            if (template) {
                setMessage(fillTemplate(template.body, { nombre: clientName, ...templateVars }));
            }
            return;
        }

        const template = templates.find((t) => t.id === templateId);
        if (template) {
            const filled = fillTemplate(template.message_template, { nombre: clientName });
            setMessage(filled);
        }
    };

    const handleSend = async () => {
        if (!message.trim()) {
            toast.error("Escribí un mensaje antes de enviar");
            return;
        }

        if (!isPhoneValid || !clientPhone) {
            toast.error("Número de teléfono no válido");
            return;
        }

        setIsSubmitting(true);

        try {
            // Abrir link de WhatsApp en nueva pestaña
            const waLink = buildWaLink(clientPhone, message);
            window.open(waLink, "_blank");

            // Registrar en logs de comunicación
            const logData = {
                client_id: clientId || null,
                client_name: clientName,
                client_phone: normalizedPhone,
                message_sent: message,
                status: "sent" as const, // Admitido en CHECK
                metadata: eventType
                    ? {
                        source: "appointment_event",
                        event_type: eventType,
                        appointment_id: appointmentId || null,
                        template_id: selectedTemplateId !== "custom" ? selectedTemplateId : null,
                    }
                    : {
                        source: "manual",
                        template_id: selectedTemplateId !== "custom" ? selectedTemplateId : null,
                    },
            };

            const { error } = await supabase
                .from("communication_logs")
                .insert(logData);

            if (error) {
                console.error("Error logging message:", error);
                toast.error("Se abrió WhatsApp, pero no pudimos registrar el log de envío");
            } else {
                toast.success("¡Mensaje de WhatsApp abierto y log registrado!");
                if (onLogAdded) onLogAdded();
                onOpenChange(false);
            }
        } catch (err) {
            console.error(err);
            toast.error("Ocurrió un error al procesar el mensaje");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-card/95 border-border/50 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-foreground">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        Enviar Mensaje de WhatsApp
                    </DialogTitle>
                    <DialogDescription>
                        {eventType
                            ? `Revisá el mensaje de ${MESSAGE_EVENT_LABELS[eventType]?.toLowerCase() || "aviso"} antes de enviarlo a ${clientName}.`
                            : `Elegí una plantilla o redactá un mensaje personalizado para enviar a ${clientName}.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Advertencia de teléfono no válido */}
                    {!isPhoneValid && (
                        <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-semibold">Teléfono no válido</p>
                                <p className="text-xs text-red-400/80">
                                    El número provisto (&quot;{clientPhone || "Vacío"}&quot;) no coincide con el formato uruguayo (ej: 099 123 456).
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Selector de Plantilla */}
                    <div className="space-y-2">
                        <Label htmlFor="template" className="text-foreground/80">Plantilla de Mensaje</Label>
                        <Select
                            value={selectedTemplateId}
                            onValueChange={handleTemplateChange}
                            disabled={isLoadingTemplates}
                        >
                            <SelectTrigger id="template" className="bg-background/50 border-input/50 focus:ring-0">
                                <SelectValue placeholder="Seleccioná una plantilla…" />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-foreground">
                                <SelectItem value="custom">Mensaje Personalizado (Vacío)</SelectItem>
                                {eventType
                                    ? eventTemplates.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            {t.name}
                                        </SelectItem>
                                    ))
                                    : templates.map((t) => (
                                        <SelectItem key={t.id} value={t.id}>
                                            Inactividad {t.days_since_last_visit} días {t.is_active ? "" : "(Inactiva)"}
                                        </SelectItem>
                                    ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Mensaje Textarea */}
                    <div className="space-y-2">
                        <Label htmlFor="message" className="text-foreground/80">Mensaje</Label>
                        <Textarea
                            id="message"
                            placeholder="Escribí el mensaje…"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="min-h-[120px] bg-background/50 border-input/50 focus:border-primary/50"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-border/20 pt-4">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-foreground hover:bg-accent"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={isSubmitting || !isPhoneValid || !message.trim()}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            "Abrir WhatsApp"
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
