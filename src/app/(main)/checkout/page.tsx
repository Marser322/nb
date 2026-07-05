"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cartStore";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { formatPrice } from "@/lib/utils";
import { Loader2, ShieldCheck, Wallet, Landmark } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

type PaymentMethod = "efectivo" | "transferencia";

// Definición manual de tipo CartItem para evitar imports circulares si no está exportado correctamente
interface CartItem {
    product: {
        id: string;
        name: string;
        price: number;
        image_url?: string | null;
    };
    quantity: number;
}

export default function CheckoutPage() {
    const router = useRouter();
    const { items, getTotalPrice, clearCart } = useCartStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
    const supabase = createClient();

    // 1. Verificar Autenticación
    useEffect(() => {
        async function checkAuth() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error("Debes iniciar sesión para finalizar la compra");
                router.push("/login?next=/checkout");
                return;
            }
            setUser(user);
            setIsLoading(false);
        }
        checkAuth();
    }, [supabase, router]);

    // 2. Verificar Carrito Vacío
    useEffect(() => {
        if (!isLoading && items.length === 0) {
            router.push("/tienda");
        }
    }, [isLoading, items, router]);

    // Flujo previo a la migración 005: secuencia de escrituras desde el cliente.
    // Se mantiene como respaldo hasta que create_order_with_items exista en la DB.
    const legacyCheckout = async () => {
        if (!user) throw new Error("Sesión expirada");

        const { data: profileData } = await supabase
            .from('profiles')
            .select('id')
            .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
            .limit(1)
            .maybeSingle();

        if (!profileData) throw new Error("Error al obtener perfil de usuario");

        // Validar stock actual antes de crear la orden
        const productIds = items.map((item: CartItem) => item.product.id);
        const { data: stocks, error: stockReadError } = await supabase
            .from('products')
            .select('id, name, stock')
            .in('id', productIds);

        if (stockReadError || !stocks) throw new Error("No se pudo verificar el stock");

        for (const item of items as CartItem[]) {
            const current = stocks.find((s) => s.id === item.product.id);
            if (!current || current.stock < item.quantity) {
                throw new Error(`No hay stock suficiente de ${item.product.name}`);
            }
        }

        const total = getTotalPrice();

        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert({
                client_id: profileData.id,
                subtotal: total,
                total: total,
                status: 'pending',
                payment_method: paymentMethod
            })
            .select()
            .single();

        if (orderError) throw orderError;

        const orderItems = items.map((item: CartItem) => ({
            order_id: orderData.id,
            product_id: item.product.id,
            quantity: item.quantity,
            unit_price: item.product.price
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItems);

        if (itemsError) {
            await supabase.from('orders').delete().eq('id', orderData.id);
            throw itemsError;
        }

        // Descontar stock: si un producto falla, reponer lo ya descontado y abortar
        const decremented: CartItem[] = [];
        for (const item of items as CartItem[]) {
            const { error: stockError } = await supabase.rpc('decrement_stock', {
                p_product_id: item.product.id,
                p_quantity: item.quantity
            });

            if (stockError) {
                for (const done of decremented) {
                    // cantidad negativa repone stock (la guarda stock >= p_quantity siempre pasa)
                    await supabase.rpc('decrement_stock', {
                        p_product_id: done.product.id,
                        p_quantity: -done.quantity
                    });
                }
                await supabase.from('orders').delete().eq('id', orderData.id);
                throw new Error(`No hay stock suficiente de ${item.product.name}`);
            }
            decremented.push(item);
        }
    };

    const handleCheckout = async () => {
        if (!user) return;
        setIsProcessing(true);

        try {
            // Orden + items + descuento de stock en una sola transacción (migración 005)
            const { error: rpcError } = await supabase.rpc('create_order_with_items', {
                p_payment_method: paymentMethod,
                p_items: items.map((item: CartItem) => ({
                    product_id: item.product.id,
                    quantity: item.quantity
                }))
            });

            if (rpcError) {
                if (rpcError.code === 'PGRST202') {
                    // La función todavía no fue migrada en esta DB
                    await legacyCheckout();
                } else if (rpcError.message?.includes('STOCK_INSUFICIENTE')) {
                    const productName = rpcError.message.split('STOCK_INSUFICIENTE:')[1]?.trim();
                    throw new Error(`No hay stock suficiente de ${productName || 'un producto del carrito'}`);
                } else if (rpcError.message?.includes('PERFIL_NO_ENCONTRADO')) {
                    throw new Error("No encontramos tu perfil. Cerrá sesión y volvé a ingresar.");
                } else if (rpcError.message?.includes('PRODUCTO_NO_DISPONIBLE')) {
                    throw new Error("Un producto del carrito ya no está disponible.");
                } else {
                    throw rpcError;
                }
            }

            clearCart();
            toast.success("¡Pedido confirmado!");
            router.push("/checkout/success");

        } catch (error: unknown) {
            console.error("Checkout error:", error);
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            toast.error("Error al procesar el pedido: " + errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-background pt-24 pb-12">
                <div className="container mx-auto px-4 max-w-4xl">
                    {/* Skeleton Title */}
                    <div className="h-8 bg-muted/40 rounded w-1/3 mb-8 mx-auto md:text-left animate-pulse" />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Columna Izquierda: Método de Pago Skeleton */}
                        <div className="md:col-span-2 space-y-6">
                            <Card className="bg-card/50 border-border/50 animate-pulse">
                                <CardHeader>
                                    <div className="h-6 bg-muted/40 rounded w-1/4" />
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="h-20 bg-muted/30 rounded-lg" />
                                    <div className="h-20 bg-muted/30 rounded-lg" />
                                </CardContent>
                            </Card>
                        </div>

                        {/* Columna Derecha: Resumen Skeleton */}
                        <div className="md:col-span-1">
                            <Card className="bg-card border-border animate-pulse">
                                <CardHeader>
                                    <div className="h-6 bg-muted/40 rounded w-1/2" />
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="space-y-4">
                                        <div className="flex gap-3">
                                            <div className="h-12 w-12 rounded bg-muted/30 flex-shrink-0" />
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-muted/40 rounded w-3/4" />
                                                <div className="h-3 bg-muted/30 rounded w-1/4" />
                                            </div>
                                            <div className="h-4 bg-muted/40 rounded w-10" />
                                        </div>
                                    </div>
                                    <Separator className="bg-border/30" />
                                    <div className="space-y-2">
                                        <div className="h-4 bg-muted/30 rounded w-1/3" />
                                        <div className="h-6 bg-muted/40 rounded w-1/2" />
                                    </div>
                                    <div className="h-12 bg-muted/30 rounded" />
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (items.length === 0) return null;

    return (
        <div className="min-h-screen bg-background pt-24 pb-12">
            <div className="container mx-auto px-4 max-w-4xl">
                <h1 className="text-3xl font-bold mb-8 text-center md:text-left">Finalizar Compra</h1>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Columna Izquierda: Método de Pago */}
                    <div className="md:col-span-2 space-y-6">
                        <Card className="bg-card/50 border-border/50">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <Wallet className="h-5 w-5 text-primary" />
                                    Método de Pago
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <RadioGroup
                                    value={paymentMethod}
                                    onValueChange={(val) => setPaymentMethod(val as PaymentMethod)}
                                    className="space-y-4"
                                >
                                    {/* Opción Efectivo */}
                                    <div className={`flex items-center space-x-4 border p-4 rounded-lg cursor-pointer transition-colors ${paymentMethod === 'efectivo' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                                        <RadioGroupItem value="efectivo" id="efectivo" />
                                        <Label htmlFor="efectivo" className="flex-1 cursor-pointer">
                                            <div className="font-semibold text-base">Efectivo / Tarjeta en Local</div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Pagás al retirar tus productos en la barbería.
                                            </p>
                                        </Label>
                                        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                                    </div>

                                    {/* Opción Transferencia */}
                                    <div className={`flex items-center space-x-4 border p-4 rounded-lg cursor-pointer transition-colors ${paymentMethod === 'transferencia' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                                        <RadioGroupItem value="transferencia" id="transferencia" />
                                        <Label htmlFor="transferencia" className="flex-1 cursor-pointer">
                                            <div className="font-semibold text-base">Transferencia Bancaria</div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Enviá el comprobante por WhatsApp tras confirmar.
                                            </p>
                                        </Label>
                                        <Landmark className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                </RadioGroup>

                                {paymentMethod === 'transferencia' && (
                                    <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm space-y-2 border border-border">
                                        <p className="font-semibold text-primary">Datos Bancarios:</p>
                                        <p>Banco: <span className="text-foreground">Santander</span></p>
                                        <p>Cuenta: <span className="text-foreground">1234 5678 9012</span></p>
                                        <p>Titular: <span className="text-foreground">NB Barber S.A.</span></p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Columna Derecha: Resumen */}
                    <div className="md:col-span-1">
                        <Card className="bg-card border-border sticky top-24">
                            <CardHeader>
                                <CardTitle>Resumen del Pedido</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                    {items.map((item: CartItem) => (
                                        <div key={item.product.id} className="flex gap-3">
                                            <div className="h-12 w-12 rounded bg-muted relative overflow-hidden flex-shrink-0">
                                                {item.product.image_url && (
                                                    <Image
                                                        src={item.product.image_url}
                                                        alt={item.product.name}
                                                        fill
                                                        className="object-cover"
                                                    />
                                                )}
                                            </div>
                                            <div className="flex-1 text-sm">
                                                <p className="font-medium line-clamp-1">{item.product.name}</p>
                                                <p className="text-muted-foreground">x{item.quantity}</p>
                                            </div>
                                            <div className="text-sm font-semibold">
                                                {formatPrice(item.product.price * item.quantity)}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <Separator />

                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span>{formatPrice(getTotalPrice())}</span>
                                    </div>
                                    <div className="flex justify-between text-lg font-bold">
                                        <span>Total</span>
                                        <span className="text-primary">{formatPrice(getTotalPrice())}</span>
                                    </div>
                                </div>

                                <Button
                                    className="w-full text-lg h-12"
                                    onClick={handleCheckout}
                                    disabled={isProcessing}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            Procesando...
                                        </>
                                    ) : (
                                        "Confirmar Pedido"
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}
