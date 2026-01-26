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
} from "@/components/ui/dialog";
import { Sparkles, Plus, Loader2, Edit2, Clock, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import type { Service } from "@/types/database.types";

export default function AdminServiciosPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        price: "",
        duration_minutes: "",
    });
    const supabase = useMemo(() => createClient(), []);

    const loadServices = useCallback(async (showLoading = true) => {
        if (showLoading) setIsLoading(true);
        const { data } = await supabase
            .from("services")
            .select("*")
            .order("sort_order");

        if (data) setServices(data);
        setIsLoading(false);
    }, [supabase]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/exhaustive-deps
        loadServices(false);
    }, [loadServices]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingService) {
            const { error } = await supabase
                .from("services")
                .update({
                    name: formData.name,
                    description: formData.description || null,
                    price: parseFloat(formData.price),
                    duration_minutes: parseInt(formData.duration_minutes),
                })
                .eq("id", editingService.id);

            if (error) {
                toast.error("Error al actualizar servicio");
            } else {
                toast.success("Servicio actualizado");
                loadServices();
            }
        } else {
            const { error } = await supabase
                .from("services")
                .insert({
                    name: formData.name,
                    description: formData.description || null,
                    price: parseFloat(formData.price),
                    duration_minutes: parseInt(formData.duration_minutes),
                    is_active: true,
                    sort_order: services.length,
                });

            if (error) {
                toast.error("Error al crear servicio");
            } else {
                toast.success("Servicio creado");
                loadServices();
            }
        }

        setIsDialogOpen(false);
        setEditingService(null);
        setFormData({ name: "", description: "", price: "", duration_minutes: "" });
    };

    const toggleActive = async (service: Service) => {
        const { error } = await supabase
            .from("services")
            .update({ is_active: !service.is_active })
            .eq("id", service.id);

        if (error) {
            toast.error("Error al cambiar estado");
        } else {
            loadServices();
        }
    };

    const openEditDialog = (service: Service) => {
        setEditingService(service);
        setFormData({
            name: service.name,
            description: service.description || "",
            price: service.price.toString(),
            duration_minutes: service.duration_minutes.toString(),
        });
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        setEditingService(null);
        setFormData({ name: "", description: "", price: "", duration_minutes: "30" });
        setIsDialogOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Servicios</h1>
                    <p className="text-muted-foreground">
                        Gestiona los servicios que ofrecés.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={openNewDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            Nuevo Servicio
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {editingService ? "Editar Servicio" : "Nuevo Servicio"}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Nombre</label>
                                <Input
                                    placeholder="Corte Clásico"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Descripción</label>
                                <Input
                                    placeholder="Corte tradicional con tijera o máquina..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Precio (UYU)</label>
                                    <Input
                                        type="number"
                                        placeholder="450"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Duración (min)</label>
                                    <Input
                                        type="number"
                                        placeholder="30"
                                        value={formData.duration_minutes}
                                        onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit">
                                    {editingService ? "Guardar Cambios" : "Crear Servicio"}
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
                            <TableHead>Servicio</TableHead>
                            <TableHead>Precio</TableHead>
                            <TableHead>Duración</TableHead>
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
                                        Cargando servicios...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : services.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No hay servicios registrados.
                                </TableCell>
                            </TableRow>
                        ) : (
                            services.map((service) => (
                                <TableRow key={service.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                                                <Sparkles className="h-5 w-5 text-primary" />
                                            </div>
                                            <div>
                                                <span className="font-medium">{service.name}</span>
                                                {service.description && (
                                                    <p className="text-xs text-muted-foreground truncate max-w-xs">
                                                        {service.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <DollarSign className="h-4 w-4 text-green-500" />
                                            <span className="font-medium">{formatPrice(service.price)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                                            <Clock className="h-3 w-3" />
                                            {service.duration_minutes} min
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Switch
                                            checked={service.is_active}
                                            onCheckedChange={() => toggleActive(service)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(service)}
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
