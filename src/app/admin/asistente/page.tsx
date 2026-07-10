"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useFeatures } from "@/lib/features";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
    Bot,
    Loader2,
    Search,
    Trash2,
    Edit2,
    GraduationCap,
    MessageCircleQuestion,
    BookOpen,
    AlertTriangle,
    TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { CHAT_PROVIDER_LABELS, CHAT_MODE_LABELS, ROUTES } from "@/lib/constants";
import type { ChatLog, ChatKnowledge } from "@/types/database.types";
import { format, parseISO } from "date-fns";
import { AdminPageHeader } from "@/components/admin/admin-ui";

/** Normaliza igual que el backend: minúsculas y sin tildes, para dedupe por pregunta. */
function normalizeQuestion(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

const LOGS_LIMIT = 500;

export default function AdminAsistentePage() {
    const supabase = useMemo(() => createClient(), []);
    const { features, isLoaded } = useFeatures();

    // Preguntas (chat_logs)
    const [logs, setLogs] = useState<ChatLog[]>([]);
    const [isLogsLoading, setIsLogsLoading] = useState(true);
    const [logsSearch, setLogsSearch] = useState("");
    const [onlyFallback, setOnlyFallback] = useState(false);

    // Conocimiento (chat_knowledge)
    const [knowledge, setKnowledge] = useState<ChatKnowledge[]>([]);
    const [isKnowledgeLoading, setIsKnowledgeLoading] = useState(true);

    // Diálogo "Enseñar respuesta"
    const [teachDialogOpen, setTeachDialogOpen] = useState(false);
    const [teachQuestion, setTeachQuestion] = useState("");
    const [teachAnswer, setTeachAnswer] = useState("");
    const [isTeaching, setIsTeaching] = useState(false);

    // Diálogo edición de conocimiento
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<ChatKnowledge | null>(null);
    const [editQuestion, setEditQuestion] = useState("");
    const [editAnswer, setEditAnswer] = useState("");
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    const loadLogs = useCallback(async () => {
        setIsLogsLoading(true);
        const { data, error } = await supabase
            .from("chat_logs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(LOGS_LIMIT);

        if (error) {
            console.error("Error loading chat logs:", error);
            toast.error("Error al cargar las preguntas del chat");
        } else if (data) {
            setLogs(data);
        }
        setIsLogsLoading(false);
    }, [supabase]);

    const loadKnowledge = useCallback(async () => {
        setIsKnowledgeLoading(true);
        const { data, error } = await supabase
            .from("chat_knowledge")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Error loading chat knowledge:", error);
            toast.error("Error al cargar la base de conocimiento");
        } else if (data) {
            setKnowledge(data);
        }
        setIsKnowledgeLoading(false);
    }, [supabase]);

    /* eslint-disable react-hooks/set-state-in-effect -- carga inicial desde Supabase */
    useEffect(() => {
        loadLogs();
        loadKnowledge();
    }, [loadLogs, loadKnowledge]);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Top 5 preguntas más repetidas (agregación en memoria sobre los últimos 500 logs)
    const topRepeatedQuestions = useMemo(() => {
        const counts = new Map<string, { question: string; count: number }>();
        for (const log of logs) {
            const existing = counts.get(log.normalized_question);
            if (existing) {
                existing.count += 1;
            } else {
                counts.set(log.normalized_question, { question: log.question, count: 1 });
            }
        }
        return Array.from(counts.values())
            .filter((entry) => entry.count > 1)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }, [logs]);

    const filteredLogs = useMemo(() => {
        const query = logsSearch.toLowerCase().trim();
        return logs.filter((log) => {
            if (onlyFallback && !log.was_fallback) return false;
            if (!query) return true;
            return (
                log.question.toLowerCase().includes(query) ||
                (log.answer?.toLowerCase().includes(query) ?? false)
            );
        });
    }, [logs, logsSearch, onlyFallback]);

    const openTeachDialog = (question: string) => {
        setTeachQuestion(question);
        setTeachAnswer("");
        setTeachDialogOpen(true);
    };

    const handleTeach = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teachQuestion.trim() || !teachAnswer.trim()) {
            toast.error("Completá la pregunta y la respuesta");
            return;
        }

        setIsTeaching(true);
        const { error } = await supabase
            .from("chat_knowledge")
            .upsert(
                {
                    question: teachQuestion.trim().slice(0, 300),
                    normalized_question: normalizeQuestion(teachQuestion).slice(0, 300),
                    answer: teachAnswer.trim().slice(0, 1000),
                    source: "manual",
                    is_active: true,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: "normalized_question" }
            );

        if (error) {
            console.error("Error teaching chat knowledge:", error);
            toast.error("Error al guardar la respuesta enseñada");
        } else {
            toast.success("El asistente aprendió esta respuesta");
            setTeachDialogOpen(false);
            loadKnowledge();
        }
        setIsTeaching(false);
    };

    const openEditDialog = (entry: ChatKnowledge) => {
        setEditingEntry(entry);
        setEditQuestion(entry.question);
        setEditAnswer(entry.answer);
        setEditDialogOpen(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingEntry) return;
        if (!editQuestion.trim() || !editAnswer.trim()) {
            toast.error("Completá la pregunta y la respuesta");
            return;
        }

        setIsSavingEdit(true);
        const { error } = await supabase
            .from("chat_knowledge")
            .update({
                question: editQuestion.trim().slice(0, 300),
                normalized_question: normalizeQuestion(editQuestion).slice(0, 300),
                answer: editAnswer.trim().slice(0, 1000),
                updated_at: new Date().toISOString(),
            })
            .eq("id", editingEntry.id);

        if (error) {
            console.error("Error updating chat knowledge:", error);
            toast.error("Error al actualizar la entrada");
        } else {
            toast.success("Entrada actualizada");
            setEditDialogOpen(false);
            loadKnowledge();
        }
        setIsSavingEdit(false);
    };

    const toggleKnowledgeActive = async (entry: ChatKnowledge) => {
        const { error } = await supabase
            .from("chat_knowledge")
            .update({ is_active: !entry.is_active, updated_at: new Date().toISOString() })
            .eq("id", entry.id);

        if (error) {
            toast.error("Error al cambiar el estado");
        } else {
            loadKnowledge();
        }
    };

    const handleDeleteKnowledge = async (id: string) => {
        if (!confirm("¿Estás seguro de eliminar esta entrada de conocimiento?")) return;

        const { error } = await supabase.from("chat_knowledge").delete().eq("id", id);

        if (error) {
            toast.error("Error al eliminar la entrada");
        } else {
            toast.success("Entrada eliminada");
            loadKnowledge();
        }
    };

    if (!isLoaded) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="Inteligencia aplicada"
                title="Asistente IA"
                icon={Bot}
                description="Revisá qué preguntan tus clientes y curá la base de conocimiento que aprende el asistente."
            />

            {/* Banner de estado del flag */}
            <div className="flex flex-col gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground backdrop-blur-md sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                        <span className="font-semibold block text-foreground">
                            Auto-aprendizaje: {features.chat_aprendizaje ? "activo" : "desactivado"}
                        </span>
                        Las entradas automáticas pueden contener errores: revisalas y desactivá lo que no corresponda.
                        El registro de preguntas queda siempre activo, aunque el auto-aprendizaje esté apagado.
                    </div>
                </div>
                <Button variant="outline" size="sm" asChild className="shrink-0">
                    <Link href={ROUTES.ADMIN_CONFIGURACION}>Ir a Configuración</Link>
                </Button>
            </div>

            <Tabs defaultValue="preguntas" className="w-full">
                <TabsList className="grid h-auto w-full grid-cols-2 border border-border/40 bg-card/60 p-1 [&_[data-slot=tabs-trigger]]:min-h-10 [&_[data-slot=tabs-trigger]]:whitespace-normal [&_[data-slot=tabs-trigger]]:text-center">
                    <TabsTrigger value="preguntas" className="gap-2">
                        <MessageCircleQuestion className="h-4 w-4" />
                        Preguntas
                    </TabsTrigger>
                    <TabsTrigger value="conocimiento" className="gap-2">
                        <BookOpen className="h-4 w-4" />
                        Conocimiento
                    </TabsTrigger>
                </TabsList>

                {/* TAB: PREGUNTAS */}
                <TabsContent value="preguntas" className="mt-6 space-y-4">
                    {topRepeatedQuestions.length > 0 && (
                        <Card className="bg-card/50 border-border/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-primary" />
                                    Preguntas más repetidas
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Sobre los últimos {logs.length} registros
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2 pt-0">
                                {topRepeatedQuestions.map((entry) => (
                                    <Badge
                                        key={entry.question}
                                        variant="outline"
                                        className="max-w-full truncate border-primary/30 bg-primary/5 py-1.5 font-normal text-foreground/80"
                                    >
                                        {entry.question} <span className="ml-1.5 font-bold text-primary">×{entry.count}</span>
                                    </Badge>
                                ))}
                            </CardContent>
                        </Card>
                    )}

                    <div className="flex flex-wrap items-center gap-4">
                        <div className="relative flex-1 min-w-[220px] max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por pregunta o respuesta…"
                                value={logsSearch}
                                onChange={(e) => setLogsSearch(e.target.value)}
                                className="pl-10 bg-background/50 border-input/50 focus:border-primary/50"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Switch checked={onlyFallback} onCheckedChange={setOnlyFallback} id="only-fallback" />
                            <Label htmlFor="only-fallback" className="text-sm text-foreground/80">
                                Solo sin respuesta
                            </Label>
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
                                        </div>
                                    ))}
                                </div>
                            ) : filteredLogs.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <MessageCircleQuestion className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                                    <p className="font-semibold text-lg text-foreground/80">
                                        {logsSearch || onlyFallback ? "No se encontraron preguntas" : "Todavía no hay preguntas registradas"}
                                    </p>
                                    <p className="text-sm mt-1">
                                        {logsSearch || onlyFallback
                                            ? "Probá ajustando la búsqueda o el filtro."
                                            : "Cada pregunta al chat del sitio va a aparecer acá."}
                                    </p>
                                </div>
                            ) : (
                                <>
                                <div className="grid gap-3 p-3 md:hidden">
                                    {filteredLogs.map((log) => (
                                        <div key={log.id} className="admin-mobile-record">
                                            <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] text-muted-foreground">{format(parseISO(log.created_at), "dd/MM/yyyy HH:mm")}</p><p className="mt-2 text-sm leading-relaxed text-foreground">{log.question}</p></div>{log.was_fallback ? <Badge variant="outline" className="shrink-0 bg-amber-500/20 text-amber-400 border-amber-500/30">Sin respuesta</Badge> : <Badge variant="outline" className="shrink-0 bg-green-500/20 text-green-400 border-green-500/30">Respondida</Badge>}</div>
                                            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3"><span className="text-xs text-muted-foreground">{CHAT_MODE_LABELS[log.mode] || log.mode} · {CHAT_PROVIDER_LABELS[log.provider] || log.provider}</span><Button size="sm" variant="outline" onClick={() => openTeachDialog(log.question)}><GraduationCap className="mr-2 h-4 w-4" aria-hidden="true" />Enseñar</Button></div>
                                        </div>
                                    ))}
                                </div>
                                <div className="hidden overflow-x-auto md:block">
                                    <Table>
                                        <TableHeader className="bg-muted/10 border-b border-border/30">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-6 w-[14%]">Fecha</TableHead>
                                                <TableHead className="w-[8%]">Modo</TableHead>
                                                <TableHead className="w-[36%]">Pregunta</TableHead>
                                                <TableHead className="w-[12%]">Proveedor</TableHead>
                                                <TableHead className="w-[12%]">Estado</TableHead>
                                                <TableHead className="w-[18%] text-right pr-6">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredLogs.map((log) => (
                                                <TableRow key={log.id} className="border-b border-border/30">
                                                    <TableCell className="text-muted-foreground text-sm pl-6 py-4 whitespace-nowrap">
                                                        {format(parseISO(log.created_at), "dd/MM/yyyy HH:mm")}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {CHAT_MODE_LABELS[log.mode] || log.mode}
                                                    </TableCell>
                                                    <TableCell className="text-foreground text-xs max-w-sm break-words leading-relaxed">
                                                        {log.question}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs">
                                                        {CHAT_PROVIDER_LABELS[log.provider] || log.provider}
                                                    </TableCell>
                                                    <TableCell>
                                                        {log.was_fallback ? (
                                                            <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                                                                Sin respuesta
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                                                                Respondida
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => openTeachDialog(log.question)}
                                                            className="text-primary hover:bg-primary/10"
                                                        >
                                                            <GraduationCap className="h-4 w-4 mr-1.5" />
                                                            Enseñar respuesta
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* TAB: CONOCIMIENTO */}
                <TabsContent value="conocimiento" className="mt-6 space-y-4">
                    <div>
                        <h2 className="text-lg font-bold text-foreground">Base de conocimiento</h2>
                        <p className="text-xs text-muted-foreground">
                            Se inyecta al prompt del chat cliente con prioridad de la información oficial. Nunca reemplaza precios, horarios ni disponibilidad.
                        </p>
                    </div>

                    <Card className="bg-card/50 border-border/50 overflow-hidden">
                        <CardContent className="p-0">
                            {isKnowledgeLoading ? (
                                <div className="p-8 space-y-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="flex gap-4 animate-pulse">
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-muted/40 rounded w-1/4" />
                                                <div className="h-3 bg-muted/20 rounded w-1/2" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : knowledge.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <BookOpen className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                                    <p className="font-semibold text-lg text-foreground/80">Todavía no hay conocimiento aprendido</p>
                                    <p className="text-sm mt-1">
                                        Va a llenarse solo con el uso del chat, o podés enseñar respuestas desde la pestaña Preguntas.
                                    </p>
                                </div>
                            ) : (
                                <>
                                <div className="grid gap-3 p-3 md:hidden">
                                    {knowledge.map((entry) => (
                                        <div key={entry.id} className="admin-mobile-record">
                                            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-foreground">{entry.question}</p><p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted-foreground">{entry.answer}</p></div><Switch checked={entry.is_active} onCheckedChange={() => toggleKnowledgeActive(entry)} aria-label={`${entry.is_active ? "Desactivar" : "Activar"} entrada`} /></div>
                                            <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3"><Badge variant="outline">{entry.source === "auto" ? "Auto" : "Manual"}</Badge><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => openEditDialog(entry)} aria-label="Editar entrada"><Edit2 className="h-4 w-4" aria-hidden="true" /></Button><Button size="icon" variant="ghost" onClick={() => handleDeleteKnowledge(entry.id)} aria-label="Eliminar entrada" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" aria-hidden="true" /></Button></div></div>
                                        </div>
                                    ))}
                                </div>
                                <div className="hidden overflow-x-auto md:block">
                                    <Table>
                                        <TableHeader className="bg-muted/10 border-b border-border/30">
                                            <TableRow className="hover:bg-transparent">
                                                <TableHead className="pl-6 w-[26%]">Pregunta</TableHead>
                                                <TableHead className="w-[38%]">Respuesta</TableHead>
                                                <TableHead className="w-[10%]">Origen</TableHead>
                                                <TableHead className="w-[10%]">Activa</TableHead>
                                                <TableHead className="w-[16%] text-right pr-6">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {knowledge.map((entry) => (
                                                <TableRow key={entry.id} className="border-b border-border/30">
                                                    <TableCell className="font-semibold text-foreground text-xs max-w-xs break-words pl-6 py-4">
                                                        {entry.question}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-xs max-w-sm break-words leading-relaxed">
                                                        {entry.answer}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge
                                                            variant="outline"
                                                            className={
                                                                entry.source === "auto"
                                                                    ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                                                    : "bg-purple-500/20 text-purple-400 border-purple-500/30"
                                                            }
                                                        >
                                                            {entry.source === "auto" ? "Auto" : "Manual"}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Switch
                                                            checked={entry.is_active}
                                                            onCheckedChange={() => toggleKnowledgeActive(entry)}
                                                            aria-label={`${entry.is_active ? "Desactivar" : "Activar"} entrada`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => openEditDialog(entry)}
                                                                aria-label="Editar entrada"
                                                                className="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-muted md:h-8 md:w-8"
                                                            >
                                                                <Edit2 className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={() => handleDeleteKnowledge(entry.id)}
                                                                aria-label="Eliminar entrada"
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
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Diálogo: Enseñar respuesta */}
            <Dialog open={teachDialogOpen} onOpenChange={setTeachDialogOpen}>
                <DialogContent className="max-w-md bg-card/95 border-border/50 backdrop-blur-xl text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Enseñar respuesta</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleTeach} className="space-y-4 mt-2">
                        <div className="space-y-2">
                            <Label htmlFor="teach-question">Pregunta</Label>
                            <Textarea
                                id="teach-question"
                                value={teachQuestion}
                                onChange={(e) => setTeachQuestion(e.target.value)}
                                className="min-h-[70px] bg-background/50 border-input/50"
                                maxLength={300}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="teach-answer">Respuesta</Label>
                            <Textarea
                                id="teach-answer"
                                placeholder="Escribí la respuesta que debería usar el asistente…"
                                value={teachAnswer}
                                onChange={(e) => setTeachAnswer(e.target.value)}
                                className="min-h-[120px] bg-background/50 border-input/50"
                                maxLength={1000}
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
                            <Button type="button" variant="ghost" onClick={() => setTeachDialogOpen(false)} className="text-muted-foreground hover:bg-muted">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isTeaching} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                                {isTeaching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar respuesta"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Diálogo: Editar entrada de conocimiento */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-w-md bg-card/95 border-border/50 backdrop-blur-xl text-foreground">
                    <DialogHeader>
                        <DialogTitle className="text-foreground">Editar entrada</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSaveEdit} className="space-y-4 mt-2">
                        <div className="space-y-2">
                            <Label htmlFor="edit-question">Pregunta</Label>
                            <Textarea
                                id="edit-question"
                                value={editQuestion}
                                onChange={(e) => setEditQuestion(e.target.value)}
                                className="min-h-[70px] bg-background/50 border-input/50"
                                maxLength={300}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-answer">Respuesta</Label>
                            <Textarea
                                id="edit-answer"
                                value={editAnswer}
                                onChange={(e) => setEditAnswer(e.target.value)}
                                className="min-h-[120px] bg-background/50 border-input/50"
                                maxLength={1000}
                                required
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-border/20">
                            <Button type="button" variant="ghost" onClick={() => setEditDialogOpen(false)} className="text-muted-foreground hover:bg-muted">
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSavingEdit} className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                                {isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cambios"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
