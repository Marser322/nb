"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { MessageCircle, Plus, Loader2, Edit2, Search, Trash2, Calendar, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import type { CommunicationLog, RemindersConfig } from "@/types/database.types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default function AdminMensajesPage() {
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

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadLogs();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadTemplates();
    }, [loadLogs, loadTemplates]);

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

    // Filtro logs por búsqueda en memoria
    const filteredLogs = logs.filter((log) => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        const nameMatches = log.client_name?.toLowerCase().includes(query) ?? false;
        const phoneMatches = log.client_phone?.includes(query) ?? false;
        const messageMatches = log.message_sent?.toLowerCase().includes(query) ?? false;
        return nameMatches || phoneMatches || messageMatches;
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
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
                                className="pl-10 bg-background/50 border-input/50 focus:border-amber-500/50"
                            />
                        </div>
                        <Button variant="outline" onClick={loadLogs} className="border-white/10 hover:bg-white/5">
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
                                    <p className="font-semibold text-lg text-white/80">No hay registros de envío</p>
                                    <p className="text-sm mt-1">Los WhatsApps iniciados manualmente quedarán asentados acá.</p>
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
                                                const statusColors: Record<string, string> = {
                                                    sent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                                    delivered: "bg-green-500/10 text-green-500 border-green-500/20",
                                                    failed: "bg-red-500/10 text-red-500 border-red-500/20",
                                                };
                                                const statusLabels: Record<string, string> = {
                                                    sent: "Enviado",
                                                    delivered: "Entregado",
                                                    failed: "Fallo",
                                                };

                                                return (
                                                    <TableRow key={log.id} className="border-b border-border/30">
                                                        <TableCell className="text-zinc-300 text-sm pl-6 py-4">
                                                            {format(parseISO(log.sent_at), "dd/MM/yyyy HH:mm")}
                                                        </TableCell>
                                                        <TableCell className="font-semibold text-white">
                                                            {log.client_name || "Sin nombre"}
                                                        </TableCell>
                                                        <TableCell className="text-zinc-300 font-mono text-sm">
                                                            {log.client_phone || "—"}
                                                        </TableCell>
                                                        <TableCell className="text-zinc-300 text-xs leading-normal max-w-sm break-words">
                                                            {log.message_sent}
                                                        </TableCell>
                                                        <TableCell className="text-right pr-6">
                                                            <Badge variant="outline" className={statusColors[log.status] || ""}>
                                                                {statusLabels[log.status] || log.status}
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
                <TabsContent value="plantillas" className="mt-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-bold text-white">Configuración de Recordatorios</h2>
                            <p className="text-xs text-muted-foreground">Plantillas disparadas según los días desde el último corte.</p>
                        </div>
                        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                            <DialogTrigger asChild>
                                <Button onClick={openNewTemplate} className="bg-primary hover:bg-primary/90 text-black font-semibold">
                                    <Plus className="mr-2 h-4 w-4" /> Nueva Plantilla
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md bg-card/95 border-border/50 backdrop-blur-xl text-white">
                                <DialogHeader>
                                    <DialogTitle className="text-white">
                                        {editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}
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
                                        <Label htmlFor="is_active" className="text-white/80">¿Está activa?</Label>
                                        <Switch
                                            id="is_active"
                                            checked={formData.is_active}
                                            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                        />
                                    </div>
                                    <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
                                        <Button type="button" variant="ghost" onClick={() => setIsDialogOpen(false)} className="text-white hover:bg-white/5">
                                            Cancelar
                                        </Button>
                                        <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-black font-semibold">
                                            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar Plantilla"}
                                        </Button>
                                    </div>
                                </form>
                            </DialogContent>
                        </Dialog>
                    </div>

                    <Card className="bg-card/50 border-border/50 overflow-hidden">
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
                                    <p className="font-semibold text-lg text-white/80">No hay plantillas de recordatorio</p>
                                    <p className="text-sm mt-1">Creá tu primer regla de recordatorio usando el botón superior.</p>
                                </div>
                            ) : (
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
                                                <TableCell className="font-bold text-white text-base pl-6 py-4">
                                                    {t.days_since_last_visit} días
                                                </TableCell>
                                                <TableCell className="text-zinc-300 text-xs max-w-sm break-words leading-relaxed">
                                                    {t.message_template}
                                                </TableCell>
                                                <TableCell className="text-zinc-300 text-xs font-semibold capitalize">
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
                                                            />
                                                        </div>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            onClick={() => openEditTemplate(t)}
                                                            className="text-zinc-400 hover:text-white hover:bg-white/5"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            onClick={() => handleDeleteTemplate(t.id)}
                                                            className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
