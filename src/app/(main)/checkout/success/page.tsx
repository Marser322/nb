"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShoppingBag, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function CheckoutSuccessPage() {
    return (
        <div className="min-h-[80vh] flex items-center justify-center bg-background px-4">
            <Card className="max-w-md w-full bg-card/50 border-border/50 backdrop-blur">
                <CardContent className="pt-12 pb-8 px-6 text-center space-y-6">
                    <div className="mx-auto w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-6">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                    </div>

                    <div className="space-y-2">
                        <h1 className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-amber-600">
                            ¡Pedido Confirmado!
                        </h1>
                        <p className="text-muted-foreground">
                            Gracias por tu compra. Prepararemos tu pedido a la brevedad.
                        </p>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-lg text-sm text-left space-y-2 border border-border/50">
                        <p className="flex justify-between">
                            <span className="text-muted-foreground">Estado:</span>
                            <span className="font-medium text-primary">Pendiente de Retiro</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                            Te enviaremos un email cuando tu pedido esté listo para retirar por el local.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 pt-4">
                        <Button asChild className="w-full text-lg h-12">
                            <Link href="/">
                                <Home className="mr-2 h-4 w-4" />
                                Volver al Inicio
                            </Link>
                        </Button>
                        <Button variant="outline" asChild className="w-full">
                            <Link href="/tienda">
                                <ShoppingBag className="mr-2 h-4 w-4" />
                                Seguir Comprando
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
