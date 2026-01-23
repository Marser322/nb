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
import { Minus, Plus, Search, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types/database.types";

export default function AdminProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const supabase = createClient();

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
            // Revert on error
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
        }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Inventario de Productos</h1>
                    <p className="text-muted-foreground">
                        Gestiona el stock y la visibilidad de tus productos.
                    </p>
                </div>
                {/* Futuro: Botón agregar producto */}
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
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Producto</TableHead>
                            <TableHead>Categoría</TableHead>
                            <TableHead>Precio</TableHead>
                            <TableHead className="text-center">Stock</TableHead>
                            <TableHead className="text-center">Estado</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando inventario...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : filteredProducts.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No se encontraron productos.
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredProducts.map((product) => (
                                <TableRow key={product.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                                                {product.image_url ? (
                                                    <img src={product.image_url} alt="" className="h-full w-full object-cover" />
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
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
