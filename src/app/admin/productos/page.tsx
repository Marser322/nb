"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Edit2, Loader2, Minus, Package, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { ImageUpload } from "@/components/admin/image-upload";
import { IllustratedEmptyState } from "@/components/shared/IllustratedEmptyState";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { Branch, Product, ProductStock } from "@/types/database.types";
import { AdminPageHeader, AdminToolbar } from "@/components/admin/admin-ui";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { getProductImageFallback } from "@/lib/static-data";

export default function AdminProductsPage() {
    const { features, isLoaded } = useFeatures();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [products, setProducts] = useState<Product[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [stockRows, setStockRows] = useState<ProductStock[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        price: "",
        initialStock: "0",
        category: "",
        image_url: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadProducts = useCallback(async () => {
        setIsLoading(true);

        const [productsRes, branchesRes, stockRes] = await Promise.all([
            supabase.from("products").select("*").order("name"),
            supabase.from("branches").select("*").eq("is_active", true).order("created_at"),
            supabase.from("product_stock").select("*"),
        ]);

        if (productsRes.data) setProducts(productsRes.data as Product[]);
        if (branchesRes.data) {
            setBranches(branchesRes.data as Branch[]);
            setSelectedBranchId((current) => current || branchesRes.data?.[0]?.id || "");
        }
        if (stockRes.data) setStockRows(stockRes.data as ProductStock[]);

        setIsLoading(false);
    }, [supabase]);

    useEffect(() => {
        if (isLoaded && !features.tienda) {
            toast.error("El módulo de tienda no está activo");
            router.replace("/admin/dashboard");
        }
    }, [isLoaded, features.tienda, router]);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const getStockRow = (productId: string, branchId: string) =>
        stockRows.find((row) => row.product_id === productId && row.branch_id === branchId);

    const updateStock = async (product: Product, branchId: string, newStock: number) => {
        if (!branchId) {
            toast.error("Elegí una sucursal para ajustar stock");
            return;
        }
        if (newStock < 0) return;

        const previousRows = stockRows;
        const currentRow = getStockRow(product.id, branchId);
        const oldQuantity = currentRow?.quantity || 0;
        const delta = newStock - oldQuantity;

        setStockRows((rows) => {
            const exists = rows.some((row) => row.product_id === product.id && row.branch_id === branchId);
            if (exists) {
                return rows.map((row) =>
                    row.product_id === product.id && row.branch_id === branchId
                        ? { ...row, quantity: newStock }
                        : row
                );
            }
            return [
                ...rows,
                {
                    product_id: product.id,
                    branch_id: branchId,
                    quantity: newStock,
                    low_stock_threshold: product.low_stock_threshold || 5,
                    updated_at: new Date().toISOString(),
                },
            ];
        });
        setProducts((rows) => rows.map((row) => row.id === product.id ? { ...row, stock: Math.max(0, row.stock + delta) } : row));

        const { error } = await supabase.rpc("set_product_stock", {
            p_product_id: product.id,
            p_branch_id: branchId,
            p_new_quantity: newStock,
        });

        if (error) {
            setStockRows(previousRows);
            toast.error("No pudimos actualizar el stock");
            loadProducts();
        } else {
            toast.success("Stock actualizado");
        }
    };

    const toggleActive = async (productId: string, currentState: boolean) => {
        setProducts(products.map((product) =>
            product.id === productId ? { ...product, is_active: !currentState } : product
        ));

        const { error } = await supabase
            .from("products")
            .update({ is_active: !currentState })
            .eq("id", productId);

        if (error) {
            toast.error("No pudimos cambiar el estado");
            loadProducts();
        } else {
            toast.success(currentState ? "Producto desactivado" : "Producto activado");
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSubmitting(true);

        try {
            const productData = {
                name: formData.name,
                description: formData.description || null,
                price: parseFloat(formData.price),
                stock: editingProduct ? editingProduct.stock : 0,
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
                    toast.error("No pudimos actualizar el producto");
                    return;
                }

                toast.success("Producto actualizado");
            } else {
                const { data, error } = await supabase
                    .from("products")
                    .insert(productData)
                    .select("*")
                    .single();

                if (error || !data) {
                    toast.error("No pudimos crear el producto");
                    return;
                }

                const initialStock = parseInt(formData.initialStock || "0", 10);
                if (selectedBranchId && initialStock > 0) {
                    const { error: stockError } = await supabase.rpc("set_product_stock", {
                        p_product_id: data.id,
                        p_branch_id: selectedBranchId,
                        p_new_quantity: initialStock,
                    });

                    if (stockError) {
                        toast.error("Producto creado, pero no pudimos cargar el stock inicial");
                    }
                }

                toast.success("Producto creado");
            }

            setIsDialogOpen(false);
            resetForm();
            loadProducts();
        } finally {
            setIsSubmitting(false);
        }
    };

    const deleteProduct = async (productId: string) => {
        if (!confirm("¿Seguro que querés eliminar este producto?")) return;

        const { error } = await supabase
            .from("products")
            .delete()
            .eq("id", productId);

        if (error) {
            toast.error("No pudimos eliminar el producto");
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
            initialStock: "0",
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
            initialStock: "0",
            category: "",
            image_url: "",
        });
        setEditingProduct(null);
    };

    const filteredProducts = products.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
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
            <AdminPageHeader
                eyebrow="Catálogo"
                title="Inventario de productos"
                icon={Package}
                description="Gestioná stock, precios y visibilidad por sucursal."
                action={(
                    <Button id="admin-btn-new-product" onClick={openNewDialog}>
                        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                        Agregar producto
                    </Button>
                )}
            />
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                {editingProduct ? "Editar producto" : "Nuevo producto"}
                            </DialogTitle>
                            <DialogDescription>
                                Completá la ficha, el precio y la imagen visible en la tienda.
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                            <div>
                                <label className="text-sm font-medium mb-2 block">Nombre</label>
                                <Input
                                    placeholder="Cera Mate Premium"
                                    value={formData.name}
                                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                                    className="text-base md:text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Descripción</label>
                                <Input
                                    placeholder="Cera de acabado mate para estilos texturizados…"
                                    value={formData.description}
                                    onChange={(event) => setFormData({ ...formData, description: event.target.value })}
                                    className="text-base md:text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Precio (UYU)</label>
                                    <Input
                                        type="number"
                                        placeholder="450"
                                        value={formData.price}
                                        onChange={(event) => setFormData({ ...formData, price: event.target.value })}
                                        className="text-base md:text-sm"
                                        required
                                    />
                                </div>
                                {!editingProduct && (
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">Stock inicial</label>
                                        <Input
                                            type="number"
                                            min="0"
                                            placeholder="10"
                                            value={formData.initialStock}
                                            onChange={(event) => setFormData({ ...formData, initialStock: event.target.value })}
                                            className="text-base md:text-sm"
                                        />
                                    </div>
                                )}
                            </div>
                            {!editingProduct && selectedBranchId && (
                                <p className="text-xs text-muted-foreground">
                                    El stock inicial se carga en {branches.find((branch) => branch.id === selectedBranchId)?.name || "la sucursal seleccionada"}.
                                </p>
                            )}
                            <div>
                                <label className="text-sm font-medium mb-2 block">Categoría</label>
                                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                                    <SelectTrigger className="text-base md:text-sm">
                                        <SelectValue placeholder="Seleccionar categoría" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PRODUCT_CATEGORIES.map((category) => (
                                            <SelectItem key={category} value={category}>
                                                {category}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="text-sm font-medium mb-2 block">Imagen del producto</label>
                                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                    <ImageUpload
                                        value={formData.image_url}
                                        onChange={(url) => setFormData({ ...formData, image_url: url })}
                                        folder="products"
                                        placeholder="Subir imagen"
                                    />
                                    <div className="flex-1 space-y-2 w-full">
                                        <span className="text-xs text-muted-foreground">O introducí una URL externa:</span>
                                        <Input
                                            placeholder="https://ejemplo.com/producto.jpg"
                                            value={formData.image_url}
                                            onChange={(event) => setFormData({ ...formData, image_url: event.target.value })}
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
                                    {editingProduct ? "Guardá cambios" : "Crear producto"}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
            </Dialog>

            <AdminToolbar>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <Input
                        placeholder="Buscar producto…"
                        aria-label="Buscar producto"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="min-w-0 border-none bg-transparent px-0 text-base focus-visible:ring-0 md:text-sm"
                    />
                </div>
                <div className="w-full md:w-72">
                    <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                        <SelectTrigger aria-label="Filtrar por sucursal" className="w-full text-base md:text-sm">
                            <SelectValue placeholder="Sucursal" />
                        </SelectTrigger>
                        <SelectContent>
                            {branches.map((branch) => (
                                <SelectItem key={branch.id} value={branch.id}>
                                    {branch.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </AdminToolbar>

            <div className="grid gap-3 md:hidden">
                {isLoading ? (
                    [...Array(3)].map((_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl bg-muted/40" />)
                ) : filteredProducts.length === 0 ? (
                    <IllustratedEmptyState
                        icon={Package}
                        imageSrc="/images/empty/no-productos.webp"
                        imageAlt="Estantería premium de productos New Brothers sin inventario visible"
                        title="No se encontraron productos"
                        description={searchQuery ? "Ajustá la búsqueda para ubicar el producto." : "Registrá el primer producto para iniciar el inventario."}
                    />
                ) : filteredProducts.map((product) => {
                    const stockRow = selectedBranchId ? getStockRow(product.id, selectedBranchId) : null;
                    const branchStock = stockRow?.quantity || 0;
                    const threshold = stockRow?.low_stock_threshold ?? product.low_stock_threshold ?? 5;
                    const isLowStock = branchStock <= threshold;
                    return (
                        <div key={product.id} className="admin-mobile-record">
                            <div className="flex gap-3">
                                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                                    <ImageWithFallback
                                        src={product.image_url}
                                        fallbackSrc={getProductImageFallback(product)}
                                        alt={product.name}
                                        fill
                                        sizes="64px"
                                        className="object-cover"
                                        fallbackClassName="h-full w-full"
                                    />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0"><p className="truncate font-semibold">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{product.category || "General"}</p></div>
                                        <Switch checked={product.is_active} onCheckedChange={() => toggleActive(product.id, product.is_active)} aria-label={`${product.is_active ? "Desactivar" : "Activar"} ${product.name}`} />
                                    </div>
                                    <p className="mt-2 font-bold text-primary">{formatPrice(product.price)}</p>
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stock sucursal</p><p className={isLowStock ? "font-bold text-primary" : "font-bold"}>{branchStock} <span className="font-normal text-muted-foreground">/ {product.stock} total</span></p></div>
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" onClick={() => updateStock(product, selectedBranchId, branchStock - 1)} disabled={!selectedBranchId || branchStock <= 0} aria-label={`Restar stock de ${product.name}`}><Minus className="h-4 w-4" aria-hidden="true" /></Button>
                                    <Button variant="outline" size="icon" onClick={() => updateStock(product, selectedBranchId, branchStock + 1)} disabled={!selectedBranchId} aria-label={`Sumar stock de ${product.name}`}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)} aria-label={`Editar ${product.name}`}><Edit2 className="h-4 w-4" aria-hidden="true" /></Button>
                                    <Button variant="ghost" size="icon" onClick={() => deleteProduct(product.id)} aria-label={`Eliminar ${product.name}`} className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                                </div>
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
                                <TableHead>Producto</TableHead>
                                <TableHead>Categoría</TableHead>
                                <TableHead>Precio</TableHead>
                                <TableHead className="text-center">Stock sucursal</TableHead>
                                <TableHead className="text-center">Total</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-center">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [...Array(4)].map((_, index) => (
                                    <TableRow key={index}>
                                        <TableCell colSpan={7}>
                                            <div className="h-12 bg-muted/30 rounded animate-pulse" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filteredProducts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="py-4 text-center text-muted-foreground">
                                        <IllustratedEmptyState
                                            icon={Package}
                                            imageSrc="/images/empty/no-productos.webp"
                                            imageAlt="Estantería premium de productos New Brothers sin inventario visible"
                                            title="No se encontraron productos"
                                            description={searchQuery ? "Ajustá el término de búsqueda para ubicar el producto correcto." : "Registrá el primer producto para que aparezca en la tienda y el inventario."}
                                            action={
                                                searchQuery ? (
                                                    <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                                                        Limpiar búsqueda
                                                    </Button>
                                                ) : (
                                                    <Button variant="outline" size="sm" onClick={openNewDialog}>
                                                        <Plus className="mr-2 h-4 w-4" />
                                                        Agregar primer producto
                                                    </Button>
                                                )
                                            }
                                        />
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredProducts.map((product) => {
                                    const stockRow = selectedBranchId ? getStockRow(product.id, selectedBranchId) : null;
                                    const branchStock = stockRow?.quantity || 0;
                                    const threshold = stockRow?.low_stock_threshold ?? product.low_stock_threshold ?? 5;
                                    const isLowStock = branchStock <= threshold;

                                    return (
                                        <TableRow key={product.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="relative h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                                                        <ImageWithFallback
                                                            src={product.image_url}
                                                            fallbackSrc={getProductImageFallback(product)}
                                                            alt={product.name}
                                                            fill
                                                            sizes="40px"
                                                            className="object-cover"
                                                            fallbackClassName="h-full w-full"
                                                        />
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
                                                        className="h-10 w-10 md:h-8 md:w-8"
                                                        onClick={() => updateStock(product, selectedBranchId, branchStock - 1)}
                                                        disabled={!selectedBranchId || branchStock <= 0}
                                                        aria-label={`Restar stock de ${product.name}`}
                                                    >
                                                        <Minus className="h-3 w-3" />
                                                    </Button>
                                                    <span className={`w-10 text-center font-mono ${isLowStock ? "text-primary font-bold" : ""}`}>
                                                        {branchStock}
                                                    </span>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        className="h-10 w-10 md:h-8 md:w-8"
                                                        onClick={() => updateStock(product, selectedBranchId, branchStock + 1)}
                                                        disabled={!selectedBranchId}
                                                        aria-label={`Sumar stock de ${product.name}`}
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                {isLowStock && (
                                                    <p className="mt-1 text-center text-xs text-primary">
                                                        Bajo umbral ({threshold})
                                                    </p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-center font-mono">{product.stock}</TableCell>
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
                                                        className="h-10 w-10 md:h-8 md:w-8"
                                                        onClick={() => openEditDialog(product)}
                                                        aria-label={`Editar ${product.name}`}
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-10 w-10 text-destructive hover:text-destructive md:h-8 md:w-8"
                                                        onClick={() => deleteProduct(product.id)}
                                                        aria-label={`Eliminar ${product.name}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
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
