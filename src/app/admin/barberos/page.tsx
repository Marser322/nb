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
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Users, Plus, Loader2, Edit2 } from "lucide-react";
import { toast } from "sonner";
import type { Barber } from "@/types/database.types";

export default function AdminBarberosPage() {
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        bio: "",
        avatar_url: "",
    });
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

    useEffect(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        loadBarbers(false);
    }, [loadBarbers]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingBarber) {
            const { error } = await supabase
                .from("barbers")
                .update({
                    name: formData.name,
                    bio: formData.bio || null,
                    avatar_url: formData.avatar_url || null,
                })
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
                    name: formData.name,
                    bio: formData.bio || null,
                    avatar_url: formData.avatar_url || null,
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
        setFormData({ name: "", bio: "", avatar_url: "" });
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

    const openEditDialog = (barber: Barber) => {
        setEditingBarber(barber);
        setFormData({
            name: barber.name,
            bio: barber.bio || "",
            avatar_url: barber.avatar_url || "",
        });
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        setEditingBarber(null);
        setFormData({ name: "", bio: "", avatar_url: "" });
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
                        <Button onClick={openNewDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nuevo Barbero
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
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
                                <label className="text-sm font-medium mb-2 block">URL de Avatar</label>
                                <Input
                                    placeholder="https://ejemplo.com/foto.jpg"
                                    value={formData.avatar_url}
                                    onChange={(e) => setFormData({ ...formData, avatar_url: e.target.value })}
                                />
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

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Barbero</TableHead>
                            <TableHead>Biografía</TableHead>
                            <TableHead className="text-center">Estado</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando barberos...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : barbers.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                                    No hay barberos registrados.
                                </TableCell>
                            </TableRow>
                        ) : (
                            barbers.map((barber) => (
                                <TableRow key={barber.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                                                {barber.avatar_url ? (
                                                    <img src={barber.avatar_url} alt="" className="h-full w-full object-cover" />
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
                                    <TableCell className="text-center">
                                        <Switch
                                            checked={barber.is_active}
                                            onCheckedChange={() => toggleActive(barber)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(barber)}
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
