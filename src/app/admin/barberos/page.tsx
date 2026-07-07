"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Users, Plus, Loader2, Edit2, CalendarRange, Trash2, Calendar, Clock, DollarSign, Search } from "lucide-react";
import { toast } from "sonner";
import type { Barber, Branch, WorkingHours, ScheduleBlock, BarberCompensation } from "@/types/database.types";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { WorkingHoursEditor } from "@/components/admin/WorkingHoursEditor";
import { COMPENSATION_MODEL_LABELS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { ImageUpload } from "@/components/admin/image-upload";

export default function AdminBarberosPage() {
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBarber, setEditingBarber] = useState<Barber | null>(null);

    // States para compensación
    const [activeBarberForCompensation, setActiveBarberForCompensation] = useState<Barber | null>(null);
    const [compensationHistory, setCompensationHistory] = useState<BarberCompensation[]>([]);
    const [isCompLoading, setIsCompLoading] = useState(false);
    const [isCreatingComp, setIsCreatingComp] = useState(false);
    const [compForm, setCompForm] = useState({
        model: "commission",
        commissionPct: "",
        rentalAmount: "",
        rentalPeriod: "weekly",
        salaryAmount: "",
        effectiveFrom: new Date().toISOString().split("T")[0],
        notes: "",
    });
    
    const [formData, setFormData] = useState({
        name: "",
        bio: "",
        avatar_url: "",
        branch_id: "",
        working_hours: null as WorkingHours | null,
    });
    
    // Si usa horario personalizado (en caso contrario, guarda null y hereda de sucursal)
    const [useCustomHours, setUseCustomHours] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");

    const filteredBarbers = useMemo(() => {
        return barbers.filter((barber) => {
            const query = searchQuery.toLowerCase().trim();
            if (!query) return true;
            return barber.name.toLowerCase().includes(query);
        });
    }, [barbers, searchQuery]);

    // Estado para la gestión de bloqueos
    const [activeBarberForBlocks, setActiveBarberForBlocks] = useState<Barber | null>(null);
    const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
    const [isBlocksLoading, setIsBlocksLoading] = useState(false);
    const [blockForm, setBlockForm] = useState({
        startDate: "",
        endDate: "",
        isFullDay: true,
        startTime: "09:00",
        endTime: "18:00",
        reason: "",
    });
    const [isCreatingBlock, setIsCreatingBlock] = useState(false);

    const supabase = useMemo(() => createClient(), []);

    const canRenderAvatar = (url: string | null) =>
        !!url && (url.startsWith("/") || url.includes(".supabase.co"));

    const loadBarbers = useCallback(async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        const { data } = await supabase
            .from("barbers")
            .select("*")
            .order("name");

        if (data) setBarbers(data);
        setIsLoading(false);
    }, [supabase]);

    const loadBranches = useCallback(async () => {
        const { data } = await supabase
            .from("branches")
            .select("*")
            .eq("is_active", true)
            .order("name");
        if (data) setBranches(data);
    }, [supabase]);

    const loadBlocks = useCallback(async (barberId: string) => {
        setIsBlocksLoading(true);
        const { data } = await supabase
            .from("schedule_blocks")
            .select("*")
            .eq("barber_id", barberId)
            .gte("end_date", new Date().toISOString().split("T")[0])
            .order("start_date", { ascending: true });
        
        if (data) setBlocks(data);
        setIsBlocksLoading(false);
    }, [supabase]);

    const loadCompensations = useCallback(async (barberId: string) => {
        setIsCompLoading(true);
        const { data } = await supabase
            .from("barber_compensation")
            .select("*")
            .eq("barber_id", barberId)
            .order("effective_from", { ascending: false });
        setCompensationHistory(data || []);
        setIsCompLoading(false);
    }, [supabase]);

    useEffect(() => {
        if (activeBarberForCompensation) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadCompensations(activeBarberForCompensation.id);
            setCompForm({
                model: "commission",
                commissionPct: "",
                rentalAmount: "",
                rentalPeriod: "weekly",
                salaryAmount: "",
                effectiveFrom: new Date().toISOString().split("T")[0],
                notes: "",
            });
        }
    }, [activeBarberForCompensation, loadCompensations]);

    const handleCreateCompensation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeBarberForCompensation) return;

        const model = compForm.model;
        const pct = model === "commission" || model === "hybrid" ? parseFloat(compForm.commissionPct) : null;
        const rental = model === "chair_rental" || model === "hybrid" ? parseFloat(compForm.rentalAmount) : null;
        const period = model === "chair_rental" || model === "hybrid" ? compForm.rentalPeriod : null;
        const salary = model === "employee" ? parseFloat(compForm.salaryAmount) : null;

        if ((model === "commission" || model === "hybrid") && (isNaN(pct!) || pct! < 0 || pct! > 100)) {
            toast.error("Porcentaje de comisión debe estar entre 0 y 100");
            return;
        }

        if ((model === "chair_rental" || model === "hybrid") && (isNaN(rental!) || rental! < 0)) {
            toast.error("Monto de renta debe ser mayor o igual a 0");
            return;
        }

        if (model === "employee" && (isNaN(salary!) || salary! < 0)) {
            toast.error("Monto de sueldo debe ser mayor o igual a 0");
            return;
        }

        setIsCreatingComp(true);
        const { error } = await supabase
            .from("barber_compensation")
            .insert({
                barber_id: activeBarberForCompensation.id,
                model,
                commission_pct: pct,
                rental_amount: rental,
                rental_period: period,
                salary_amount: salary,
                effective_from: compForm.effectiveFrom,
                notes: compForm.notes || null,
            });

        setIsCreatingComp(false);
        if (error) {
            if (error.code === '23505') {
                toast.error("Ya existe una configuración de compensación para este barbero en la misma fecha.");
            } else {
                toast.error("Error al registrar compensación: " + error.message);
            }
        } else {
            toast.success("Compensación registrada con éxito");
            loadCompensations(activeBarberForCompensation.id);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadBarbers(true);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadBranches();
    }, [loadBarbers, loadBranches]);

    useEffect(() => {
        if (activeBarberForBlocks) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadBlocks(activeBarberForBlocks.id);
        }
    }, [activeBarberForBlocks, loadBlocks]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const dataToSave = {
            name: formData.name,
            bio: formData.bio || null,
            avatar_url: formData.avatar_url || null,
            branch_id: formData.branch_id || null,
            working_hours: useCustomHours ? formData.working_hours : null,
        };

        if (editingBarber) {
            const { error } = await supabase
                .from("barbers")
                .update(dataToSave)
                .eq("id", editingBarber.id);

            if (error) {
                toast.error("Error al actualizar barbero");
            } else {
                toast.success("Barbero actualizado");
                loadBarbers();
            }
        } else {
            const { error } = await supabase
                .from("barbers")
                .insert({
                    ...dataToSave,
                    is_active: true,
                });

            if (error) {
                toast.error("Error al crear barbero");
            } else {
                toast.success("Barbero creado");
                loadBarbers();
            }
        }

        setIsDialogOpen(false);
        setEditingBarber(null);
        setFormData({ name: "", bio: "", avatar_url: "", branch_id: "", working_hours: null });
        setUseCustomHours(false);
    };

    const toggleActive = async (barber: Barber) => {
        const { error } = await supabase
            .from("barbers")
            .update({ is_active: !barber.is_active })
            .eq("id", barber.id);

        if (error) {
            toast.error("Error al cambiar estado");
        } else {
            loadBarbers();
        }
    };

    const handleCreateBlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeBarberForBlocks) return;

        if (!blockForm.startDate || !blockForm.endDate) {
            toast.error("Ingresá fechas de inicio y fin válidas");
            return;
        }

        if (blockForm.endDate < blockForm.startDate) {
            toast.error("La fecha de fin debe ser posterior o igual a la de inicio");
            return;
        }

        if (!blockForm.isFullDay && blockForm.endTime <= blockForm.startTime) {
            toast.error("La hora de fin debe ser posterior al inicio");
            return;
        }

        setIsCreatingBlock(true);
        const { error } = await supabase
            .from("schedule_blocks")
            .insert({
                barber_id: activeBarberForBlocks.id,
                start_date: blockForm.startDate,
                end_date: blockForm.endDate,
                start_time: blockForm.isFullDay ? null : blockForm.startTime,
                end_time: blockForm.isFullDay ? null : blockForm.endTime,
                reason: blockForm.reason || null,
            });

        setIsCreatingBlock(false);
        if (error) {
            toast.error("Error al registrar bloqueo de agenda");
        } else {
            toast.success("Bloqueo registrado con éxito");
            setBlockForm({
                startDate: "",
                endDate: "",
                isFullDay: true,
                startTime: "09:00",
                endTime: "18:00",
                reason: "",
            });
            loadBlocks(activeBarberForBlocks.id);
        }
    };

    const handleDeleteBlock = async (blockId: string) => {
        const { error } = await supabase
            .from("schedule_blocks")
            .delete()
            .eq("id", blockId);

        if (error) {
            toast.error("Error al eliminar bloqueo");
        } else {
            toast.success("Bloqueo eliminado");
            if (activeBarberForBlocks) {
                loadBlocks(activeBarberForBlocks.id);
            }
        }
    };

    const openEditDialog = (barber: Barber) => {
        setEditingBarber(barber);
        setFormData({
            name: barber.name,
            bio: barber.bio || "",
            avatar_url: barber.avatar_url || "",
            branch_id: barber.branch_id || "",
            working_hours: barber.working_hours,
        });
        setUseCustomHours(barber.working_hours !== null);
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        setEditingBarber(null);
        setFormData({ name: "", bio: "", avatar_url: "", branch_id: "", working_hours: null });
        setUseCustomHours(false);
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Barberos</h1>
                    <p className="text-muted-foreground">
                        Gestiona el equipo de profesionales.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button id="admin-btn-new-barber" onClick={openNewDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nuevo Barbero
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {editingBarber ? "Editar Barbero" : "Nuevo Barbero"}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Nombre</label>
                                <Input
                                    placeholder="Juan Pérez"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Biografía</label>
                                <Input
                                    placeholder="Especialista en cortes modernos..."
                                    value={formData.bio}
                                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Avatar del Barbero</label>
                                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                    <ImageUpload
                                        value={formData.avatar_url}
                                        onChange={(url) => setFormData({ ...formData, avatar_url: url })}
                                        folder="avatars"
                                        placeholder="Subir avatar"
                                    />
                                    <div className="flex-1 space-y-2 w-full">
                                        <span className="text-xs text-muted-foreground">O introduce una URL externa:</span>
                                        <Input
                                            placeholder="https://ejemplo.com/foto.jpg"
                                            value={formData.avatar_url}
                                            onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Sucursal</label>
                                <Select
                                    value={formData.branch_id || "none"}
                                    onValueChange={(v) => setFormData({ ...formData, branch_id: v === "none" ? "" : v })}
                                >
                                    <SelectTrigger className="bg-background/50 border-input/50 focus:border-amber-500/50">
                                        <SelectValue placeholder="Seleccionar sucursal" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Sin asignar</SelectItem>
                                        {branches.map((b) => (
                                            <SelectItem key={b.id} value={b.id}>
                                                {b.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-3 pt-2">
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="use-custom-hours"
                                        checked={useCustomHours}
                                        onCheckedChange={(checked) => {
                                            setUseCustomHours(checked);
                                            if (!checked) {
                                                setFormData(prev => ({ ...prev, working_hours: null }));
                                            } else {
                                                setFormData(prev => ({ ...prev, working_hours: prev.working_hours || {} }));
                                            }
                                        }}
                                        className="data-[state=checked]:bg-primary"
                                    />
                                    <label htmlFor="use-custom-hours" className="text-sm font-medium text-foreground cursor-pointer select-none">
                                        Horario personalizado
                                    </label>
                                </div>
                                {!useCustomHours ? (
                                    <p className="text-xs text-muted-foreground italic pl-7">
                                        Hereda automáticamente el horario de la sucursal asignada.
                                    </p>
                                ) : (
                                    <WorkingHoursEditor
                                        value={formData.working_hours}
                                        onChange={(val) => setFormData({ ...formData, working_hours: val })}
                                    />
                                )}
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit">
                                    {editingBarber ? "Guardar Cambios" : "Crear Barbero"}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Buscador */}
            <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50 mb-6">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar barbero por nombre..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-sm border-none bg-transparent focus-visible:ring-0 px-0"
                />
            </div>

            <div className="rounded-md border bg-card">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Barbero</TableHead>
                                <TableHead>Biografía</TableHead>
                                <TableHead>Sucursal</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-center">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [...Array(3)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell>
                                            <div className="flex items-center gap-3 animate-pulse">
                                                <div className="h-10 w-10 rounded-full bg-muted/40" />
                                                <div className="h-4 bg-muted/50 rounded w-24" />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="h-4 bg-muted/40 rounded w-48 animate-pulse" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="h-4 bg-muted/40 rounded w-20 animate-pulse" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="h-6 w-10 bg-muted/30 rounded-full mx-auto animate-pulse" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-2 animate-pulse">
                                                <div className="h-8 w-8 bg-muted/40 rounded" />
                                                <div className="h-8 w-8 bg-muted/40 rounded" />
                                                <div className="h-8 w-8 bg-muted/40 rounded" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredBarbers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                                        <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="font-semibold text-lg text-foreground/80">No se encontraron barberos</p>
                                        <p className="text-sm mt-1 mb-4">
                                            {searchQuery ? "Intenta ajustando el término de búsqueda." : "Registra un barbero para empezar a gestionar la agenda."}
                                        </p>
                                        {searchQuery ? (
                                            <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                                                Limpiar búsqueda
                                            </Button>
                                        ) : (
                                            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)}>
                                                <Plus className="h-4 w-4 mr-2" />
                                                Agregar primer barbero
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredBarbers.map((barber) => (
                                <TableRow key={barber.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="relative h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                                                {canRenderAvatar(barber.avatar_url) ? (
                                                    <Image
                                                        src={barber.avatar_url!}
                                                        alt={barber.name}
                                                        fill
                                                        sizes="40px"
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <Users className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </div>
                                            <span className="font-medium">{barber.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-xs truncate text-muted-foreground">
                                        {barber.bio || "—"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">
                                        {branches.find(b => b.id === barber.branch_id)?.name || "Sin asignar"}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Switch
                                            checked={barber.is_active}
                                            onCheckedChange={() => toggleActive(barber)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditDialog(barber)}
                                                title="Editar"
                                                className="h-10 w-10 md:h-8 md:w-8"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setActiveBarberForBlocks(barber)}
                                                title="Bloqueos de Agenda"
                                                className="h-10 w-10 text-primary hover:text-primary-foreground hover:bg-primary/20 md:h-8 md:w-8"
                                            >
                                                <CalendarRange className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setActiveBarberForCompensation(barber)}
                                                title="Compensación"
                                                className="h-10 w-10 text-primary hover:text-primary hover:bg-primary/10 md:h-8 md:w-8"
                                            >
                                                <DollarSign className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                </div>
            </div>

            {/* Diálogo para Gestionar Bloqueos */}
            <Dialog open={activeBarberForBlocks !== null} onOpenChange={(open) => !open && setActiveBarberForBlocks(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarRange className="h-5 w-5 text-primary" />
                            Bloqueos de Agenda: {activeBarberForBlocks?.name}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 mt-4">
                        {/* Lista de bloqueos actuales */}
                        <div>
                            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
                                Bloqueos Activos o Futuros
                            </h3>
                            {isBlocksLoading ? (
                                <div className="flex justify-center p-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                            ) : blocks.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">
                                    No hay bloqueos activos ni programados para este barbero.
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                                    {blocks.map((block) => (
                                        <div
                                            key={block.id}
                                            className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40 text-xs"
                                        >
                                            <div className="space-y-1">
                                                <div className="font-semibold text-foreground">
                                                    {block.reason || "Sin motivo especificado"}
                                                </div>
                                                <div className="text-muted-foreground flex items-center gap-3">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {block.start_date === block.end_date
                                                            ? block.start_date
                                                            : `${block.start_date} al ${block.end_date}`}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {block.start_time && block.end_time
                                                            ? `${block.start_time.slice(0, 5)} - ${block.end_time.slice(0, 5)}`
                                                            : "Día completo"}
                                                    </span>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteBlock(block.id)}
                                                className="h-10 w-10 text-destructive hover:text-destructive hover:bg-destructive/10 md:h-8 md:w-8"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Formulario de alta */}
                        <form onSubmit={handleCreateBlock} className="space-y-4 border-t border-border pt-4">
                            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">
                                Nuevo Bloqueo (Vacaciones, Día libre, etc.)
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                                        Fecha de Inicio
                                    </label>
                                    <Input
                                        type="date"
                                        value={blockForm.startDate}
                                        onChange={(e) => setBlockForm({ ...blockForm, startDate: e.target.value })}
                                        required
                                        className="bg-background/50 border-input/50"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                                        Fecha de Fin
                                    </label>
                                    <Input
                                        type="date"
                                        value={blockForm.endDate}
                                        onChange={(e) => setBlockForm({ ...blockForm, endDate: e.target.value })}
                                        required
                                        className="bg-background/50 border-input/50"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Switch
                                    id="barber-is-fullday"
                                    checked={blockForm.isFullDay}
                                    onCheckedChange={(checked) => setBlockForm({ ...blockForm, isFullDay: checked })}
                                    className="data-[state=checked]:bg-primary"
                                />
                                <label htmlFor="barber-is-fullday" className="text-xs font-medium text-foreground cursor-pointer select-none">
                                    Bloquear todo el día
                                </label>
                            </div>

                            {!blockForm.isFullDay && (
                                <div className="grid grid-cols-2 gap-4 animate-in fade-in duration-200">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                                            Hora de Inicio
                                        </label>
                                        <Input
                                            type="time"
                                            value={blockForm.startTime}
                                            onChange={(e) => setBlockForm({ ...blockForm, startTime: e.target.value })}
                                            required
                                            className="bg-background/50 border-input/50"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground block mb-1">
                                            Hora de Fin
                                        </label>
                                        <Input
                                            type="time"
                                            value={blockForm.endTime}
                                            onChange={(e) => setBlockForm({ ...blockForm, endTime: e.target.value })}
                                            required
                                            className="bg-background/50 border-input/50"
                                        />
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">
                                    Motivo
                                </label>
                                <Input
                                    placeholder="Licencia médica, vacaciones, etc."
                                    value={blockForm.reason}
                                    onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                                    required
                                    className="bg-background/50 border-input/50"
                                />
                            </div>

                            <DialogFooter className="pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setActiveBarberForBlocks(null)}
                                >
                                    Cerrar
                                </Button>
                                <Button type="submit" disabled={isCreatingBlock}>
                                    {isCreatingBlock ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Creando...
                                        </>
                                    ) : (
                                        "Crear Bloqueo"
                                    )}
                                </Button>
                            </DialogFooter>
                        </form>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Diálogo para Gestionar Compensaciones */}
            <Dialog open={activeBarberForCompensation !== null} onOpenChange={(open) => !open && setActiveBarberForCompensation(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl bg-card border-border text-foreground">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                            <DollarSign className="h-5 w-5 text-primary text-glow" />
                            Compensación de Barberos: {activeBarberForCompensation?.name}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-6 mt-4">
                        {/* Historial */}
                        <div>
                            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
                                Historial de Configuraciones
                            </h3>
                            {isCompLoading ? (
                                <div className="flex justify-center p-4">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                </div>
                            ) : compensationHistory.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">
                                    No hay compensaciones configuradas. El barbero operará al 0% por defecto.
                                </p>
                            ) : (
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                    {compensationHistory.map((c) => (
                                        <div
                                            key={c.id}
                                            className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/40 text-xs"
                                        >
                                            <div className="space-y-1">
                                                <div className="font-semibold text-foreground text-sm">
                                                    {COMPENSATION_MODEL_LABELS[c.model]}
                                                </div>
                                                <div className="text-muted-foreground">
                                                    {c.model === "commission" && `Comisión: ${c.commission_pct}%`}
                                                    {c.model === "chair_rental" && `Renta: ${formatPrice(c.rental_amount || 0)} (${c.rental_period === "weekly" ? "Semanal" : "Mensual"})`}
                                                    {c.model === "hybrid" && `Comisión: ${c.commission_pct}% + Renta: ${formatPrice(c.rental_amount || 0)} (${c.rental_period === "weekly" ? "Semanal" : "Mensual"})`}
                                                    {c.model === "employee" && `Sueldo: ${formatPrice(c.salary_amount || 0)}`}
                                                </div>
                                                {c.notes && (
                                                    <div className="text-[10px] text-muted-foreground italic">
                                                        Nota: {c.notes}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <div className="text-foreground font-mono">
                                                    Desde: {format(new Date(c.effective_from + "T12:00:00"), "dd/MM/yyyy")}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Nueva Compensación */}
                        <div className="border-t border-border pt-4">
                            <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4">
                                Configurar Nueva Compensación
                            </h3>
                            <form onSubmit={handleCreateCompensation} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block text-muted-foreground">Modelo</label>
                                        <Select
                                            value={compForm.model}
                                            onValueChange={(v) => setCompForm({ ...compForm, model: v })}
                                        >
                                            <SelectTrigger className="bg-background border-border text-foreground">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-card border-border text-foreground">
                                                <SelectItem value="commission">Comisión</SelectItem>
                                                <SelectItem value="chair_rental">Renta de sillón</SelectItem>
                                                <SelectItem value="hybrid">Híbrido</SelectItem>
                                                <SelectItem value="employee">Empleado (Sueldo Fijo)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold mb-1 block text-muted-foreground">Vigencia desde</label>
                                        <Input
                                            type="date"
                                            value={compForm.effectiveFrom}
                                            onChange={(e) => setCompForm({ ...compForm, effectiveFrom: e.target.value })}
                                            required
                                            className="bg-background border-border text-foreground"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {(compForm.model === "commission" || compForm.model === "hybrid") && (
                                        <div>
                                            <label className="text-xs font-semibold mb-1 block text-muted-foreground">Comisión Barbero (%)</label>
                                            <Input
                                                type="number"
                                                min="0"
                                                max="100"
                                                placeholder="60"
                                                value={compForm.commissionPct}
                                                onChange={(e) => setCompForm({ ...compForm, commissionPct: e.target.value })}
                                                required
                                                className="bg-background border-border text-foreground"
                                            />
                                        </div>
                                    )}

                                    {(compForm.model === "chair_rental" || compForm.model === "hybrid") && (
                                        <>
                                            <div>
                                                <label className="text-xs font-semibold mb-1 block text-muted-foreground">Monto de Renta (UYU)</label>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    placeholder="3500"
                                                    value={compForm.rentalAmount}
                                                    onChange={(e) => setCompForm({ ...compForm, rentalAmount: e.target.value })}
                                                    required
                                                    className="bg-background border-border text-foreground"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs font-semibold mb-1 block text-muted-foreground">Periodo de Renta</label>
                                                <Select
                                                    value={compForm.rentalPeriod}
                                                    onValueChange={(v) => setCompForm({ ...compForm, rentalPeriod: v })}
                                                >
                                                    <SelectTrigger className="bg-background border-border text-foreground">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border text-foreground">
                                                        <SelectItem value="weekly">Semanal</SelectItem>
                                                        <SelectItem value="monthly">Mensual</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </>
                                    )}

                                    {compForm.model === "employee" && (
                                        <div>
                                            <label className="text-xs font-semibold mb-1 block text-muted-foreground">Monto de Sueldo (UYU)</label>
                                            <Input
                                                type="number"
                                                min="0"
                                                placeholder="25000"
                                                value={compForm.salaryAmount}
                                                onChange={(e) => setCompForm({ ...compForm, salaryAmount: e.target.value })}
                                                required
                                                className="bg-background border-border text-foreground"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-xs font-semibold mb-1 block text-muted-foreground">Notas internas</label>
                                    <Input
                                        placeholder="Comisiones especiales o detalles del acuerdo"
                                        value={compForm.notes}
                                        onChange={(e) => setCompForm({ ...compForm, notes: e.target.value })}
                                        className="bg-background border-border text-foreground"
                                    />
                                </div>

                                <DialogFooter className="pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setActiveBarberForCompensation(null)}
                                        disabled={isCreatingComp}
                                        className="border-border hover:bg-muted"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={isCreatingComp} className="bg-primary text-black hover:bg-primary/90 font-bold">
                                        {isCreatingComp ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Registrando...
                                            </>
                                        ) : (
                                            "Guardar Compensación"
                                        )}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
