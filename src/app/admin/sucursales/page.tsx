"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Plus, Loader2, MapPin, Phone, Edit2, CalendarRange, Trash2, Calendar, Clock } from "lucide-react";
import { toast } from "sonner";
import type { Branch, WorkingHours, ScheduleBlock } from "@/types/database.types";
import { WorkingHoursEditor } from "@/components/admin/WorkingHoursEditor";

export default function AdminSucursalesPage() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        address: "",
        phone: "",
        working_hours: null as WorkingHours | null,
    });
    
    // Estado para la gestión de bloqueos (feriados, etc.)
    const [activeBranchForBlocks, setActiveBranchForBlocks] = useState<Branch | null>(null);
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

    const loadBranches = useCallback(async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        const { data } = await supabase
            .from("branches")
            .select("*")
            .order("name");

        if (data) setBranches(data);
        setIsLoading(false);
    }, [supabase]);

    const loadBlocks = useCallback(async (branchId: string) => {
        setIsBlocksLoading(true);
        const { data } = await supabase
            .from("schedule_blocks")
            .select("*")
            .eq("branch_id", branchId)
            .gte("end_date", new Date().toISOString().split("T")[0])
            .order("start_date", { ascending: true });
        
        if (data) setBlocks(data);
        setIsBlocksLoading(false);
    }, [supabase]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        loadBranches(false);
    }, [loadBranches]);

    useEffect(() => {
        if (activeBranchForBlocks) {
            loadBlocks(activeBranchForBlocks.id);
        }
    }, [activeBranchForBlocks, loadBlocks]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const dataToSave = {
            name: formData.name,
            address: formData.address,
            phone: formData.phone || null,
            working_hours: formData.working_hours,
        };

        if (editingBranch) {
            // Update
            const { error } = await supabase
                .from("branches")
                .update(dataToSave)
                .eq("id", editingBranch.id);

            if (error) {
                toast.error("Error al actualizar sucursal");
            } else {
                toast.success("Sucursal actualizada");
                loadBranches();
            }
        } else {
            // Create
            const { error } = await supabase
                .from("branches")
                .insert({
                    ...dataToSave,
                    is_active: true,
                });

            if (error) {
                toast.error("Error al crear sucursal");
            } else {
                toast.success("Sucursal creada");
                loadBranches();
            }
        }

        setIsDialogOpen(false);
        setEditingBranch(null);
        setFormData({ name: "", address: "", phone: "", working_hours: null });
    };

    const toggleActive = async (branch: Branch) => {
        const { error } = await supabase
            .from("branches")
            .update({ is_active: !branch.is_active })
            .eq("id", branch.id);

        if (error) {
            toast.error("Error al cambiar estado");
        } else {
            loadBranches();
        }
    };

    const handleCreateBlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeBranchForBlocks) return;

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
                branch_id: activeBranchForBlocks.id,
                start_date: blockForm.startDate,
                end_date: blockForm.endDate,
                start_time: blockForm.isFullDay ? null : blockForm.startTime,
                end_time: blockForm.isFullDay ? null : blockForm.endTime,
                reason: blockForm.reason || null,
            });

        setIsCreatingBlock(false);
        if (error) {
            toast.error("Error al registrar bloqueo");
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
            loadBlocks(activeBranchForBlocks.id);
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
            if (activeBranchForBlocks) {
                loadBlocks(activeBranchForBlocks.id);
            }
        }
    };

    const openEditDialog = (branch: Branch) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name,
            address: branch.address,
            phone: branch.phone || "",
            working_hours: branch.working_hours,
        });
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        setEditingBranch(null);
        setFormData({ name: "", address: "", phone: "", working_hours: null });
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sucursales</h1>
                    <p className="text-muted-foreground">
                        Gestiona las ubicaciones de tu barbería.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openNewDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nueva Sucursal
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {editingBranch ? "Editar Sucursal" : "Nueva Sucursal"}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Nombre</label>
                                <Input
                                    placeholder="NB Barbería Central"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Dirección</label>
                                <Input
                                    placeholder="Av. 18 de Julio 1234"
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Teléfono</label>
                                <Input
                                    placeholder="+598 99 123 456"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                />
                            </div>
                            <div className="pt-2">
                                <WorkingHoursEditor
                                    value={formData.working_hours}
                                    onChange={(val) => setFormData({ ...formData, working_hours: val })}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit">
                                    {editingBranch ? "Guardar Cambios" : "Crear Sucursal"}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Sucursal</TableHead>
                            <TableHead>Dirección</TableHead>
                            <TableHead>Teléfono</TableHead>
                            <TableHead className="text-center">Estado</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando sucursales...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : branches.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No hay sucursales registradas.
                                </TableCell>
                            </TableRow>
                        ) : (
                            branches.map((branch) => (
                                <TableRow key={branch.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                                                <Building2 className="h-5 w-5 text-primary" />
                                            </div>
                                            <span className="font-medium">{branch.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <MapPin className="h-4 w-4" />
                                            {branch.address}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {branch.phone ? (
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <Phone className="h-4 w-4" />
                                                {branch.phone}
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Switch
                                            checked={branch.is_active}
                                            onCheckedChange={() => toggleActive(branch)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditDialog(branch)}
                                                title="Editar"
                                                className="h-10 w-10 md:h-8 md:w-8"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setActiveBranchForBlocks(branch)}
                                                title="Bloqueos de Agenda"
                                                className="h-10 w-10 text-primary hover:text-primary-foreground hover:bg-primary/20 md:h-8 md:w-8"
                                            >
                                                <CalendarRange className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Diálogo para Gestionar Bloqueos */}
            <Dialog open={activeBranchForBlocks !== null} onOpenChange={(open) => !open && setActiveBranchForBlocks(null)}>
                <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CalendarRange className="h-5 w-5 text-primary" />
                            Bloqueos de Agenda: {activeBranchForBlocks?.name}
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
                                    No hay bloqueos activos ni programados para esta sucursal.
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
                                Nuevo Bloqueo (Feriado, Reforma, etc.)
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
                                    id="branch-is-fullday"
                                    checked={blockForm.isFullDay}
                                    onCheckedChange={(checked) => setBlockForm({ ...blockForm, isFullDay: checked })}
                                    className="data-[state=checked]:bg-primary"
                                />
                                <label htmlFor="branch-is-fullday" className="text-xs font-medium text-foreground cursor-pointer select-none">
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
                                    placeholder="Feriado por carnaval, reformas en local, etc."
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
                                    onClick={() => setActiveBranchForBlocks(null)}
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
        </div>
    );
}
