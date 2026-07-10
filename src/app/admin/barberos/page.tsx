"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Users, Plus, Loader2, Edit2, CalendarRange, Trash2, Calendar, Clock, DollarSign, Search, ShieldCheck, Copy, KeyRound } from "lucide-react";
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
import { formatPrice, cn } from "@/lib/utils";
import { ImageUpload } from "@/components/admin/image-upload";
import {
    ALL_PERMISSIONS,
    PERMISSION_LABELS,
    ROLE_DEFAULT_PERMISSIONS,
    type Permission,
} from "@/lib/permissions";
import { usePermissions } from "@/lib/usePermissions";
import { findScheduleBlockConflicts, type ScheduleBlockConflict } from "@/lib/booking";
import { ScheduleBlockConflictDialog } from "@/components/admin/schedule-block-conflict-dialog";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { getBarberAvatarFallback } from "@/lib/static-data";

type StaffRole = "barbero" | "gerente";

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
    barbero: "Barbero",
    gerente: "Gerente",
};

function defaultPermissionsForRole(role: StaffRole): Record<Permission, boolean> {
    const defaults = ROLE_DEFAULT_PERMISSIONS[role] ?? [];
    return ALL_PERMISSIONS.reduce((acc, perm) => {
        acc[perm] = defaults.includes(perm);
        return acc;
    }, {} as Record<Permission, boolean>);
}

