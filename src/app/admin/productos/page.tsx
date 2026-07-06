"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFeatures } from "@/lib/features";
import Image from "next/image";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Minus, Plus, Search, Package, Loader2, Edit2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import type { Product } from "@/types/database.types";
import { ImageUpload } from "@/components/admin/image-upload";

export default function AdminProductsPage() {
    const { features, isLoaded } = useFeatures();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && !features.tienda) {
            toast.error("El módulo de tienda no está activo");
            router.replace("/admin/dashboard");
        }
    }, [isLoaded, features.tienda, router]);

    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        price: "",
        stock: "",
        category: "",
        image_url: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const supabase = createClient();

    const canRenderProductImage = (url: string | null) =>
        !!url && (url.startsWith("/") || url.includes(".supabase.co"));

    // Cargar productos
    useEffect(() => {
        loadProducts();
    }, []);

    async function loadProducts() {
        setIsLoading(true);
        const { data } = await supabase
            .from("products")
            .select("*")
            .order("name");

        if (data) setProducts(data);
        setIsLoading(false);
    }

    // Actualizar Stock
    const updateStock = async (productId: string, newStock: number) => {
        if (newStock < 0) return;

        // Optimistic UI update
        setProducts(products.map(p =>
            p.id === productId ? { ...p, stock: newStock } : p
        ));

        const { error } = await supabase
            .from("products")
            .update({ stock: newStock })
            .eq("id", productId);

        if (error) {
            toast.error("Error al actualizar stock");
            loadProducts();
        } else {
            toast.success("Stock actualizado");
        }
    };

    // Toggle Activo
    const toggleActive = async (productId: string, currentState: boolean) => {
        // Optimistic UI update
        setProducts(products.map(p =>
            p.id === productId ? { ...p, is_active: !currentState } : p
        ));

        const { error } = await supabase
            .from("products")
            .update({ is_active: !currentState })
            .eq("id", productId);

        if (error) {
            toast.error("Error al cambiar estado");
            loadProducts();
        } else {
            toast.success(currentState ? "Producto desactivado" : "Producto activado");
        }
    };

    // Crear/Editar producto
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const productData = {
                name: formData.name,
                description: formData.description || null,
                price: parseFloat(formData.price),
                stock: parseInt(formData.stock),
                category: formData.category,
                image_url: formData.image_url || null,
                is_active: true,
            };

            if (editingProduct) {
                const { error } = await supabase
                    .from("products")
                    .update(productData)
                    .eq("id", editingProduct.id);

                if (error) {
                    toast.error("Error al actualizar producto");
                } else {
                    toast.success("Producto actualizado");
                    loadProducts();
                }
            } else {
                const { error } = await supabase
                    .from("products")
                    .insert(productData);

                if (error) {
                    toast.error("Error al crear producto: " + error.message);
                } else {
                    toast.success("Producto creado");
                    loadProducts();
                }
            }

            setIsDialogOpen(false);
            resetForm();
        } finally {
            setIsSubmitting(false);
        }
    };

    // Eliminar producto
    const deleteProduct = async (productId: string) => {
        if (!confirm("¿Estás seguro de eliminar este producto?")) return;

        const { error } = await supabase
            .from("products")
            .delete()
            .eq("id", productId);

        if (error) {
            toast.error("Error al eliminar producto");
        } else {
            toast.success("Producto eliminado");
            loadProducts();
        }
    };

    const openEditDialog = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || "",
            price: product.price.toString(),
            stock: product.stock.toString(),
            category: product.category,
            image_url: product.image_url || "",
        });
        setIsDialogOpen(true);
    };

    const openNewDialog = () => {
        setEditingProduct(null);
        resetForm();
        setIsDialogOpen(true);
    };

    const resetForm = () => {
        setFormData({
            name: "",
            description: "",
            price: "",
            stock: "0",
            category: "",
            image_url: "",
        });
        setEditingProduct(null);
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (!isLoaded || !features.tienda) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inventario de Productos</h1>
                    <p className="text-muted-foreground">
                        Gestiona el stock y la visibilidad de tus productos.
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button id="admin-btn-new-product" onClick={openNewDialog}>
                            <Plus className="h-4 w-4 mr-2" />
                            Agregar Producto
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                {editingProduct ? "Editar Producto" : "Nuevo Producto"}
                            </DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Nombre</label>
                                <Input
                                    placeholder="Cera Mate Premium"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Descripción</label>
                                <Input
                                    placeholder="Cera de acabado mate para estilos texturizados..."
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
                                    <label className="text-sm font-medium mb-2 block">Stock</label>
                                    <Input
                                        type="number"
                                        placeholder="10"
                                        value={formData.stock}
                                        onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Categoría</label>
                                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PRODUCT_CATEGORIES.map((cat) => (
                                            <SelectItem key={cat} value={cat}>
                                                {cat}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Imagen del Producto</label>
                                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                    <ImageUpload
                                        value={formData.image_url}
                                        onChange={(url) => setFormData({ ...formData, image_url: url })}
                                        folder="products"
                                        placeholder="Subir imagen"
                                    />
                                    <div className="flex-1 space-y-2 w-full">
                                        <span className="text-xs text-muted-foreground">O introduce una URL externa:</span>
                                        <Input
                                            placeholder="https://ejemplo.com/producto.jpg"
                                            value={formData.image_url}
                                            onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
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
                                    {editingProduct ? "Guardar Cambios" : "Crear Producto"}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="flex items-center gap-4 bg-card p-4 rounded-lg border">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar producto..."
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
                                <TableHead>Producto</TableHead>
                                <TableHead>Categoría</TableHead>
                                <TableHead>Precio</TableHead>
                                <TableHead className="text-center">Stock</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-center">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [...Array(4)].map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell>
                                            <div className="flex items-center gap-3 animate-pulse">
                                                <div className="h-10 w-10 rounded-md bg-muted/40" />
                                                <div className="h-4 bg-muted/50 rounded w-32" />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="h-4 bg-muted/40 rounded w-20 animate-pulse" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="h-4 bg-muted/40 rounded w-16 animate-pulse" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center justify-center gap-2 animate-pulse">
                                                <div className="h-8 w-8 bg-muted/40 rounded" />
                                                <div className="h-4 bg-muted/40 rounded w-8" />
                                                <div className="h-8 w-8 bg-muted/40 rounded" />
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="h-6 w-10 bg-muted/30 rounded-full mx-auto animate-pulse" />
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-center gap-2 animate-pulse">
                                                <div className="h-8 w-8 bg-muted/40 rounded" />
                                                <div className="h-8 w-8 bg-muted/40 rounded" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredProducts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                                        <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                                        <p className="font-semibold text-lg text-foreground/80">No se encontraron productos</p>
                                        <p className="text-sm mt-1 mb-4">
                                            {searchQuery ? "Intenta ajustando el término de búsqueda." : "Registra un producto para que aparezca en la tienda."}
                                        </p>
                                        {searchQuery ? (
                                            <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                                                Limpiar búsqueda
                                            </Button>
                                        ) : (
                                            <Button variant="outline" size="sm" onClick={openNewDialog}>
                                                <Plus className="h-4 w-4 mr-2" />
                                                Agregar primer producto
                                            </Button>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredProducts.map((product) => (
                                <TableRow key={product.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="relative h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                                                {canRenderProductImage(product.image_url) ? (
                                                    <Image
                                                        src={product.image_url!}
                                                        alt={product.name}
                                                        fill
                                                        sizes="40px"
                                                        className="object-cover"
                                                    />
                                                ) : (
                                                    <Package className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="font-medium">{product.name}</div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="capitalize">
                                            {product.category || "General"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{formatPrice(product.price)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center justify-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => updateStock(product.id, product.stock - 1)}
                                                disabled={product.stock <= 0}
                                            >
                                                <Minus className="h-3 w-3" />
                                            </Button>
                                            <span className={`w-8 text-center font-mono ${product.stock <= 5 ? 'text-amber-500 font-bold' : ''}`}>
                                                {product.stock}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8"
                                                onClick={() => updateStock(product.id, product.stock + 1)}
                                            >
                                                <Plus className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <Switch
                                            checked={product.is_active}
                                            onCheckedChange={() => toggleActive(product.id, product.is_active)}
                                        />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <div className="flex justify-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openEditDialog(product)}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-red-400 hover:text-red-500"
                                                onClick={() => deleteProduct(product.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
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
        </div>
    );
}
