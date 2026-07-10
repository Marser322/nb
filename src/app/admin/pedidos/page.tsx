"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInDays, differenceInHours, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, ClipboardList, Eye, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import {
    FULFILLMENT_LABELS,
    ORDER_STATUS_COLORS,
    ORDER_STATUS_LABELS,
    ORDER_TYPE_COLORS,
    ORDER_TYPE_LABELS,
} from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import type { Branch, OrderStatus } from "@/types/database.types";
import { AdminPageHeader } from "@/components/admin/admin-ui";

type AdminOrder = {
    id: string;
    created_at: string;
    total: number;
    status: OrderStatus;
    payment_method: string | null;
    order_type: string;
    fulfillment: string;
    contact_name: string | null;
    contact_phone: string | null;
    delivery_address: string | null;
    notes: string | null;
    client?: { full_name: string | null; phone: string | null } | null;
    branch?: { name: string | null; address: string | null } | null;
    items?: {
        id: string;
        quantity: number;
        unit_price: number;
        product?: { name: string | null } | null;
    }[];
};

const STATUS_OPTIONS = ["all", "pending", "paid", "shipped", "delivered", "cancelled"];
const TYPE_OPTIONS = ["all", "online", "local"];

export default function AdminPedidosPage() {
    const { features, isLoaded } = useFeatures();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const [orders, setOrders] = useState<AdminOrder[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [typeFilter, setTypeFilter] = useState("all");
    const [branchFilter, setBranchFilter] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

    const loadBranches = useCallback(async () => {
        const { data } = await supabase
            .from("branches")
            .select("*")
            .eq("is_active", true)
            .order("created_at");
        setBranches((data || []) as Branch[]);
    }, [supabase]);

    const loadOrders = useCallback(async () => {
        setIsLoading(true);

        let query = supabase
            .from("orders")
            .select(`
                *,
                client:profiles(full_name, phone),
                branch:branches(name, address),
                items:order_items(id, quantity, unit_price, product:products(name))
            `)
            .order("created_at", { ascending: false });

        if (statusFilter !== "all") query = query.eq("status", statusFilter);
        if (typeFilter !== "all") query = query.eq("order_type", typeFilter);
        if (branchFilter !== "all") query = query.eq("branch_id", branchFilter);
        if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
        if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);

        const { data, error } = await query;

        if (error) {
            toast.error("No pudimos cargar los pedidos");
            setOrders([]);
        } else {
            setOrders((data || []) as AdminOrder[]);
        }

        setIsLoading(false);
    }, [branchFilter, dateFrom, dateTo, statusFilter, supabase, typeFilter]);

    useEffect(() => {
        if (isLoaded && !features.tienda) {
            toast.error("El módulo de tienda no está activo");
            router.replace("/admin/dashboard");
        }
    }, [isLoaded, features.tienda, router]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadBranches();
    }, [loadBranches]);

    useEffect(() => {
        if (isLoaded && features.tienda) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadOrders();
        }
    }, [isLoaded, features.tienda, loadOrders]);

    const mapStatusError = (message?: string) => {
        if (!message) return "No pudimos actualizar el pedido";
        if (message.includes("TRANSICION_INVALIDA")) return "Ese cambio de estado no está permitido.";
        if (message.includes("ORDEN_NO_ENCONTRADA")) return "No encontramos la orden.";
        if (message.includes("NO_AUTORIZADO")) return "No tenés permisos para esta acción.";
        return message;
    };

    // Pedidos pending "viejos" (>= 48h): retienen stock indefinidamente sin
    // que nadie los vea. Sin cron de expiración (fuera de alcance): solo se
    // destacan para que el admin decida cancelarlos a mano.
    const STALE_PENDING_HOURS = 48;

    const isStalePending = (order: AdminOrder) =>
        order.status === "pending" && differenceInHours(new Date(), parseISO(order.created_at)) >= STALE_PENDING_HOURS;

    const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
        setUpdatingOrderId(orderId);

        const { data, error } = await supabase.rpc("update_order_status", {
            p_order_id: orderId,
            p_new_status: newStatus,
        });

        if (error) {
            toast.error(mapStatusError(error.message));
        } else if (newStatus === "cancelled") {
            const result = data as { restock_skipped?: boolean; reversed?: boolean } | null;
            if (result?.restock_skipped) {
                toast.warning("Pedido sin sucursal: el stock no se devolvió automáticamente, ajustalo a mano en Productos");
            } else if (result?.reversed) {
                toast.success("Pedido cancelado — stock devuelto y reversa registrada en caja");
            } else {
                toast.success("Pedido cancelado — stock devuelto");
            }
            await loadOrders();
        } else {
            toast.success("Pedido actualizado");
            await loadOrders();
        }

        setUpdatingOrderId(null);
    };

    const getActions = (order: AdminOrder) => {
        // Ventas de mostrador (order_type='local') nacen ya 'paid' y retiradas
        // en el momento: no tienen envío ni entrega que gestionar, solo se
        // pueden cancelar (p.ej. devolución) mientras no estén en un estado
        // terminal.
        if (order.order_type === "local") {
            if (order.status === "cancelled" || order.status === "delivered") return [];
            return [{ label: "Cancelar", status: "cancelled" as OrderStatus }];
        }

        if (order.status === "pending") {
            const payAction = { label: "Marcar pagada", status: "paid" as OrderStatus };
            const cancelAction = { label: "Cancelar", status: "cancelled" as OrderStatus };
            // Pendientes viejos: priorizar Cancelar (retienen stock hace días).
            return isStalePending(order) ? [cancelAction, payAction] : [payAction, cancelAction];
        }
        if (order.status === "paid") {
            return [
                { label: "Enviar", status: "shipped" as OrderStatus },
                { label: "Entregar", status: "delivered" as OrderStatus },
                { label: "Cancelar", status: "cancelled" as OrderStatus },
            ];
        }
        if (order.status === "shipped") {
            return [
                { label: "Entregar", status: "delivered" as OrderStatus },
                { label: "Cancelar", status: "cancelled" as OrderStatus },
            ];
        }
        return [];
    };

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
                eyebrow="Ventas"
                title="Pedidos"
                icon={ClipboardList}
                description="Gestioná pedidos online, ventas locales y cambios de estado."
            />

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 rounded-lg border bg-card p-4">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="text-base md:text-sm">
                        <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                                {status === "all" ? "Todos los estados" : ORDER_STATUS_LABELS[status]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="text-base md:text-sm">
                        <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                        {TYPE_OPTIONS.map((type) => (
                            <SelectItem key={type} value={type}>
                                {type === "all" ? "Todos los tipos" : ORDER_TYPE_LABELS[type]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={branchFilter} onValueChange={setBranchFilter}>
                    <SelectTrigger className="text-base md:text-sm">
                        <SelectValue placeholder="Sucursal" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas las sucursales</SelectItem>
                        {branches.map((branch) => (
                            <SelectItem key={branch.id} value={branch.id}>
                                {branch.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="text-base md:text-sm"
                />
                <Input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="text-base md:text-sm"
                />
            </div>

            <div className="grid gap-3 md:hidden">
                {isLoading ? <div className="h-32 animate-pulse rounded-2xl bg-muted/40" /> : orders.length === 0 ? (
                    <div className="admin-empty-state rounded-2xl p-5 text-center text-sm text-muted-foreground">No hay pedidos para los filtros elegidos.</div>
                ) : orders.map((order) => {
                    const itemCount = order.items?.reduce((total, item) => total + item.quantity, 0) || 0;
                    const actions = getActions(order);
                    return (
                        <div key={order.id} className="admin-mobile-record">
                            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8).toUpperCase()}</p><p className="mt-1 font-semibold">{order.client?.full_name || order.contact_name || "Venta sin cliente"}</p><p className="mt-1 text-xs text-muted-foreground">{format(parseISO(order.created_at), "d MMM yyyy", { locale: es })} · {order.branch?.name || "Sin sucursal"}</p></div><Badge variant="outline" className={ORDER_STATUS_COLORS[order.status] || ""}>{ORDER_STATUS_LABELS[order.status] || order.status}</Badge></div>
                            <div className="mt-4 grid grid-cols-3 gap-2 border-y border-border/60 py-3 text-xs"><div><span className="block text-muted-foreground">Tipo</span><strong>{ORDER_TYPE_LABELS[order.order_type] || order.order_type}</strong></div><div><span className="block text-muted-foreground">Items</span><strong>{itemCount}</strong></div><div><span className="block text-muted-foreground">Total</span><strong className="text-primary">{formatPrice(order.total)}</strong></div></div>
                            <div className="mt-3 flex flex-wrap justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setSelectedOrder(order)}><Eye className="mr-2 h-4 w-4" aria-hidden="true" />Detalle</Button>{actions.map((action) => <Button key={action.status} variant={action.status === "cancelled" ? "ghost" : "outline"} size="sm" disabled={updatingOrderId === order.id} onClick={() => updateOrderStatus(order.id, action.status)} className={action.status === "cancelled" ? "text-destructive hover:text-destructive" : ""}>{action.label}</Button>)}</div>
                        </div>
                    );
                })}
            </div>

            <div className="hidden rounded-md border bg-card md:block">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Orden</TableHead>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Cliente</TableHead>
                                <TableHead>Sucursal</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead className="text-center">Items</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                [...Array(5)].map((_, index) => (
                                    <TableRow key={index}>
                                        <TableCell colSpan={9}>
                                            <div className="h-10 rounded bg-muted/30 animate-pulse" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : orders.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                                        <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                                        No hay pedidos para los filtros elegidos.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                orders.map((order) => {
                                    const itemCount = order.items?.reduce((total, item) => total + item.quantity, 0) || 0;
                                    const actions = getActions(order);

                                    return (
                                        <TableRow key={order.id}>
                                            <TableCell className="font-mono">#{order.id.slice(0, 8).toUpperCase()}</TableCell>
                                            <TableCell>{format(parseISO(order.created_at), "d MMM yyyy", { locale: es })}</TableCell>
                                            <TableCell>{order.client?.full_name || order.contact_name || "Venta sin cliente"}</TableCell>
                                            <TableCell>{order.branch?.name || "Sin sucursal"}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={ORDER_TYPE_COLORS[order.order_type] || ""}>
                                                    {ORDER_TYPE_LABELS[order.order_type] || order.order_type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">{itemCount}</TableCell>
                                            <TableCell className="text-right font-semibold">{formatPrice(order.total)}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <Badge variant="outline" className={ORDER_STATUS_COLORS[order.status] || ""}>
                                                        {ORDER_STATUS_LABELS[order.status] || order.status}
                                                    </Badge>
                                                    {isStalePending(order) && (
                                                        <Badge variant="outline" className="admin-warning-surface text-[10px] font-normal">
                                                            <AlertTriangle className="admin-warning-icon mr-1 h-3 w-3" />
                                                            Pendiente hace {(() => {
                                                                const days = differenceInDays(new Date(), parseISO(order.created_at));
                                                                return `${days} día${days === 1 ? "" : "s"}`;
                                                            })()}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex justify-end gap-2">
                                                    <Button variant="outline" size="icon" onClick={() => setSelectedOrder(order)} aria-label={`Ver pedido ${order.id.slice(0, 8)}`}>
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    {actions.map((action) => (
                                                        <Button
                                                            key={action.status}
                                                            variant={action.status === "cancelled" ? "ghost" : "outline"}
                                                            size="sm"
                                                            disabled={updatingOrderId === order.id}
                                                            onClick={() => updateOrderStatus(order.id, action.status)}
                                                            className={action.status === "cancelled" ? "text-destructive hover:text-destructive" : ""}
                                                        >
                                                            {updatingOrderId === order.id && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                                                            {action.label}
                                                        </Button>
                                                    ))}
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

            <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>
                            Pedido #{selectedOrder?.id.slice(0, 8).toUpperCase()}
                        </DialogTitle>
                    </DialogHeader>
                    {selectedOrder && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                                    <p className="font-semibold text-foreground">Datos</p>
                                    <p><span className="text-muted-foreground">Cliente:</span> {selectedOrder.client?.full_name || selectedOrder.contact_name || "Venta sin cliente"}</p>
                                    <p><span className="text-muted-foreground">Teléfono:</span> {selectedOrder.contact_phone || selectedOrder.client?.phone || "Sin teléfono"}</p>
                                    <p><span className="text-muted-foreground">Pago:</span> {selectedOrder.payment_method || "Sin método"}</p>
                                </div>
                                <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                                    <p className="font-semibold text-foreground">Entrega</p>
                                    <p>{FULFILLMENT_LABELS[selectedOrder.fulfillment] || selectedOrder.fulfillment}</p>
                                    <p>{selectedOrder.branch?.name || "Sin sucursal"}</p>
                                    {selectedOrder.delivery_address && <p>{selectedOrder.delivery_address}</p>}
                                    {selectedOrder.notes && <p className="text-muted-foreground">{selectedOrder.notes}</p>}
                                </div>
                            </div>

                            <div className="rounded-lg border border-border">
                                <div className="p-4 border-b font-semibold flex items-center gap-2">
                                    <Package className="h-4 w-4 text-primary" />
                                    Productos
                                </div>
                                <div className="divide-y divide-border">
                                    {selectedOrder.items?.map((item) => (
                                        <div key={item.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                                            <div>
                                                <p className="font-medium text-foreground">{item.product?.name || "Producto"}</p>
                                                <p className="text-muted-foreground">x{item.quantity} · {formatPrice(item.unit_price)}</p>
                                            </div>
                                            <p className="font-semibold">{formatPrice(item.unit_price * item.quantity)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-border pt-4">
                                <span className="font-semibold">Total</span>
                                <span className="text-xl font-bold text-primary">{formatPrice(selectedOrder.total)}</span>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