export default function AdminBarberosPage() {
    const router = useRouter();
    const { can, isLoaded: permissionsLoaded } = usePermissions();
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

    // Alta de staff con usuario de login (RBAC): solo aplica al crear (no al editar).
    const [staffEmail, setStaffEmail] = useState("");
    const [staffRole, setStaffRole] = useState<StaffRole>("barbero");
    const [staffPermissions, setStaffPermissions] = useState<Record<Permission, boolean>>(
        defaultPermissionsForRole("barbero")
    );
    const [isCreatingStaff, setIsCreatingStaff] = useState(false);
    const [newStaffCredentials, setNewStaffCredentials] = useState<{
        email: string;
        tempPassword: string;
        role: StaffRole;
    } | null>(null);

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
    const [blockConflicts, setBlockConflicts] = useState<ScheduleBlockConflict[] | null>(null);
    const [isCheckingBlockConflicts, setIsCheckingBlockConflicts] = useState(false);

    // Ausencias de todo el equipo (vigentes o dentro de 14 días), para el badge
    // de la tabla — un solo query extra, sin abrir el diálogo barbero por barbero.
    const [allBlocks, setAllBlocks] = useState<ScheduleBlock[]>([]);

    // Por barbero: bloqueo activo hoy (prioridad) o el próximo dentro de 14 días.
    const barberAbsence = useMemo(() => {
        const todayStr = format(new Date(), "yyyy-MM-dd");
        const horizonStr = format(addDays(new Date(), 14), "yyyy-MM-dd");
        const byBarber = new Map<string, ScheduleBlock[]>();
        for (const block of allBlocks) {
            if (!block.barber_id) continue;
            const list = byBarber.get(block.barber_id) || [];
            list.push(block);
            byBarber.set(block.barber_id, list);
        }

        const result = new Map<string, { status: "active" | "upcoming"; block: ScheduleBlock }>();
        byBarber.forEach((blocksForBarber, barberId) => {
            const active = blocksForBarber.find(
                (b) => b.start_date <= todayStr && b.end_date >= todayStr
            );
            if (active) {
                result.set(barberId, { status: "active", block: active });
                return;
            }
            const upcoming = blocksForBarber
                .filter((b) => b.start_date > todayStr && b.start_date <= horizonStr)
                .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
            if (upcoming) {
                result.set(barberId, { status: "upcoming", block: upcoming });
            }
        });
        return result;
    }, [allBlocks]);

    const supabase = useMemo(() => createClient(), []);

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

    const loadAllBlocks = useCallback(async () => {
        const { data } = await supabase
            .from("schedule_blocks")
            .select("*")
            .gte("end_date", new Date().toISOString().split("T")[0])
            .order("start_date", { ascending: true });

        if (data) setAllBlocks(data);
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

        loadBarbers(true);

        loadBranches();

        loadAllBlocks();
    }, [loadBarbers, loadBranches, loadAllBlocks]);

    useEffect(() => {
        if (permissionsLoaded && !can("staff.manage")) {
            toast.error("No tenés permiso para gestionar el equipo");
            router.replace("/admin/dashboard");
        }
    }, [permissionsLoaded, can, router]);

    useEffect(() => {
        if (activeBarberForBlocks) {
             
            loadBlocks(activeBarberForBlocks.id);
        }
    }, [activeBarberForBlocks, loadBlocks]);

    const resetStaffFields = () => {
        setStaffEmail("");
        setStaffRole("barbero");
        setStaffPermissions(defaultPermissionsForRole("barbero"));
        setIsCreatingStaff(false);
    };

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

            setIsDialogOpen(false);
            setEditingBarber(null);
            setFormData({ name: "", bio: "", avatar_url: "", branch_id: "", working_hours: null });
            setUseCustomHours(false);
            return;
        }

        // Alta de staff nuevo: crea usuario de login + perfil con rol y
        // permisos (y fila en `barbers` si el rol es barbero) vía endpoint
        // server con service_role. Reemplaza el insert client-side directo.
        if (!staffEmail.trim()) {
            toast.error("Ingresá un email para que la persona pueda iniciar sesión");
            return;
        }

        setIsCreatingStaff(true);
        try {
            const response = await fetch("/api/admin/staff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fullName: formData.name,
                    email: staffEmail.trim(),
                    role: staffRole,
                    bio: formData.bio || null,
                    avatarUrl: formData.avatar_url || null,
                    branchId: formData.branch_id || null,
                    permissionOverrides: staffPermissions,
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.ok) {
                toast.error(result?.message || "No se pudo crear el nuevo miembro del equipo");
                return;
            }

            toast.success(
                staffRole === "gerente"
                    ? "Gerente creado. Compartile las credenciales temporales."
                    : "Barbero creado con acceso al sistema. Compartile las credenciales temporales."
            );
            setNewStaffCredentials({
                email: result.email,
                tempPassword: result.tempPassword,
                role: staffRole,
            });

            setIsDialogOpen(false);
            setEditingBarber(null);
            setFormData({ name: "", bio: "", avatar_url: "", branch_id: "", working_hours: null });
            setUseCustomHours(false);
            resetStaffFields();
            loadBarbers();
        } catch (error) {
            console.error("Error creando staff:", error);
            toast.error("No se pudo crear el nuevo miembro del equipo");
        } finally {
            setIsCreatingStaff(false);
        }
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

    // Inserta el bloqueo ya validado (sin choques, o el admin decidió crearlo igual)
    const insertBlock = async () => {
        if (!activeBarberForBlocks) return;

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
        setBlockConflicts(null);
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
            loadAllBlocks();
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

        setIsCheckingBlockConflicts(true);
        const conflicts = await findScheduleBlockConflicts(supabase, {
            barberIds: [activeBarberForBlocks.id],
            startDate: blockForm.startDate,
            endDate: blockForm.endDate,
            startTime: blockForm.isFullDay ? null : blockForm.startTime,
            endTime: blockForm.isFullDay ? null : blockForm.endTime,
        });
        setIsCheckingBlockConflicts(false);

        if (conflicts.length > 0) {
            setBlockConflicts(conflicts);
            return;
        }

        await insertBlock();
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
            loadAllBlocks();
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
        resetStaffFields();
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        setEditingBarber(null);
        setFormData({ name: "", bio: "", avatar_url: "", branch_id: "", working_hours: null });
        setUseCustomHours(false);
        resetStaffFields();
        setIsDialogOpen(true);
    };

    const handleStaffRoleChange = (role: StaffRole) => {
        setStaffRole(role);
        setStaffPermissions(defaultPermissionsForRole(role));
    };

    const copyStaffCredentials = () => {
        if (!newStaffCredentials) return;
        const text = `Email: ${newStaffCredentials.email}\nContraseña temporal: ${newStaffCredentials.tempPassword}`;
        navigator.clipboard
            .writeText(text)
            .then(() => toast.success("Credenciales copiadas al portapapeles"))
            .catch(() => toast.error("No se pudo copiar. Copiá manualmente."));
    };

    if (!permissionsLoaded || !can("staff.manage")) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="Equipo"
                title="Barberos"
                icon={Users}
                description="Administrá profesionales, accesos, horarios y compensaciones."
                action={(
                    <Button id="admin-btn-new-barber" onClick={openNewDialog}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Nuevo miembro
                    </Button>
                )}
            />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-h-[90vh] overflow-y-auto max-w-lg">
                        <DialogHeader>
                            <DialogTitle>
                                {editingBarber ? "Editar miembro" : "Nuevo miembro del equipo"}
                            </DialogTitle>
                            <DialogDescription>
                                Gestioná su perfil, acceso, sucursal y disponibilidad de agenda.
                            </DialogDescription>
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

                            {!editingBarber && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">Rol</label>
                                            <Select
                                                value={staffRole}
                                                onValueChange={(v) => handleStaffRoleChange(v as StaffRole)}
                                            >
                                                <SelectTrigger className="bg-background/50 border-input/50">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="barbero">Barbero</SelectItem>
                                                    <SelectItem value="gerente">Gerente</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium mb-2 block">Email de acceso</label>
                                            <Input
                                                type="email"
                                                placeholder="persona@nbbarber.uy"
                                                value={staffEmail}
                                                onChange={(e) => setStaffEmail(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground -mt-2">
                                        Se crea un usuario con contraseña temporal para que inicie sesión en{" "}
                                        {staffRole === "gerente" ? "el panel admin" : "su portal de barbero y el panel admin"}.
                                    </p>

                                    <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                            <ShieldCheck className="h-4 w-4 text-primary" />
                                            Permisos ({STAFF_ROLE_LABELS[staffRole]})
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Prellenados según el rol. Desmarcá o marcá para ajustar el acceso de esta persona.
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {ALL_PERMISSIONS.map((perm) => (
                                                <label
                                                    key={perm}
                                                    className="flex items-center gap-2 text-xs text-foreground/90 cursor-pointer select-none"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={staffPermissions[perm]}
                                                        onChange={(e) =>
                                                            setStaffPermissions((prev) => ({
                                                                ...prev,
                                                                [perm]: e.target.checked,
                                                            }))
                                                        }
                                                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                                                    />
                                                    {PERMISSION_LABELS[perm]}
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="text-sm font-medium mb-2 block">Biografía</label>
                                <Textarea
                                    placeholder="Especialista en cortes modernos…"
                                    value={formData.bio}
                                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                                    rows={3}
                                    className="bg-background/50 border-input/50"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                    Se muestra al cliente en el paso &quot;Barbero&quot; del wizard de reserva.
                                </p>
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
                            {(editingBarber || staffRole === "barbero") && (
                                <>
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">Sucursal</label>
                                        <Select
                                            value={formData.branch_id || "none"}
                                            onValueChange={(v) => setFormData({ ...formData, branch_id: v === "none" ? "" : v })}
                                        >
                                            <SelectTrigger className="admin-field-focus bg-background/50 border-input/50">
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
                                </>
                            )}

                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={isCreatingStaff}>
                                    {isCreatingStaff ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Creando...
                                        </>
                                    ) : editingBarber ? (
                                        "Guardar Cambios"
                                    ) : (
                                        "Crear Miembro del Equipo"
                                    )}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
            </Dialog>

            {/* Buscador */}
            <div className="flex items-center gap-4 bg-card/50 p-4 rounded-lg border border-border/50 mb-6">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar barbero por nombre…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="max-w-sm border-none bg-transparent focus-visible:ring-0 px-0"
                />
            </div>

            <div className="grid gap-3 md:hidden">
                {isLoading ? <div className="h-32 animate-pulse rounded-2xl bg-muted/40" /> : filteredBarbers.length === 0 ? (
                    <div className="admin-empty-state rounded-2xl p-5 text-center text-sm text-muted-foreground">No se encontraron barberos.</div>
                ) : filteredBarbers.map((barber) => (
                    <div key={barber.id} className="admin-mobile-record">
                        <div className="flex gap-3">
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                                <ImageWithFallback
                                    src={barber.avatar_url}
                                    fallbackSrc={getBarberAvatarFallback(barber)}
                                    alt={barber.name}
                                    fill
                                    sizes="64px"
                                    className="object-cover"
                                    fallbackClassName="h-full w-full"
                                />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{barber.name}</p><p className="mt-1 text-xs text-muted-foreground">{branches.find((branch) => branch.id === barber.branch_id)?.name || "Sin sucursal"}</p></div><Switch checked={barber.is_active} onCheckedChange={() => toggleActive(barber)} aria-label={`${barber.is_active ? "Desactivar" : "Activar"} ${barber.name}`} /></div>
                                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{barber.bio || "Sin biografía"}</p>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-1 border-t border-border/60 pt-3">
                            <Button variant="ghost" size="sm" onClick={() => openEditDialog(barber)}><Edit2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Editar</Button>
                            <Button variant="ghost" size="sm" onClick={() => setActiveBarberForBlocks(barber)}><CalendarRange className="mr-1.5 h-4 w-4" aria-hidden="true" />Agenda</Button>
                            <Button variant="ghost" size="sm" onClick={() => setActiveBarberForCompensation(barber)}><DollarSign className="mr-1.5 h-4 w-4" aria-hidden="true" />Pago</Button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="hidden rounded-md border bg-card md:block">
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
                                                <ImageWithFallback
                                                    src={barber.avatar_url}
                                                    fallbackSrc={getBarberAvatarFallback(barber)}
                                                    alt={barber.name}
                                                    fill
                                                    sizes="40px"
                                                    className="object-cover"
                                                    fallbackClassName="h-full w-full"
                                                />
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
                                        <div className="flex flex-col items-center gap-1.5">
                                            <Switch
                                                checked={barber.is_active}
                                                onCheckedChange={() => toggleActive(barber)}
                                            />
                                            {(() => {
                                                const absence = barberAbsence.get(barber.id);
                                                if (!absence) return null;
                                                const label =
                                                    absence.status === "active"
                                                        ? `Ausente hasta el ${format(new Date(`${absence.block.end_date}T12:00:00`), "EEE d/MM", { locale: es })}`
                                                        : `Licencia del ${format(new Date(`${absence.block.start_date}T12:00:00`), "EEE d/MM", { locale: es })}`;
                                                return (
                                                    <Badge
                                                        variant="outline"
                                                        title={absence.block.reason || "Sin motivo especificado"}
                                                        className={cn(
                                                            "whitespace-nowrap text-[10px] font-normal",
                                                            absence.status === "active"
                                                                ? "border-destructive/40 bg-destructive/5 text-destructive"
                                                                : "border-muted-foreground/30 text-muted-foreground"
                                                        )}
                                                    >
                                                        {label}
                                                    </Badge>
                                                );
                                            })()}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditDialog(barber)}
                                                title="Editar"
                                                aria-label={`Editar ${barber.name}`}
                                                className="h-10 w-10 md:h-8 md:w-8"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setActiveBarberForBlocks(barber)}
                                                title="Bloqueos de Agenda"
                                                aria-label={`Gestionar agenda de ${barber.name}`}
                                                className="h-10 w-10 text-primary hover:text-primary-foreground hover:bg-primary/20 md:h-8 md:w-8"
                                            >
                                                <CalendarRange className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setActiveBarberForCompensation(barber)}
                                                title="Compensación"
                                                aria-label={`Gestionar compensación de ${barber.name}`}
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
                                                            ? format(new Date(`${block.start_date}T12:00:00`), "EEE d/MM/yyyy", { locale: es })
                                                            : `${format(new Date(`${block.start_date}T12:00:00`), "EEE d/MM", { locale: es })} al ${format(new Date(`${block.end_date}T12:00:00`), "EEE d/MM/yyyy", { locale: es })}`}
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
                                <Button type="submit" disabled={isCreatingBlock || isCheckingBlockConflicts}>
                                    {isCreatingBlock || isCheckingBlockConflicts ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            {isCheckingBlockConflicts ? "Revisando agenda..." : "Creando..."}
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

            <ScheduleBlockConflictDialog
                conflicts={blockConflicts}
                isSubmitting={isCreatingBlock}
                onConfirm={insertBlock}
                onCancel={() => setBlockConflicts(null)}
            />

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

            {/* Diálogo con credenciales temporales tras crear staff nuevo */}
            <Dialog open={newStaffCredentials !== null} onOpenChange={(open) => !open && setNewStaffCredentials(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-primary" />
                            Credenciales temporales
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Compartile estos datos a la persona para que inicie sesión. No se van a volver a mostrar.
                        </p>
                        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 font-mono text-sm">
                            <p><span className="text-muted-foreground">Email:</span> {newStaffCredentials?.email}</p>
                            <p><span className="text-muted-foreground">Contraseña:</span> {newStaffCredentials?.tempPassword}</p>
                            <p className="text-muted-foreground">Rol: {newStaffCredentials && STAFF_ROLE_LABELS[newStaffCredentials.role]}</p>
                        </div>
                        <p className="text-xs text-muted-foreground italic">
                            Recomendale cambiar la contraseña en su primer inicio de sesión (Recuperar contraseña).
                        </p>
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={copyStaffCredentials}>
                            <Copy className="h-4 w-4 mr-2" />
                            Copiar
                        </Button>
                        <Button onClick={() => setNewStaffCredentials(null)}>Listo</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
