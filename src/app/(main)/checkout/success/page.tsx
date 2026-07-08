"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Home, Loader2, MessageCircle, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
    BANK_TRANSFER_INFO,
    BUSINESS_CONFIG,
    FULFILLMENT_LABELS,
    ORDER_STATUS_COLORS,
    ORDER_STATUS_LABELS,
    PAYMENT_METHOD_LABELS,
    ROUTES,
} from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { buildWaLink } from "@/lib/whatsapp";

const hasBankTransferInfo = Boolean(
    BANK_TRANSFER_INFO.bank && BANK_TRANSFER_INFO.account && BANK_TRANSFER_INFO.holder
);

type SuccessOrder = {
    id: string;
    total: number;
    status: string;
    fulfillment: string;
    payment_method: string | null;
    created_at: string;
    branch?: { name: string | null } | null;
};

function CheckoutSuccessContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get("order");
    const supabase = useMemo(() => createClient(), []);
    const [order, setOrder] = useState<SuccessOrder | null>(null);
    const [isLoading, setIsLoading] = useState(Boolean(orderId));

    useEffect(() => {
        async function loadOrder() {
            if (!orderId) return;

            const { data } = await supabase
                .from("orders")
                .select("id, total, status, fulfillment, payment_method, created_at, branch:branches(name)")
                .eq("id", orderId)
                .maybeSingle();

            setOrder(data as SuccessOrder | null);
            setIsLoading(false);
        }

        loadOrder();
    }, [orderId, supabase]);

    const shortId = orderId ? orderId.slice(0, 8).toUpperCase() : "pendiente";
    const waLink = order
        ? buildWaLink(
              BUSINESS_CONFIG.phone,
              `Hola! Acabo de hacer el pedido #${shortId} por ${formatPrice(order.total)} por transferencia. Te paso el comprobante.`
          )
        : "";

    return (
        <div className="min-h-[80vh] flex items-center justify-center bg-background px-4">
            <Card className="max-w-md w-full bg-card/50 border-border/50 backdrop-blur">
                <CardContent className="pt-12 pb-8 px-6 text-center space-y-6">
                    <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                        <CheckCircle2 className="h-10 w-10 text-primary" />
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                            Pedido confirmado
                        </h1>
                        <p className="text-muted-foreground">
                            Gracias por tu compra. Ya registramos tu pedido #{shortId}.
                        </p>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg text-sm text-left space-y-3 border border-border/50">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-6 text-muted-foreground">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Cargando pedido...
                            </div>
                        ) : order ? (
                            <>
                                <p className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Orden:</span>
                                    <span className="font-medium text-foreground">#{shortId}</span>
                                </p>
                                <p className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Estado:</span>
                                    <Badge variant="outline" className={ORDER_STATUS_COLORS[order.status] || ""}>
                                        {ORDER_STATUS_LABELS[order.status] || order.status}
                                    </Badge>
                                </p>
                                <p className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Modalidad:</span>
                                    <span className="font-medium text-foreground">
                                        {FULFILLMENT_LABELS[order.fulfillment] || order.fulfillment}
                                    </span>
                                </p>
                                {order.branch?.name && (
                                    <p className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Sucursal:</span>
                                        <span className="font-medium text-foreground text-right">{order.branch.name}</span>
                                    </p>
                                )}
                                {order.payment_method && (
                                    <p className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Pago:</span>
                                        <span className="font-medium text-foreground">
                                            {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
                                        </span>
                                    </p>
                                )}
                                <p className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Total:</span>
                                    <span className="font-semibold text-primary">{formatPrice(order.total)}</span>
                                </p>

                                {order.payment_method === "efectivo" && (
                                    <p className="text-xs text-muted-foreground pt-2">
                                        Pagás al retirar{order.branch?.name ? ` en ${order.branch.name}` : ""}.
                                    </p>
                                )}

                                {order.payment_method === "transferencia" && (
                                    <div className="mt-2 p-3 bg-background/60 rounded-lg border border-border/50 space-y-2">
                                        {hasBankTransferInfo ? (
                                            <>
                                                <p className="font-semibold text-primary text-xs">Datos bancarios:</p>
                                                <p>Banco: <span className="text-foreground">{BANK_TRANSFER_INFO.bank}</span></p>
                                                <p>Cuenta: <span className="text-foreground">{BANK_TRANSFER_INFO.account}</span></p>
                                                <p>Titular: <span className="text-foreground">{BANK_TRANSFER_INFO.holder}</span></p>
                                            </>
                                        ) : (
                                            <p className="text-muted-foreground text-xs">
                                                Te pasamos los datos bancarios por WhatsApp al confirmar el pedido.
                                            </p>
                                        )}
                                        {waLink && (
                                            <Button asChild size="sm" className="w-full mt-2">
                                                <a href={waLink} target="_blank" rel="noopener">
                                                    <MessageCircle className="mr-2 h-4 w-4" />
                                                    Enviar comprobante por WhatsApp
                                                </a>
                                            </Button>
                                        )}
                                    </div>
                                )}

                                <p className="text-xs text-muted-foreground pt-2">
                                    Podés seguir el estado de tu pedido en Mi cuenta.
                                </p>
                            </>
                        ) : (
                            <p className="text-muted-foreground">
                                No pudimos cargar el detalle, pero el pedido quedó registrado si viste la confirmación.
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <Button asChild className="w-full text-lg h-12">
                            <Link href={ROUTES.MI_CUENTA}>
                                <Home className="mr-2 h-4 w-4" />
                                Ver mi cuenta
                            </Link>
                        </Button>
                        <Button variant="outline" asChild className="w-full">
                            <Link href={ROUTES.TIENDA}>
                                <ShoppingBag className="mr-2 h-4 w-4" />
                                Seguir comprando
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-[80vh] flex items-center justify-center bg-background px-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <CheckoutSuccessContent />
        </Suspense>
    );
}
