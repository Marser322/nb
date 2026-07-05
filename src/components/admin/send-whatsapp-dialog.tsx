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
import type { RemindersConfig } from "@/types/database.types";

interface SendWhatsappDialogProps {
    clientId?: string;
    clientName: string;
    clientPhone: string | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onLogAdded?: () => void;
}

export function SendWhatsappDialog({
    clientId,
    clientName,
    clientPhone,
    isOpen,
    onOpenChange,
    onLogAdded,
}: SendWhatsappDialogProps) {
    const [templates, setTemplates] = useState<RemindersConfig[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("custom");
    const [message, setMessage] = useState("");
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const supabase = createClient();

    const normalizedPhone = normalizeUyPhone(clientPhone);
    const isPhoneValid = !!normalizedPhone;

    // Cargar plantillas
    useEffect(() => {
        if (!isOpen) return;

        async function loadTemplates() {
            setIsLoadingTemplates(true);
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
            setIsLoadingTemplates(false);
        }

        loadTemplates();
        setSelectedTemplateId("custom");
        setMessage("");
    }, [isOpen, supabase]);

    // Al cambiar la plantilla seleccionada
    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplateId(templateId);
        if (templateId === "custom") {
            setMessage("");
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
                metadata: {
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
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <MessageSquare className="h-5 w-5 text-primary" />
                        Enviar Mensaje de WhatsApp
                    </DialogTitle>
                    <DialogDescription>
                        Elegí una plantilla o redactá un mensaje personalizado para enviar a {clientName}.
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
                        <Label htmlFor="template" className="text-white/80">Plantilla de Mensaje</Label>
                        <Select
                            value={selectedTemplateId}
                            onValueChange={handleTemplateChange}
                            disabled={isLoadingTemplates}
                        >
                            <SelectTrigger id="template" className="bg-background/50 border-input/50 focus:ring-0">
                                <SelectValue placeholder="Seleccioná una plantilla..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-border/50 text-white">
                                <SelectItem value="custom">Mensaje Personalizado (Vacío)</SelectItem>
                                {templates.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                        Inactividad {t.days_since_last_visit} días {t.is_active ? "" : "(Inactiva)"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Mensaje Textarea */}
                    <div className="space-y-2">
                        <Label htmlFor="message" className="text-white/80">Mensaje</Label>
                        <Textarea
                            id="message"
                            placeholder="Escribí el mensaje..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            className="min-h-[120px] bg-background/50 border-input/50 focus:border-amber-500/50"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-border/20 pt-4">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-white hover:bg-white/5"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={isSubmitting || !isPhoneValid || !message.trim()}
                        className="bg-primary hover:bg-primary/90 text-black font-semibold"
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
