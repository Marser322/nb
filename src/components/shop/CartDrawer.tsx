"use client";

import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ImageWithFallback } from "@/components/shared/ImageWithFallback";
import { useCartStore } from "@/stores/cartStore";
import { formatPrice } from "@/lib/utils";
import { useFeatures } from "@/lib/features";

export function CartDrawer() {
    const { features } = useFeatures();
    const cartStore = useCartStore();

    if (!features.tienda) {
        return null;
    }

    const {
        items,
        isOpen,
        closeCart,
        removeItem,
        updateQuantity,
        getTotalPrice,
        clearCart,
    } = cartStore;

    const totalPrice = getTotalPrice();

    return (
        <Sheet open={isOpen} onOpenChange={closeCart}>
            <SheetContent className="w-full sm:max-w-md flex flex-col">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <ShoppingBag className="h-5 w-5 text-primary" />
                        Tu Carrito
                    </SheetTitle>
                </SheetHeader>

                {items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                        <ShoppingBag className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground mb-4">Tu carrito está vacío</p>
                        <Button variant="outline" onClick={closeCart} asChild>
                            <Link href="/tienda">Ver productos</Link>
                        </Button>
                    </div>
                ) : (
                    <>
                        <ScrollArea className="flex-1 -mx-6 px-6">
                            <div className="space-y-4 py-4">
                                {items.map((item) => (
                                    <div
                                        key={item.product.id}
                                        className="flex gap-4 p-3 rounded-lg bg-card border border-border/50"
                                    >
                                        {/* Imagen */}
                                        <div className="relative h-16 w-16 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                            <ImageWithFallback
                                                src={item.product.image_url}
                                                alt={item.product.name}
                                                fill
                                                sizes="64px"
                                                className="object-cover"
                                                fallbackClassName="h-full w-full rounded-md"
                                                iconClassName="h-6 w-6"
                                            />
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-sm truncate">
                                                {item.product.name}
                                            </h4>
                                            <p className="text-sm text-primary font-semibold">
                                                {formatPrice(item.product.price)}
                                            </p>

                                            {/* Controles de cantidad */}
                                            <div className="flex items-center gap-2 mt-2">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    aria-label={`Restar ${item.product.name}`}
                                                    className="h-11 w-11 md:h-7 md:w-7"
                                                    onClick={() =>
                                                        updateQuantity(item.product.id, item.quantity - 1)
                                                    }
                                                >
                                                    <Minus className="h-3 w-3" aria-hidden="true" />
                                                </Button>
                                                <span className="w-8 text-center text-sm font-medium">
                                                    {item.quantity}
                                                </span>
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    aria-label={`Sumar ${item.product.name}`}
                                                    className="h-11 w-11 md:h-7 md:w-7"
                                                    onClick={() =>
                                                        updateQuantity(item.product.id, item.quantity + 1)
                                                    }
                                                    disabled={item.quantity >= item.product.stock}
                                                >
                                                    <Plus className="h-3 w-3" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Eliminar */}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Quitar ${item.product.name} del carrito`}
                                            className="h-11 w-11 md:h-8 md:w-8 text-muted-foreground hover:text-red-400"
                                            onClick={() => removeItem(item.product.id)}
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>

                        <div className="space-y-4 pt-4 border-t border-border">
                            {/* Subtotal */}
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Subtotal</span>
                                <span>{formatPrice(totalPrice)}</span>
                            </div>

                            {/* Total */}
                            <div className="flex justify-between text-lg font-bold">
                                <span>Total</span>
                                <span className="text-primary">{formatPrice(totalPrice)}</span>
                            </div>

                            <Separator />

                            {/* Acciones */}
                            <div className="space-y-2">
                                <Button className="w-full" size="lg" asChild onClick={closeCart}>
                                    <Link href="/checkout">
                                        Finalizar Compra
                                    </Link>
                                </Button>
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={closeCart}
                                >
                                    Seguir Comprando
                                </Button>
                                <Button
                                    variant="ghost"
                                    className="w-full text-muted-foreground hover:text-red-400"
                                    onClick={clearCart}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Vaciar Carrito
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
