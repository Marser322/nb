"use client";

import { useState, useEffect } from "react";
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
} from "@/components/ui/dialog";
import { Building2, Plus, Loader2, MapPin, Phone, Edit2 } from "lucide-react";
import { toast } from "sonner";
import type { Branch } from "@/types/database.types";

export default function AdminSucursalesPage() {
    const [branches, setBranches] = useState<Branch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        address: "",
        phone: "",
    });
    const supabase = createClient();

    useEffect(() => {
        loadBranches();
    }, []);

    async function loadBranches() {
        setIsLoading(true);
        const { data } = await supabase
            .from("branches")
            .select("*")
            .order("name");

        if (data) setBranches(data);
        setIsLoading(false);
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingBranch) {
            // Update
            const { error } = await supabase
                .from("branches")
                .update({
                    name: formData.name,
                    address: formData.address,
                    phone: formData.phone || null,
                })
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
                    name: formData.name,
                    address: formData.address,
                    phone: formData.phone || null,
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
        setFormData({ name: "", address: "", phone: "" });
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

    const openEditDialog = (branch: Branch) => {
        setEditingBranch(branch);
        setFormData({
            name: branch.name,
            address: branch.address,
            phone: branch.phone || "",
        });
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        setEditingBranch(null);
        setFormData({ name: "", address: "", phone: "" });
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
                    <DialogContent>
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
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(branch)}
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
