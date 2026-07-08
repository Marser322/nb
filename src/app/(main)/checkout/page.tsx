"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { User } from "@supabase/supabase-js";
import { Landmark, Loader2, MapPin, MessageSquareText, ShieldCheck, Store, Truck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import { BANK_TRANSFER_INFO } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { useCartStore } from "@/stores/cartStore";
import type { Branch, FulfillmentType } from "@/types/database.types";

const hasBankTransferInfo = Boolean(
    BANK_TRANSFER_INFO.bank && BANK_TRANSFER_INFO.account && BANK_TRANSFER_INFO.holder
);

type PaymentMethod = "efectivo" | "transferencia";

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
    const { features, isLoaded: isFeaturesLoaded } = useFeatures();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const { items, getTotalPrice, clearCart } = useCartStore();
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [branchId, setBranchId] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
    const [fulfillment, setFulfillment] = useState<FulfillmentType>("pickup");
    const [contactName, setContactName] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [deliveryAddress, setDeliveryAddress] = useState("");
    const [notes, setNotes] = useState("");

    useEffect(() => {
        if (isFeaturesLoaded && !features.tienda) {
            toast.error("La tienda no está disponible");
            router.replace("/");
        }
    }, [isFeaturesLoaded, features.tienda, router]);

    useEffect(() => {
        async function loadCheckoutData() {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                toast.error("Debés iniciar sesión para finalizar la compra");
                router.push("/login?next=/checkout");
                return;
            }

            const [{ data: profile }, { data: activeBranches, error: branchesError }] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("full_name, phone")
                    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from("branches")
                    .select("*")
                    .eq("is_active", true)
                    .order("created_at"),
            ]);

            if (branchesError) {
                toast.error("No pudimos cargar las sucursales para retiro");
            }

            setUser(user);
            setContactName(profile?.full_name || "");
            setContactPhone(profile?.phone || "");
            setBranches(activeBranches || []);
            setBranchId(activeBranches?.[0]?.id || "");
            setIsLoading(false);
        }

        loadCheckoutData();
    }, [router, supabase]);

    useEffect(() => {
        if (!isLoading && items.length === 0) {
            router.push("/tienda");
        }
    }, [isLoading, items.length, router]);

    const selectedBranch = branches.find((branch) => branch.id === branchId);

    const mapCheckoutError = (message?: string) => {
        if (!message) return "No pudimos procesar el pedido.";
        if (message.includes("STOCK_INSUFICIENTE")) {
            const productName = message.split("STOCK_INSUFICIENTE:")[1]?.trim();
            return `No hay stock suficiente de ${productName || "un producto del carrito"} en esa sucursal.`;
        }
        if (message.includes("SUCURSAL_INVALIDA")) return "Elegí una sucursal activa para retirar o enviar el pedido.";
        if (message.includes("DIRECCION_REQUERIDA")) return "Ingresá la dirección de envío.";
        if (message.includes("TELEFONO_REQUERIDO")) return "Ingresá un teléfono de contacto.";
        if (message.includes("PERFIL_NO_ENCONTRADO")) return "No encontramos tu perfil. Cerrá sesión y volvé a ingresar.";
        if (message.includes("PRODUCTO_NO_DISPONIBLE")) return "Un producto del carrito ya no está disponible.";
        if (message.includes("CARRITO_VACIO")) return "El carrito está vacío.";
        return message;
    };

    const handleCheckout = async () => {
        if (!user) return;
        if (!branchId) {
            toast.error("Elegí una sucursal para continuar");
            return;
        }
        if (fulfillment === "delivery" && !deliveryAddress.trim()) {
            toast.error("Ingresá la dirección de envío");
            return;
        }
        if (fulfillment === "delivery" && !contactPhone.trim()) {
            toast.error("Ingresá un teléfono de contacto");
            return;
        }

        setIsProcessing(true);

        try {
            const { data: orderId, error } = await supabase.rpc("create_order_with_items", {
                p_payment_method: paymentMethod,
                p_items: items.map((item: CartItem) => ({
                    product_id: item.product.id,
                    quantity: item.quantity,
                })),
                p_branch_id: branchId,
                p_fulfillment: fulfillment,
                p_contact_name: contactName || null,
                p_contact_phone: contactPhone || null,
                p_delivery_address: fulfillment === "delivery" ? deliveryAddress : null,
                p_notes: notes || null,
            });

            if (error) {
                if (error.code === "PGRST202") {
                    throw new Error("La migración 019 todavía no está aplicada en la base de datos.");
                }
                throw new Error(mapCheckoutError(error.message));
            }

            clearCart();
            toast.success("Pedido confirmado");
            router.push(`/checkout/success?order=${orderId}`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Error desconocido";
            toast.error("Error al procesar el pedido: " + errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };

    if (isLoading || !isFeaturesLoaded || !features.tienda) {
        return (
            <div className="min-h-screen bg-background pt-24 pb-12">
                <div className="container mx-auto px-4 max-w-4xl">
                    <div className="h-8 bg-muted/40 rounded w-1/3 mb-8 mx-auto md:text-left animate-pulse" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
                        <div className="md:col-span-1">
                            <Card className="bg-card border-border animate-pulse">
                                <CardHeader>
                                    <div className="h-6 bg-muted/40 rounded w-1/2" />
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <div className="h-20 bg-muted/30 rounded-lg" />
                                    <Separator className="bg-border/30" />
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
            <div className="container mx-auto px-4 max-w-5xl">
                <h1 className="text-3xl font-bold mb-8 text-center md:text-left">Finalizar compra</h1>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-2 space-y-6">
                        <Card className="bg-card/50 border-border/50">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <MapPin className="h-5 w-5 text-primary" />
                                    Entrega
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-5">
                                <div className="space-y-2">
                                    <Label>Sucursal</Label>
                                    <Select value={branchId} onValueChange={setBranchId}>
                                        <SelectTrigger className="h-11 text-base md:text-sm">
                                            <SelectValue placeholder="Elegí una sucursal" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {branches.map((branch) => (
                                                <SelectItem key={branch.id} value={branch.id}>
                                                    {branch.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedBranch && (
                                        <p className="text-sm text-muted-foreground">
                                            {selectedBranch.address || "Dirección pendiente de cargar"}
                                        </p>
                                    )}
                                </div>

                                <RadioGroup
                                    value={fulfillment}
                                    onValueChange={(value) => setFulfillment(value as FulfillmentType)}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                                >
                                    <Label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer ${fulfillment === "pickup" ? "border-primary bg-primary/5" : "border-border"}`}>
                                        <RadioGroupItem value="pickup" className="mt-1" />
                                        <Store className="h-5 w-5 text-primary mt-0.5" />
                                        <span>
                                            <span className="block font-semibold">Retiro en sucursal</span>
                                            <span className="block text-sm text-muted-foreground">Pasás por el local elegido.</span>
                                        </span>
                                    </Label>
                                    <Label className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer ${fulfillment === "delivery" ? "border-primary bg-primary/5" : "border-border"}`}>
                                        <RadioGroupItem value="delivery" className="mt-1" />
                                        <Truck className="h-5 w-5 text-primary mt-0.5" />
                                        <span>
                                            <span className="block font-semibold">Envío</span>
                                            <span className="block text-sm text-muted-foreground">Coordinamos la entrega desde esa sucursal.</span>
                                        </span>
                                    </Label>
                                </RadioGroup>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="contact-name">Nombre de contacto</Label>
                                        <Input
                                            id="contact-name"
                                            value={contactName}
                                            onChange={(event) => setContactName(event.target.value)}
                                            className="text-base md:text-sm"
                                            placeholder="Tu nombre"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="contact-phone">Teléfono</Label>
                                        <Input
                                            id="contact-phone"
                                            value={contactPhone}
                                            onChange={(event) => setContactPhone(event.target.value)}
                                            className="text-base md:text-sm"
                                            placeholder="099 123 456"
                                        />
                                    </div>
                                </div>

                                {fulfillment === "delivery" && (
                                    <div className="space-y-2">
                                        <Label htmlFor="delivery-address">Dirección de envío</Label>
                                        <Input
                                            id="delivery-address"
                                            value={deliveryAddress}
                                            onChange={(event) => setDeliveryAddress(event.target.value)}
                                            className="text-base md:text-sm"
                                            placeholder="Calle, número, barrio"
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="order-notes">Notas</Label>
                                    <Textarea
                                        id="order-notes"
                                        value={notes}
                                        onChange={(event) => setNotes(event.target.value)}
                                        className="text-base md:text-sm"
                                        placeholder="Indicaciones para retiro o entrega"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-card/50 border-border/50">
                            <CardHeader>
                                <CardTitle className="text-xl flex items-center gap-2">
                                    <Wallet className="h-5 w-5 text-primary" />
                                    Método de pago
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <RadioGroup
                                    value={paymentMethod}
                                    onValueChange={(val) => setPaymentMethod(val as PaymentMethod)}
                                    className="space-y-4"
                                >
                                    <div className={`flex items-center space-x-4 border p-4 rounded-lg cursor-pointer transition-colors ${paymentMethod === "efectivo" ? "border-primary bg-primary/5" : "border-border"}`}>
                                        <RadioGroupItem value="efectivo" id="efectivo" />
                                        <Label htmlFor="efectivo" className="flex-1 cursor-pointer">
                                            <div className="font-semibold text-base">Efectivo en local</div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Pagás al retirar tus productos en la barbería.
                                            </p>
                                        </Label>
                                        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                                    </div>

                                    <div className={`flex items-center space-x-4 border p-4 rounded-lg cursor-pointer transition-colors ${paymentMethod === "transferencia" ? "border-primary bg-primary/5" : "border-border"}`}>
                                        <RadioGroupItem value="transferencia" id="transferencia" />
                                        <Label htmlFor="transferencia" className="flex-1 cursor-pointer">
                                            <div className="font-semibold text-base">Transferencia bancaria</div>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                Enviá el comprobante por WhatsApp tras confirmar.
                                            </p>
                                        </Label>
                                        <Landmark className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                </RadioGroup>

                                {paymentMethod === "transferencia" && (
                                    <div className="mt-4 p-4 bg-muted/50 rounded-lg text-sm space-y-2 border border-border">
                                        {hasBankTransferInfo ? (
                                            <>
                                                <p className="font-semibold text-primary">Datos bancarios:</p>
                                                <p>Banco: <span className="text-foreground">{BANK_TRANSFER_INFO.bank}</span></p>
                                                <p>Cuenta: <span className="text-foreground">{BANK_TRANSFER_INFO.account}</span></p>
                                                <p>Titular: <span className="text-foreground">{BANK_TRANSFER_INFO.holder}</span></p>
                                            </>
                                        ) : (
                                            <p className="text-muted-foreground">
                                                Te pasamos los datos bancarios por WhatsApp al confirmar el pedido.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <div className="md:col-span-1">
                        <Card className="bg-card border-border sticky top-24">
                            <CardHeader>
                                <CardTitle>Resumen del pedido</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                                    {items.map((item: CartItem) => (
                                        <div key={item.product.id} className="flex gap-3">
                                            <div className="h-12 w-12 rounded bg-muted relative overflow-hidden flex-shrink-0">
                                                <ImageWithFallback
                                                    src={item.product.image_url}
                                                    alt={item.product.name}
                                                    fill
                                                    sizes="48px"
                                                    className="object-cover"
                                                    fallbackClassName="h-full w-full rounded"
                                                    iconClassName="h-5 w-5"
                                                />
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

                                {selectedBranch && (
                                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                                        <p className="font-medium text-foreground">{selectedBranch.name}</p>
                                        <p>{fulfillment === "pickup" ? "Retiro en sucursal" : "Envío coordinado"}</p>
                                    </div>
                                )}

                                <Button
                                    className="w-full text-lg h-12"
                                    onClick={handleCheckout}
                                    disabled={isProcessing || branches.length === 0}
                                >
                                    {isProcessing ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                            Procesando...
                                        </>
                                    ) : (
                                        <>
                                            <MessageSquareText className="mr-2 h-5 w-5" />
                                            Confirmar pedido
                                        </>
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
