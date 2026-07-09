"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { MessageCircle, Plus, Loader2, Edit2, Search, Trash2, Calendar, ClipboardList, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
    COMMUNICATION_STATUS_COLORS,
    COMMUNICATION_STATUS_LABELS,
    MESSAGE_EVENT_TYPES,
    MESSAGE_EVENT_LABELS,
} from "@/lib/constants";
import type { CommunicationLog, RemindersConfig, MessageTemplate } from "@/types/database.types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

type CommunicationLogMetadata = { event_type?: string; source?: string; template_id?: string | null; appointment_id?: string | null };

export default function AdminMensajesPage() {
    const { features, isLoaded } = useFeatures();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && !features.mensajes_crm) {
            toast.error("El módulo de mensajes CRM no está activo");
            router.replace("/admin/dashboard");
        }
    }, [isLoaded, features.mensajes_crm, router]);

    // State for Logs
    const [logs, setLogs] = useState<CommunicationLog[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLogsLoading, setIsLogsLoading] = useState(true);

    // State for Templates
    const [templates, setTemplates] = useState<RemindersConfig[]>([]);
    const [isTemplatesLoading, setIsTemplatesLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<RemindersConfig | null>(null);
    const [formData, setFormData] = useState({
        days_since_last_visit: "",
        message_template: "",
        is_active: true,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // State for event templates (message_templates)
    const [eventTemplates, setEventTemplates] = useState<MessageTemplate[]>([]);
    const [isEventTemplatesLoading, setIsEventTemplatesLoading] = useState(true);
    const [isEventDialogOpen, setIsEventDialogOpen] = useState(false);
    const [editingEventTemplate, setEditingEventTemplate] = useState<MessageTemplate | null>(null);
    const [eventFormData, setEventFormData] = useState({
        event_type: "cancelled",
        name: "",
        body: "",
        is_active: true,
    });
    const [isEventSubmitting, setIsEventSubmitting] = useState(false);

    const supabase = useMemo(() => createClient(), []);

    // 1. Cargar logs
    const loadLogs = useCallback(async () => {
        setIsLogsLoading(true);
        const { data, error } = await supabase
            .from("communication_logs")
            .select("*")
            .order("sent_at", { ascending: false });

        if (error) {
            console.error("Error loading logs:", error);
            toast.error("Error al cargar el historial de mensajes");
        } else if (data) {
            setLogs(data);
        }
        setIsLogsLoading(false);
    }, [supabase]);

    // 2. Cargar plantillas
    const loadTemplates = useCallback(async () => {
        setIsTemplatesLoading(true);
        const { data, error } = await supabase
            .from("reminders_config")
            .select("*")
            .order("days_since_last_visit");

        if (error) {
            console.error("Error loading templates:", error);
            toast.error("Error al cargar las plantillas");
        } else if (data) {
            setTemplates(data);
        }
        setIsTemplatesLoading(false);
    }, [supabase]);

    // 2b. Cargar plantillas por evento de cita
    const loadEventTemplates = useCallback(async () => {
        setIsEventTemplatesLoading(true);
        const { data, error } = await supabase
            .from("message_templates")
            .select("*")
            .order("event_type")
            .order("sort_order");

        if (error) {
            console.error("Error loading event templates:", error);
            toast.error("Error al cargar las plantillas por evento");
        } else if (data) {
            setEventTemplates(data);
        }
        setIsEventTemplatesLoading(false);
    }, [supabase]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadLogs();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadTemplates();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadEventTemplates();
    }, [loadLogs, loadTemplates, loadEventTemplates]);

    // 3. Crear / Editar plantilla
    const handleSubmitTemplate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.days_since_last_visit || !formData.message_template.trim()) {
            toast.error("Completá todos los campos obligatorios");
            return;
        }

        setIsSubmitting(true);

        const parsedDays = parseInt(formData.days_since_last_visit);

        if (editingTemplate) {
            const { error } = await supabase
                .from("reminders_config")
                .update({
                    days_since_last_visit: parsedDays,
                    message_template: formData.message_template,
                    is_active: formData.is_active,
                    channel: "whatsapp",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", editingTemplate.id);

            if (error) {
                console.error(error);
                toast.error("Error al actualizar plantilla");
            } else {
                toast.success("Plantilla actualizada con éxito");
                loadTemplates();
                setIsDialogOpen(false);
            }
        } else {
            const { error } = await supabase
                .from("reminders_config")
                .insert({
                    days_since_last_visit: parsedDays,
                    message_template: formData.message_template,
                    is_active: formData.is_active,
                    channel: "whatsapp",
                });

            if (error) {
                console.error(error);
                toast.error("Error al crear plantilla");
            } else {
                toast.success("Plantilla creada con éxito");
                loadTemplates();
                setIsDialogOpen(false);
            }
        }

        setIsSubmitting(false);
    };

    // Delete Template
    const handleDeleteTemplate = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar esta plantilla de recordatorio?")) return;

        const { error } = await supabase
            .from("reminders_config")
            .delete()
            .eq("id", id);

        if (error) {
            toast.error("Error al eliminar la plantilla");
        } else {
            toast.success("Plantilla eliminada");
            loadTemplates();
        }
    };

    // Toggle Template Active State
    const toggleTemplateActive = async (template: RemindersConfig) => {
        const { error } = await supabase
            .from("reminders_config")
            .update({ is_active: !template.is_active })
            .eq("id", template.id);

        if (error) {
            toast.error("Error al cambiar estado");
        } else {
            loadTemplates();
        }
    };

    const openEditTemplate = (t: RemindersConfig) => {
        setEditingTemplate(t);
        setFormData({
            days_since_last_visit: t.days_since_last_visit.toString(),
            message_template: t.message_template,
            is_active: t.is_active,
        });
        setIsDialogOpen(true);
    };

    const openNewTemplate = () => {
        setEditingTemplate(null);
        setFormData({
            days_since_last_visit: "",
            message_template: "",
            is_active: true,
        });
        setIsDialogOpen(true);
    };

    // 3b. Crear / Editar plantilla por evento de cita
    const handleSubmitEventTemplate = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!eventFormData.name.trim() || !eventFormData.body.trim()) {
            toast.error("Completá todos los campos obligatorios");
            return;
        }

        setIsEventSubmitting(true);

        if (editingEventTemplate) {
            const { error } = await supabase
                .from("message_templates")
                .update({
                    event_type: eventFormData.event_type,
                    name: eventFormData.name.trim(),
                    body: eventFormData.body,
                    is_active: eventFormData.is_active,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", editingEventTemplate.id);

            if (error) {
                console.error(error);
                toast.error("Error al actualizar la plantilla");
            } else {
                toast.success("Plantilla actualizada con éxito");
                loadEventTemplates();
                setIsEventDialogOpen(false);
            }
        } else {
            const { error } = await supabase
                .from("message_templates")
                .insert({
                    event_type: eventFormData.event_type,
                    name: eventFormData.name.trim(),
                    body: eventFormData.body,
                    is_active: eventFormData.is_active,
                });

            if (error) {
                console.error(error);
                toast.error("Error al crear la plantilla");
            } else {
                toast.success("Plantilla creada con éxito");
                loadEventTemplates();
                setIsEventDialogOpen(false);
            }
        }

        setIsEventSubmitting(false);
    };

    // Delete event template
    const handleDeleteEventTemplate = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar esta plantilla de evento?")) return;

        const { error } = await supabase
            .from("message_templates")
            .delete()
            .eq("id", id);

        if (error) {
            toast.error("Error al eliminar la plantilla");
        } else {
            toast.success("Plantilla eliminada");
            loadEventTemplates();
        }
    };

    // Toggle event template active state
    const toggleEventTemplateActive = async (template: MessageTemplate) => {
        const { error } = await supabase
            .from("message_templates")
            .update({ is_active: !template.is_active })
            .eq("id", template.id);

        if (error) {
            toast.error("Error al cambiar estado");
        } else {
            loadEventTemplates();
        }
    };

    const openEditEventTemplate = (t: MessageTemplate) => {
        setEditingEventTemplate(t);
        setEventFormData({
            event_type: t.event_type,
            name: t.name,
            body: t.body,
            is_active: t.is_active,
        });
        setIsEventDialogOpen(true);
    };

    const openNewEventTemplate = () => {
        setEditingEventTemplate(null);
        setEventFormData({
            event_type: "cancelled",
            name: "",
            body: "",
            is_active: true,
        });
        setIsEventDialogOpen(true);
    };

    // Filtro logs por búsqueda en memoria
    const filteredLogs = logs.filter((log) => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        const nameMatches = log.client_name?.toLowerCase().includes(query) ?? false;
        const phoneMatches = log.client_phone?.includes(query) ?? false;
        const messageMatches = log.message_sent?.toLowerCase().includes(query) ?? false;
        return nameMatches || phoneMatches || messageMatches;
    });
    if (!isLoaded || !features.mensajes_crm) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
                    <MessageCircle className="h-8 w-8 text-primary" />
                    Mensajería y Reactivación
                </h1>
                <p className="text-muted-foreground mt-1">
                    Controlá el historial de comunicaciones por WhatsApp y definí plantillas automáticas de reactivación.
                </p>
            </div>

            <Tabs defaultValue="historial" className="w-full">
                <TabsList className="bg-card/60 border border-border/40 p-1 h-11">
                    <TabsTrigger value="historial" className="gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Historial de Envíos
                    </TabsTrigger>
                    <TabsTrigger value="plantillas" className="gap-2">
                        <Calendar className="h-4 w-4" />
                        Plantillas de Recordatorio
                    </TabsTrigger>
                </TabsList>

                {/* TAB: HISTORIAL */}
                <TabsContent value="historial" className="mt-6 space-y-4">
                    {/* Búsqueda */}
                    <div className="flex items-center gap-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por cliente, teléfono o mensaje..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 bg-background/50 border-input/50 focus:border-primary/50"
                            />
                        </div>
                        <Button variant="outline" onClick={loadLogs} className="border-border hover:bg-muted">
                            Actualizar
                        </Button>
                    </div>

                    <Card className="bg-card/50 border-border/50 overflow-hidden">
                        <CardContent className="p-0">
                            {isLogsLoading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(4)].map((_, i) => (
                                        <div key={i} className="flex gap-4 animate-pulse">
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-muted/40 rounded w-1/4" />
                                                <div className="h-3 bg-muted/20 rounded w-1/2" />
                                            </div>
                                            <div className="w-20 h-4 bg-muted/30 rounded" />
                                        </div>
                                    ))}
                                </div>
                            ) : filteredLogs.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <MessageCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                                    <p className="font-semibold text-lg text-foreground/80">
                                        {searchQuery ? "No se encontraron mensajes" : "No hay registros de envío"}
                                    </p>
                                    <p className="text-sm mt-1 mb-4">
                                        {searchQuery ? "Intentá ajustando el término de búsqueda." : "Los WhatsApps iniciados manualmente quedarán asentados acá."}
                                    </p>
                                    {searchQuery ? (
                                        <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                                            Limpiar búsqueda
                                        </Button>
                                    ) : (
                                        <Button variant="outline" size="sm" onClick={() => router.push("/admin/clientes?filtro=inactivos")}>
                                            Ver Clientes Inactivos
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/10 border-b border-border/30">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-6 w-[20%]">Fecha y Hora</TableHead>
                                                <TableHead className="w-[18%]">Cliente</TableHead>
                                                <TableHead className="w-[15%]">Teléfono</TableHead>
                                                <TableHead className="w-[37%]">Mensaje</TableHead>
                                                <TableHead className="w-[10%] text-right pr-6">Estado</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredLogs.map((log) => {
                                                const eventType = (log.metadata as CommunicationLogMetadata | null)?.event_type;
                                                return (
                                                    <TableRow key={log.id} className="border-b border-border/30">
                                                        <TableCell className="text-muted-foreground text-sm pl-6 py-4">
                                                            {format(parseISO(log.sent_at), "dd/MM/yyyy HH:mm")}
                                                        </TableCell>
                                                        <TableCell className="font-semibold text-foreground">
                                                            {log.client_name || "Sin nombre"}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground font-mono text-sm">
                                                            {log.client_phone || "—"}
                                                        </TableCell>
                                                        <TableCell className="text-muted-foreground text-xs leading-normal max-w-sm break-words space-y-1.5">
                                                            {eventType && (
                                                                <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                                                                    {MESSAGE_EVENT_LABELS[eventType] || eventType}
                                                                </Badge>
                                                            )}
                                                            <p>{log.message_sent}</p>
                                                        </TableCell>
                                                        <TableCell className="text-right pr-6">
                                                            <Badge variant="outline" className={COMMUNICATION_STATUS_COLORS[log.status] || ""}>
                                                                {COMMUNICATION_STATUS_LABELS[log.status] || log.status}
                                                            </Badge>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB: PLANTILLAS */}
                <TabsContent value="plantillas" className="mt-6 space-y-10">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-foreground">Reactivación por inactividad</h2>
                            <p className="text-xs text-muted-foreground">Plantillas disparadas según los días desde el último corte.</p>
                        </div>
                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={openNewTemplate} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                                    <Plus className="mr-2 h-4 w-4" /> Nueva plantilla
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md bg-card/95 border-border/50 backdrop-blur-xl text-foreground">
                                <DialogHeader>
                                    <DialogTitle className="text-foreground">
                                        {editingTemplate ? "Editar plantilla" : "Nueva plantilla"}
                                    </DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleSubmitTemplate} className="space-y-4 mt-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="days_since_last_visit">Días de inactividad</Label>
                                        <Input
                                            id="days_since_last_visit"
                                            type="number"
                                            placeholder="ej. 30"
                                            value={formData.days_since_last_visit}
                                            onChange={(e) => setFormData({ ...formData, days_since_last_visit: e.target.value })}
                                            className="bg-background/50 border-input/50"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="message_template">Cuerpo del mensaje</Label>
                                        <Textarea
                                            id="message_template"
                                            placeholder="Escribí la plantilla..."
                                            value={formData.message_template}
                                            onChange={(e) => setFormData({ ...formData, message_template: e.target.value })}
                                            className="min-h-[120px] bg-background/50 border-input/50"
                                            required
                                        />
                                        <p className="text-[10px] text-muted-foreground leading-normal">
                                            Tip: Usá <code className="text-primary">{`{nombre}`}</code> en la plantilla y se reemplazará automáticamente por el nombre del cliente (ej. &quot;Hola {`{nombre}`}, hace tiempo...&quot;).
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-border/20 pt-4">
                                        <Label htmlFor="is_active" className="text-foreground/80">¿Está activa?</Label>
                                        <Switch
                                            id="is_active"
                                            checked={formData.is_active}
                                            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
                                        <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-muted-foreground hover:bg-muted">
                                            Cancelar
                                        </Button>
                                        <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar plantilla"}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <Card id="admin-reminders-card" className="bg-card/50 border-border/50 overflow-hidden">
                        <CardContent className="p-0">
                            {isTemplatesLoading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className="flex gap-4 animate-pulse">
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-muted/40 rounded w-1/4" />
                                                <div className="h-3 bg-muted/20 rounded w-1/2" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : templates.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <Calendar className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                                    <p className="font-semibold text-lg text-foreground/80">No hay plantillas de recordatorio</p>
                                    <p className="text-sm mt-1 mb-4">Creá tu primera regla de recordatorio usando el botón superior.</p>
                                    <Button variant="outline" size="sm" onClick={() => {
                                        setEditingTemplate(null);
                                        setFormData({ days_since_last_visit: "", message_template: "", is_active: true });
                                        setIsDialogOpen(true);
                                    }}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Crear plantilla
                                    </Button>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/10 border-b border-border/30">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-6 w-[20%]">Días de Inactividad</TableHead>
                                                <TableHead className="w-[50%]">Plantilla de Mensaje</TableHead>
                                                <TableHead className="w-[15%]">Canal</TableHead>
                                                <TableHead className="w-[15%] text-right pr-6">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {templates.map((t) => (
                                                <TableRow key={t.id} className="border-b border-border/30">
                                                    <TableCell className="font-bold text-foreground text-base pl-6 py-4">
                                                        {t.days_since_last_visit} días
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs max-w-sm break-words leading-relaxed">
                                                        {t.message_template}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs font-semibold capitalize">
                                                        {t.channel || "whatsapp"}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <div className="flex items-center gap-1.5 mr-2">
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {t.is_active ? "Activa" : "Inactiva"}
                                                                </span>
                                                                <Switch
                                                                    checked={t.is_active}
                                                                    onCheckedChange={() => toggleTemplateActive(t)}
                                                                    aria-label={`${t.is_active ? "Desactivar" : "Activar"} plantilla de ${t.days_since_last_visit} días`}
                                                                />
                                                            </div>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => openEditTemplate(t)}
                                                                aria-label={`Editar plantilla de ${t.days_since_last_visit} días`}
                                                                className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted md:h-8 md:w-8"
                                                            >
                                                                <Edit2 className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteTemplate(t.id)}
                                                                aria-label={`Eliminar plantilla de ${t.days_since_last_visit} días`}
                                                                className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 md:h-8 md:w-8"
                                                            >
                                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <CalendarClock className="h-4 w-4 text-primary" />
                                Plantillas por evento de cita
                            </h2>
                            <p className="text-xs text-muted-foreground">Se ofrecen en el panel de citas al cancelar, confirmar, reprogramar, recordar o agradecer.</p>
                        </div>
                        <Dialog open={isEventDialogOpen} onOpenChange={setIsEventDialogOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={openNewEventTemplate} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                                    <Plus className="mr-2 h-4 w-4" /> Nueva plantilla
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md bg-card/95 border-border/50 backdrop-blur-xl text-foreground">
                                <DialogHeader>
                                    <DialogTitle className="text-foreground">
                                        {editingEventTemplate ? "Editar plantilla de evento" : "Nueva plantilla de evento"}
                                    </DialogTitle>
                                </DialogHeader>
                                <form onSubmit={handleSubmitEventTemplate} className="space-y-4 mt-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="event_type">Evento</Label>
                                        <Select
                                            value={eventFormData.event_type}
                                            onValueChange={(v) => setEventFormData({ ...eventFormData, event_type: v })}
                                        >
                                            <SelectTrigger id="event_type" className="bg-background/50 border-input/50">
                                                <SelectValue placeholder="Seleccioná un evento" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-card border-border text-foreground">
                                                {MESSAGE_EVENT_TYPES.map((eventType) => (
                                                    <SelectItem key={eventType} value={eventType}>
                                                        {MESSAGE_EVENT_LABELS[eventType]}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="template_name">Nombre interno</Label>
                                        <Input
                                            id="template_name"
                                            placeholder="ej. Cancelación estándar"
                                            value={eventFormData.name}
                                            onChange={(e) => setEventFormData({ ...eventFormData, name: e.target.value })}
                                            className="bg-background/50 border-input/50"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="template_body">Cuerpo del mensaje</Label>
                                        <Textarea
                                            id="template_body"
                                            placeholder="Escribí la plantilla..."
                                            value={eventFormData.body}
                                            onChange={(e) => setEventFormData({ ...eventFormData, body: e.target.value })}
                                            className="min-h-[120px] bg-background/50 border-input/50"
                                            required
                                        />
                                        <p className="text-[10px] text-muted-foreground leading-normal">
                                            Variables disponibles: <code className="text-primary">{`{nombre} {fecha} {hora} {barbero} {servicio} {sucursal}`}</code>. Se reemplazan automáticamente con los datos de la cita.
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-border/20 pt-4">
                                        <Label htmlFor="event_is_active" className="text-foreground/80">¿Está activa?</Label>
                                        <Switch
                                            id="event_is_active"
                                            checked={eventFormData.is_active}
                                            onCheckedChange={(checked) => setEventFormData({ ...eventFormData, is_active: checked })}
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
                                        <Button type="button" variant="ghost" onClick={() => setIsEventDialogOpen(false)} className="text-muted-foreground hover:bg-muted">
                                            Cancelar
                                        </Button>
                                        <Button type="submit" disabled={isEventSubmitting} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                                            {isEventSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar plantilla"}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <Card id="admin-event-templates-card" className="bg-card/50 border-border/50 overflow-hidden">
                        <CardContent className="p-0">
                            {isEventTemplatesLoading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className="flex gap-4 animate-pulse">
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-muted/40 rounded w-1/4" />
                                                <div className="h-3 bg-muted/20 rounded w-1/2" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : eventTemplates.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <CalendarClock className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                                    <p className="font-semibold text-lg text-foreground/80">No hay plantillas por evento</p>
                                    <p className="text-sm mt-1 mb-4">Creá la primera plantilla usando el botón superior.</p>
                                    <Button variant="outline" size="sm" onClick={openNewEventTemplate}>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Crear plantilla
                                    </Button>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/10 border-b border-border/30">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-6 w-[15%]">Evento</TableHead>
                                                <TableHead className="w-[20%]">Nombre</TableHead>
                                                <TableHead className="w-[45%]">Mensaje</TableHead>
                                                <TableHead className="w-[20%] text-right pr-6">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {eventTemplates.map((t) => (
                                                <TableRow key={t.id} className="border-b border-border/30">
                                                    <TableCell className="pl-6 py-4">
                                                        <Badge variant="outline" className="border-primary/25 bg-primary/10 text-primary">
                                                            {MESSAGE_EVENT_LABELS[t.event_type] || t.event_type}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="font-semibold text-foreground text-sm">
                                                        {t.name}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs max-w-sm break-words leading-relaxed">
                                                        {t.body}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <div className="flex items-center gap-1.5 mr-2">
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    {t.is_active ? "Activa" : "Inactiva"}
                                                                </span>
                                                                <Switch
                                                                    checked={t.is_active}
                                                                    onCheckedChange={() => toggleEventTemplateActive(t)}
                                                                    aria-label={`${t.is_active ? "Desactivar" : "Activar"} plantilla ${t.name}`}
                                                                />
                                                            </div>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => openEditEventTemplate(t)}
                                                                aria-label={`Editar plantilla ${t.name}`}
                                                                className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted md:h-8 md:w-8"
                                                            >
                                                                <Edit2 className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteEventTemplate(t.id)}
                                                                aria-label={`Eliminar plantilla ${t.name}`}
                                                                className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 md:h-8 md:w-8"
                                                            >
                                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                  </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
