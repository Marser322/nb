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
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { ImageUpload } from "@/components/admin/image-upload";
import { IllustratedEmptyState } from "@/components/shared/IllustratedEmptyState";
import {
    Sparkles,
    Plus,
    Loader2,
    Edit2,
    Clock,
    DollarSign,
    Search,
    ArrowUp,
    ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import { SERVICE_CATEGORIES, SERVICE_CATEGORY_LABELS } from "@/lib/constants";
import type { Service } from "@/types/database.types";
import { AdminPageHeader, AdminToolbar } from "@/components/admin/admin-ui";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { getServiceImageFallback } from "@/lib/static-data";

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const DEFAULT_CATEGORY = "corte";

function categoryLabel(category?: string | null) {
    return SERVICE_CATEGORY_LABELS[category || "otro"] || SERVICE_CATEGORY_LABELS.otro;
}

export default function AdminServiciosPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingService, setEditingService] = useState<Service | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        price: "",
        duration_minutes: "30",
        category: DEFAULT_CATEGORY,
        image_url: "",
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
        loadServices(false);
    }, [loadServices]);

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            price: "",
            duration_minutes: "30",
            category: DEFAULT_CATEGORY,
            image_url: "",
        });
        setEditingService(null);
    };

    const validateForm = () => {
        if (!formData.name.trim()) {
            toast.error("El nombre no puede estar vacío");
            return false;
        }
        const price = parseFloat(formData.price);
        if (!Number.isFinite(price) || price <= 0) {
            toast.error("El precio debe ser mayor a 0");
            return false;
        }
        const duration = parseInt(formData.duration_minutes, 10);
        if (!Number.isFinite(duration) || duration < 15 || duration > 240 || duration % 15 !== 0) {
            toast.error("La duración debe ser entre 15 y 240 minutos, en múltiplos de 15");
            return false;
        }
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name.trim(),
                description: formData.description.trim() || null,
                price: parseFloat(formData.price),
                duration_minutes: parseInt(formData.duration_minutes, 10),
                category: formData.category || DEFAULT_CATEGORY,
                image_url: formData.image_url.trim() || null,
            };

            if (editingService) {
                const { error } = await supabase
                    .from("services")
                    .update(payload)
                    .eq("id", editingService.id);

                if (error) {
                    toast.error("Error al actualizar servicio");
                } else {
                    toast.success("Servicio actualizado");
                    setIsDialogOpen(false);
                    resetForm();
                    loadServices();
                }
            } else {
                const { error } = await supabase
                    .from("services")
                    .insert({
                        ...payload,
                        is_active: true,
                        sort_order: services.length,
                    });

                if (error) {
                    toast.error("Error al crear servicio");
                } else {
                    toast.success("Servicio creado");
                    setIsDialogOpen(false);
                    resetForm();
                    loadServices();
                }
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleActive = async (service: Service) => {
        const { error } = await supabase
            .from("services")
            .update({ is_active: !service.is_active })
            .eq("id", service.id);

        if (error) {
            toast.error("Error al cambiar estado");
        } else {
            toast.success(service.is_active ? "Servicio desactivado" : "Servicio activado");
            loadServices();
        }
    };

    const moveService = async (service: Service, direction: "up" | "down") => {
        const ordered = [...services].sort((a, b) => a.sort_order - b.sort_order);
        const currentIndex = ordered.findIndex((s) => s.id === service.id);
        const neighborIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
        if (neighborIndex < 0 || neighborIndex >= ordered.length) return;

        const neighbor = ordered[neighborIndex];
        const [updateA, updateB] = await Promise.all([
            supabase.from("services").update({ sort_order: neighbor.sort_order }).eq("id", service.id),
            supabase.from("services").update({ sort_order: service.sort_order }).eq("id", neighbor.id),
        ]);

        if (updateA.error || updateB.error) {
            toast.error("No pudimos reordenar los servicios");
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
            category: service.category || DEFAULT_CATEGORY,
            image_url: service.image_url || "",
        });
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        resetForm();
        setIsDialogOpen(true);
    };

    const filteredServices = services
        .filter((service) => service.name.toLowerCase().includes(searchQuery.toLowerCase()))
        .filter((service) => categoryFilter === "all" || (service.category || "otro") === categoryFilter);

    const orderedServices = [...services].sort((a, b) => a.sort_order - b.sort_order);

    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="Catálogo"
                title="Servicios"
                icon={Sparkles}
                description="Organizá precios, duración, categorías y orden de reserva."
                action={(
                    <Button id="admin-btn-new-service" onClick={openNewDialog}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Nuevo servicio
                    </Button>
                )}
            />
            <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                {editingService ? "Editar servicio" : "Nuevo servicio"}
                            </DialogTitle>
                            <DialogDescription>
                                Definí cómo se presenta y cuánto tiempo bloquea en la agenda.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Nombre</label>
                                <Input
                                    placeholder="Corte Clásico"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="text-base md:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Descripción</label>
                                <Input
                                    placeholder="Corte tradicional con tijera o máquina…"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="text-base md:text-sm"
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
                                        className="text-base md:text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Duración</label>
                                    <Select
                                        value={formData.duration_minutes}
                                        onValueChange={(value) => setFormData({ ...formData, duration_minutes: value })}
                                    >
                                        <SelectTrigger className="text-base md:text-sm">
                                            <SelectValue placeholder="Duración" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DURATION_OPTIONS.map((minutes) => (
                                                <SelectItem key={minutes} value={minutes.toString()}>
                                                    {minutes} min
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Categoría</label>
                                <Select
                                    value={formData.category}
                                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                                >
                                    <SelectTrigger className="text-base md:text-sm">
                                        <SelectValue placeholder="Seleccionar categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SERVICE_CATEGORIES.map((category) => (
                                            <SelectItem key={category} value={category}>
                                                {SERVICE_CATEGORY_LABELS[category]}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Imagen del servicio</label>
                                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                    <ImageUpload
                                        value={formData.image_url}
                                        onChange={(url) => setFormData({ ...formData, image_url: url })}
                                        folder="services"
                                        placeholder="Subir imagen"
                                    />
                                    <div className="flex-1 space-y-2 w-full">
                                        <span className="text-xs text-muted-foreground">O introducí una URL externa:</span>
                                        <Input
                                            placeholder="https://ejemplo.com/servicio.jpg"
                                            value={formData.image_url}
                                            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                            className="text-base md:text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-4">
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button type="submit" disabled={isSubmitting}>
                                    {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {editingService ? "Guardar cambios" : "Crear servicio"}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
            </Dialog>

            <AdminToolbar>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Input
                        placeholder="Buscar servicio…"
                        aria-label="Buscar servicio"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="min-w-0 border-none bg-transparent px-0 text-base focus-visible:ring-0 md:text-sm"
                    />
                </div>
                <div className="w-full md:w-60">
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger aria-label="Filtrar por categoría" className="w-full text-base md:text-sm">
                            <SelectValue placeholder="Categoría" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todas las categorías</SelectItem>
                            {SERVICE_CATEGORIES.map((category) => (
                                <SelectItem key={category} value={category}>
                                    {SERVICE_CATEGORY_LABELS[category]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </AdminToolbar>

            <div className="grid gap-3 md:hidden">
                {isLoading ? <div className="h-32 animate-pulse rounded-2xl bg-muted/40" /> : filteredServices.length === 0 ? (
                    <IllustratedEmptyState icon={Sparkles} title="No se encontraron servicios" description="Ajustá los filtros o agregá un servicio nuevo." />
                ) : filteredServices.map((service) => {
                    const orderIndex = orderedServices.findIndex((item) => item.id === service.id);
                    return (
                        <div key={service.id} className="admin-mobile-record">
                            <div className="flex items-start gap-3">
                                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-primary/10">
                                    <ImageWithFallback
                                        src={service.image_url}
                                        fallbackSrc={getServiceImageFallback(service)}
                                        alt={service.name}
                                        fill
                                        sizes="64px"
                                        className="object-cover"
                                        fallbackClassName="h-full w-full"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-semibold">{service.name}</p><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{service.description}</p></div><Switch checked={service.is_active} onCheckedChange={() => toggleActive(service)} aria-label={`${service.is_active ? "Desactivar" : "Activar"} ${service.name}`} /></div>
                                    <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">{categoryLabel(service.category)}</Badge><Badge variant="outline">{service.duration_minutes} min</Badge><strong className="text-sm text-primary">{formatPrice(service.price)}</strong></div>
                                </div>
                            </div>
                            <div className="mt-4 flex justify-end gap-1 border-t border-border/60 pt-3">
                                <Button variant="ghost" size="icon" onClick={() => moveService(service, "up")} disabled={orderIndex === 0} aria-label={`Subir ${service.name}`}><ArrowUp className="h-4 w-4" aria-hidden="true" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => moveService(service, "down")} disabled={orderIndex === orderedServices.length - 1} aria-label={`Bajar ${service.name}`}><ArrowDown className="h-4 w-4" aria-hidden="true" /></Button>
                                <Button variant="outline" size="sm" onClick={() => openEditDialog(service)}><Edit2 className="mr-2 h-4 w-4" aria-hidden="true" />Editar</Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="hidden rounded-md border bg-card md:block">
                <div className="overflow-x-auto">
                    <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Servicio</TableHead>
                            <TableHead>Categoría</TableHead>
                            <TableHead>Precio</TableHead>
                            <TableHead>Duración</TableHead>
                            <TableHead className="text-center">Estado</TableHead>
                            <TableHead className="text-center">Orden</TableHead>
                            <TableHead className="text-center">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando servicios...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredServices.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="py-4 text-center text-muted-foreground">
                                    <IllustratedEmptyState
                                        icon={Sparkles}
                                        title="No se encontraron servicios"
                                        description={searchQuery || categoryFilter !== "all" ? "Ajustá la búsqueda o el filtro de categoría para ubicar el servicio correcto." : "Registrá el primer servicio para que aparezca en la home, el wizard de reserva y el chat."}
                                        action={
                                            searchQuery || categoryFilter !== "all" ? (
                                                <Button variant="outline" size="sm" onClick={() => { setSearchQuery(""); setCategoryFilter("all"); }}>
                                                    Limpiar filtros
                                                </Button>
                                            ) : (
                                                <Button variant="outline" size="sm" onClick={openNewDialog}>
                                                    <Plus className="mr-2 h-4 w-4" />
                                                    Agregar primer servicio
                                                </Button>
                                            )
                                        }
                                    />
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredServices.map((service) => {
                                const orderIndex = orderedServices.findIndex((s) => s.id === service.id);
                                const isFirst = orderIndex === 0;
                                const isLast = orderIndex === orderedServices.length - 1;

                                return (
                                <TableRow key={service.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="relative h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                                                <ImageWithFallback
                                                    src={service.image_url}
                                                    fallbackSrc={getServiceImageFallback(service)}
                                                    alt={service.name}
                                                    fill
                                                    sizes="40px"
                                                    className="object-cover"
                                                    fallbackClassName="h-full w-full"
                                                />
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
                                        <Badge variant="outline">{categoryLabel(service.category)}</Badge>
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
                                        <div className="flex justify-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-10 w-10 md:h-8 md:w-8"
                                                onClick={() => moveService(service, "up")}
                                                disabled={isFirst}
                                            >
                                                <ArrowUp className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-10 w-10 md:h-8 md:w-8"
                                                onClick={() => moveService(service, "down")}
                                                disabled={isLast}
                                            >
                                                <ArrowDown className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => openEditDialog(service)}
                                            className="h-10 w-10 md:h-8 md:w-8"
                                        >
                                            <Edit2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
                </div>
            </div>
        </div>
    );
}
