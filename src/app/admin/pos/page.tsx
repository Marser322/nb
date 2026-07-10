"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Banknote, Loader2, Minus, Package, Plus, RefreshCw, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import { getPaymentMethodLabel } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { Barber, Branch, Product, ProductStock } from "@/types/database.types";
import { AdminPageHeader } from "@/components/admin/admin-ui";

type PosPaymentMethod = "efectivo" | "transferencia" | "mercadopago";

type CartLine = {
    product: Product;
    quantity: number;
};

const PAYMENT_OPTIONS: PosPaymentMethod[] = ["efectivo", "transferencia", "mercadopago"];

export default function AdminPosPage() {
    const { features, isLoaded } = useFeatures();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [barbers, setBarbers] = useState<Barber[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [stockRows, setStockRows] = useState<ProductStock[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState("");
    const [selectedBarberId, setSelectedBarberId] = useState("none");
    const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("efectivo");
    const [notes, setNotes] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [cart, setCart] = useState<CartLine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isRefreshingStock, setIsRefreshingStock] = useState(false);
    // Líneas del carrito cuyo stock fresco (revalidado justo antes de cobrar)
    // no alcanza: productId -> unidades realmente disponibles.
    const [stockIssues, setStockIssues] = useState<Record<string, number>>({});

    const loadPosData = useCallback(async () => {
        setIsLoading(true);

        const [branchesRes, barbersRes, productsRes, stockRes] = await Promise.all([
            supabase.from("branches").select("*").eq("is_active", true).order("created_at"),
            supabase.from("barbers").select("*").eq("is_active", true).order("name"),
            supabase.from("products").select("*").eq("is_active", true).order("name"),
            supabase.from("product_stock").select("*"),
        ]);

        setBranches((branchesRes.data || []) as Branch[]);
        setBarbers((barbersRes.data || []) as Barber[]);
        setProducts((productsRes.data || []) as Product[]);
        setStockRows((stockRes.data || []) as ProductStock[]);
        setSelectedBranchId((current) => current || branchesRes.data?.[0]?.id || "");
        setIsLoading(false);
    }, [supabase]);

    // Trae el stock más reciente de product_stock (sin recargar sucursales,
    // barberos ni productos). El snapshot cargado al abrir el POS queda stale
    // apenas otra pestaña (Productos, otra venta) mueve stock; esto es lo que
    // usan tanto el botón manual como la revalidación previa a cobrar.
    const fetchStockRows = useCallback(async (): Promise<ProductStock[] | null> => {
        const { data, error } = await supabase.from("product_stock").select("*");
        if (error) return null;
        return (data || []) as ProductStock[];
    }, [supabase]);

    const refreshStock = useCallback(async () => {
        setIsRefreshingStock(true);
        const rows = await fetchStockRows();
        if (rows === null) {
            toast.error("No pudimos actualizar el stock");
        } else {
            setStockRows(rows);
        }
        setIsRefreshingStock(false);
    }, [fetchStockRows]);

    useEffect(() => {
        if (isLoaded && (!features.tienda || !features.contabilidad)) {
            toast.error("El punto de venta no está activo");
            router.replace("/admin/dashboard");
        }
    }, [isLoaded, features.tienda, features.contabilidad, router]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadPosData();
    }, [loadPosData]);

    const getBranchStock = (productId: string) =>
        stockRows.find((row) => row.product_id === productId && row.branch_id === selectedBranchId)?.quantity || 0;

    const getCartQuantity = (productId: string) =>
        cart.find((line) => line.product.id === productId)?.quantity || 0;

    const filteredProducts = products.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const total = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
    const cartItemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

    // Cualquier cambio manual al carrito invalida las marcas de stock
    // insuficiente de un intento de cobro anterior: se revalida de nuevo al
    // confirmar.
    const clearStockIssue = (productId: string) => {
        setStockIssues((issues) => {
            if (!(productId in issues)) return issues;
            return Object.fromEntries(Object.entries(issues).filter(([id]) => id !== productId));
        });
    };

    const addProduct = (product: Product) => {
        const available = getBranchStock(product.id);
        const currentQuantity = getCartQuantity(product.id);

        if (!selectedBranchId) {
            toast.error("Elegí una sucursal para vender");
            return;
        }

        if (available <= currentQuantity) {
            toast.error(`No hay más stock de ${product.name} en esta sucursal`);
            return;
        }

        clearStockIssue(product.id);
        setCart((lines) => {
            const exists = lines.some((line) => line.product.id === product.id);
            if (exists) {
                return lines.map((line) =>
                    line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line
                );
            }
            return [...lines, { product, quantity: 1 }];
        });
    };

    const decrementProduct = (productId: string) => {
        clearStockIssue(productId);
        setCart((lines) => lines.flatMap((line) => {
            if (line.product.id !== productId) return [line];
            if (line.quantity <= 1) return [];
            return [{ ...line, quantity: line.quantity - 1 }];
        }));
    };

    const removeProduct = (productId: string) => {
        clearStockIssue(productId);
        setCart((lines) => lines.filter((line) => line.product.id !== productId));
    };

    const mapSaleError = (message?: string) => {
        if (!message) return "No pudimos registrar la venta";
        if (message.includes("STOCK_INSUFICIENTE")) {
            const productName = message.split("STOCK_INSUFICIENTE:")[1]?.trim();
            return `No hay stock suficiente de ${productName || "un producto"} en esta sucursal.`;
        }
        if (message.includes("SUCURSAL_INVALIDA")) return "La sucursal elegida no está disponible para esta venta.";
        if (message.includes("BARBERO_INVALIDO")) return "El barbero elegido no está activo.";
        if (message.includes("CARRITO_VACIO")) return "Agregá productos al carrito antes de cobrar.";
        if (message.includes("NO_AUTORIZADO")) return "No tenés permisos para registrar esta venta.";
        return message;
    };

    const confirmSale = async () => {
        if (!selectedBranchId) {
            toast.error("Elegí una sucursal");
            return;
        }
        if (cart.length === 0) {
            toast.error("Agregá productos al carrito");
            return;
        }

        setIsSubmitting(true);

        // Revalidar stock fresco antes de cobrar: el snapshot cargado al abrir
        // el POS (o al elegir la sucursal) puede haber quedado stale si otra
        // pestaña vendió o ajustó stock mientras se armaba este carrito. El
        // RPC sigue siendo la fuente de verdad (mapSaleError abajo), pero acá
        // se evita ni siquiera intentarlo cuando ya sabemos que va a fallar.
        const freshRows = await fetchStockRows();
        if (freshRows === null) {
            toast.error("No pudimos verificar el stock. Probá de nuevo.");
            setIsSubmitting(false);
            return;
        }
        setStockRows(freshRows);

        const issues: Record<string, number> = {};
        cart.forEach((line) => {
            const fresh = freshRows.find((row) => row.product_id === line.product.id && row.branch_id === selectedBranchId);
            const available = fresh?.quantity ?? 0;
            if (line.quantity > available) {
                issues[line.product.id] = available;
            }
        });

        if (Object.keys(issues).length > 0) {
            setStockIssues(issues);
            cart.forEach((line) => {
                const available = issues[line.product.id];
                if (available === undefined) return;
                toast.error(`${line.product.name}: quedan ${available} unidad${available === 1 ? "" : "es"}`);
            });
            setIsSubmitting(false);
            return;
        }

        setStockIssues({});

        const { data: orderId, error } = await supabase.rpc("create_counter_sale", {
            p_branch_id: selectedBranchId,
            p_payment_method: paymentMethod,
            p_items: cart.map((line) => ({
                product_id: line.product.id,
                quantity: line.quantity,
            })),
            p_barber_id: selectedBarberId === "none" ? null : selectedBarberId,
            p_notes: notes || null,
        });

        if (error) {
            toast.error(mapSaleError(error.message));
        } else {
            toast.success(`Venta registrada #${String(orderId).slice(0, 8).toUpperCase()}`);
            setCart([]);
            setNotes("");
            await loadPosData();
        }

        setIsSubmitting(false);
    };

    if (!isLoaded || !features.tienda || !features.contabilidad) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 xl:pb-0">
            <AdminPageHeader
                eyebrow="Mostrador"
                title="Punto de venta"
                icon={ShoppingCart}
                description="Registrá ventas, descontá stock por sucursal y enviá el ingreso a caja."
            />

            <Button
                type="button"
                onClick={() => document.getElementById("pos-cart")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 justify-between rounded-full shadow-xl xl:hidden"
                aria-label={`Ver carrito con ${cartItemCount} productos por ${formatPrice(total)}`}
            >
                <span className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" aria-hidden="true" />Carrito ({cartItemCount})</span>
                <strong>{formatPrice(total)}</strong>
            </Button>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 rounded-lg border bg-card p-4">
                        <Select value={selectedBranchId} onValueChange={(value) => {
                            setSelectedBranchId(value);
                            setCart([]);
                            setStockIssues({});
                            void refreshStock();
                        }}>
                            <SelectTrigger className="text-base md:text-sm">
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

                        <div className="flex items-center gap-3">
                            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Input
                                placeholder="Buscar producto…"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                className="border-none bg-transparent focus-visible:ring-0 px-0 text-base md:text-sm"
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="shrink-0"
                                onClick={refreshStock}
                                disabled={isRefreshingStock}
                                title="Actualizar stock"
                                aria-label="Actualizar stock"
                            >
                                <RefreshCw className={`h-4 w-4 ${isRefreshingStock ? "animate-spin" : ""}`} />
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
                        {isLoading ? (
                            [...Array(6)].map((_, index) => (
                                <Card key={index} className="animate-pulse">
                                    <CardContent className="p-4">
                                        <div className="h-36 rounded bg-muted/30 mb-4" />
                                        <div className="h-4 w-2/3 rounded bg-muted/40 mb-2" />
                                        <div className="h-4 w-1/3 rounded bg-muted/30" />
                                    </CardContent>
                                </Card>
                            ))
                        ) : filteredProducts.length === 0 ? (
                            <Card className="col-span-2 2xl:col-span-3">
                                <CardContent className="py-6 text-center text-muted-foreground">
                                    <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                                    No hay productos para la búsqueda.
                                </CardContent>
                            </Card>
                        ) : (
                            filteredProducts.map((product) => {
                                const available = getBranchStock(product.id);
                                const inCart = getCartQuantity(product.id);
                                const remaining = Math.max(0, available - inCart);

                                return (
                                    <Card key={product.id} className="overflow-hidden">
                                        <div className="relative h-28 bg-muted md:h-36">
                                            {product.image_url && (product.image_url.startsWith("/") || product.image_url.includes(".supabase.co")) ? (
                                                <Image
                                                    src={product.image_url}
                                                    alt={product.name}
                                                    fill
                                                    sizes="(max-width: 768px) 50vw, 33vw"
                                                    className="object-cover"
                                                />
                                            ) : (
                                                <div className="h-full flex items-center justify-center">
                                                    <Package className="h-10 w-10 text-muted-foreground" />
                                                </div>
                                            )}
                                        </div>
                                        <CardContent className="space-y-3 p-3 md:p-4">
                                            <div>
                                                <p className="font-semibold text-foreground line-clamp-1">{product.name}</p>
                                                <div className="mt-2 flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
                                                    <span className="font-bold text-primary">{formatPrice(product.price)}</span>
                                                    <Badge variant="outline">
                                                        Stock {remaining}
                                                    </Badge>
                                                </div>
                                            </div>
                                            <Button
                                                className="w-full h-11"
                                                onClick={() => addProduct(product)}
                                                disabled={remaining <= 0}
                                            >
                                                <Plus className="mr-2 h-4 w-4" />
                                                {remaining <= 0 ? "Sin stock" : "Agregar"}
                                            </Button>
                                        </CardContent>
                                    </Card>
                                );
                            })
                        )}
                    </div>
                </div>

                <Card id="pos-cart" className="h-fit scroll-mt-24 xl:sticky xl:top-24">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ShoppingCart className="h-5 w-5 text-primary" />
                            Venta actual
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="space-y-3">
                            <Label>Sucursal</Label>
                            <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                                {branches.find((branch) => branch.id === selectedBranchId)?.name || "Sin sucursal"}
                            </p>
                        </div>

                        <div className="space-y-3">
                            <Label>Método de pago</Label>
                            <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as PosPaymentMethod)}>
                                <SelectTrigger className="text-base md:text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAYMENT_OPTIONS.map((method) => (
                                        <SelectItem key={method} value={method}>
                                            {getPaymentMethodLabel(method)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <Label>Barbero opcional</Label>
                            <Select value={selectedBarberId} onValueChange={setSelectedBarberId}>
                                <SelectTrigger className="text-base md:text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">Sin atribuir</SelectItem>
                                    {barbers.map((barber) => (
                                        <SelectItem key={barber.id} value={barber.id}>
                                            {barber.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Separator />

                        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                            {cart.length === 0 ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    <ShoppingCart className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                                    Agregá productos para iniciar la venta.
                                </div>
                            ) : (
                                cart.map((line) => {
                                    const stockIssue = stockIssues[line.product.id];

                                    return (
                                        <div key={line.product.id} className="rounded-lg border border-border bg-muted/20 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-medium text-foreground">{line.product.name}</p>
                                                    <p className="text-sm text-muted-foreground">{formatPrice(line.product.price)}</p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                                    onClick={() => removeProduct(line.product.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <div className="mt-3 flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => decrementProduct(line.product.id)}>
                                                        <Minus className="h-3 w-3" />
                                                    </Button>
                                                    <span className="w-8 text-center font-mono">{line.quantity}</span>
                                                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => addProduct(line.product)}>
                                                        <Plus className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                <p className="font-semibold">{formatPrice(line.product.price * line.quantity)}</p>
                                            </div>
                                            {stockIssue !== undefined && (
                                                <p className="mt-2 text-xs text-destructive">
                                                    Quedan {stockIssue} unidad{stockIssue === 1 ? "" : "es"} disponibles en esta sucursal
                                                </p>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="pos-notes">Notas</Label>
                            <Textarea
                                id="pos-notes"
                                value={notes}
                                onChange={(event) => setNotes(event.target.value)}
                                className="text-base md:text-sm"
                                placeholder="Detalle interno de la venta"
                            />
                        </div>

                        <Separator />

                        <div className="flex items-center justify-between">
                            <span className="font-semibold">Total</span>
                            <span className="text-2xl font-bold text-primary">{formatPrice(total)}</span>
                        </div>

                        <Button className="w-full h-12 text-base" onClick={confirmSale} disabled={isSubmitting || cart.length === 0}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Registrando...
                                </>
                            ) : (
                                <>
                                    <Banknote className="mr-2 h-5 w-5" />
                                    Cobrar venta
                                </>
                            )}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
