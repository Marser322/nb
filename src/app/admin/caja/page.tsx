"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import { CalendarDateRangePicker } from "@/components/admin/date-range-picker";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
    DollarSign,
    Scissors,
    ShoppingBag,
    TrendingUp,
    Calendar as CalendarIcon,
    Plus,
    Minus,
    CreditCard,
    Banknote,
    ArrowDownCircle,
    ArrowUpCircle,
    Loader2,
    Receipt,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
    PAYMENT_METHOD_LABELS,
    CASH_MOVEMENT_TYPE_LABELS,
    CASH_CATEGORY_LABELS,
} from "@/lib/constants";

interface CashSummary {
    totalIncome: number;
    servicesIncome: number;
    productsIncome: number;
    totalServices: number;
    totalProductsSold: number;
    cashPayments: number;
    transferPayments: number;
    cardPayments: number;
    expenses: number;
}

interface Transaction {
    id: string;
    type: 'servicio' | 'producto' | 'ingreso' | 'egreso';
    description: string;
    amount: number;
    date: string;
    status: string;
    method: string;
}

export default function AdminCajaPage() {
    const { features, isLoaded } = useFeatures();
    const router = useRouter();

    useEffect(() => {
        if (isLoaded && !features.contabilidad) {
            toast.error("El módulo contable no está activo");
            router.replace("/admin/dashboard");
        }
    }, [isLoaded, features.contabilidad, router]);

    const [date, setDate] = useState<DateRange | undefined>({
        from: new Date(),
        to: new Date(),
    });

    const [summary, setSummary] = useState<CashSummary>({
        totalIncome: 0,
        servicesIncome: 0,
        productsIncome: 0,
        totalServices: 0,
        totalProductsSold: 0,
        cashPayments: 0,
        transferPayments: 0,
        cardPayments: 0,
        expenses: 0,
    });

    const [tipsTotal, setTipsTotal] = useState(0);
    const [barbersIncome, setBarbersIncome] = useState<{ id: string; name: string; services: number; tips: number; total: number }[]>([]);
    const [barbers, setBarbers] = useState<{ id: string; name: string }[]>([]);

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMovementDialogOpen, setIsMovementDialogOpen] = useState(false);
    const [movementType, setMovementType] = useState<'income' | 'expense'>('income');
    const [movementForm, setMovementForm] = useState({
        amount: "",
        description: "",
        payment_method: "cash",
        category: "other",
        barber_id: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        if (date?.from) {
            loadCajaData();
        }
    }, [date]);

    useEffect(() => {
        async function loadBarbers() {
            const { data } = await supabase
                .from('barbers')
                .select('id, name')
                .eq('is_active', true)
                .order('name');
            setBarbers(data || []);
        }
        loadBarbers();
    }, [supabase]);

    const loadCajaData = async () => {
        setIsLoading(true);
        const startDate = date?.from ? format(date.from, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
        const endDate = date?.to ? format(date.to, 'yyyy-MM-dd') : startDate;

        // 1. Obtener Órdenes (Ingresos por Productos)
        const { data: orders } = await supabase
            .from('orders')
            .select(`
                id,
                created_at,
                total,
                status,
                payment_method,
                order_items(quantity)
            `)
            .gte('created_at', `${startDate}T00:00:00`)
            .lte('created_at', `${endDate}T23:59:59`)
            .order('created_at', { ascending: false });

        // 2. Obtener Movimientos de Caja (gastos, cobros de servicios y propinas reales, ingresos manuales)
        const { data: movements } = await supabase
            .from('cash_movements')
            .select('*, barber:barbers(name)')
            .gte('created_at', `${startDate}T00:00:00`)
            .lte('created_at', `${endDate}T23:59:59`)
            .order('created_at', { ascending: false });

        // Procesar Datos
        let sIncome = 0;
        let pIncome = 0;
        let pSold = 0;
        let cashPay = 0;
        let transferPay = 0;
        let cardPay = 0;
        let totalExpenses = 0;
        let totalTips = 0;
        let totalServicesCount = 0;
        const trans: Transaction[] = [];
        const barberBreakdown: Record<string, { name: string; services: number; tips: number }> = {};

        // Productos de la tienda
        if (orders) {
            orders.forEach(ord => {
                pIncome += Number(ord.total);
                const itemsCount = ord.order_items?.reduce((acc: number, item: { quantity: number }) => acc + item.quantity, 0) || 0;
                pSold += itemsCount;

                // Clasificar por método de pago
                if (ord.payment_method === 'cash' || ord.payment_method === 'efectivo') cashPay += Number(ord.total);
                else if (ord.payment_method === 'transfer' || ord.payment_method === 'transferencia') transferPay += Number(ord.total);
                else cardPay += Number(ord.total);

                trans.push({
                    id: ord.id,
                    type: 'producto',
                    description: `Venta de ${itemsCount} productos`,
                    amount: Number(ord.total),
                    date: ord.created_at,
                    status: ord.status === 'pending' ? 'Pendiente' : 'Pagado',
                    method: PAYMENT_METHOD_LABELS[ord.payment_method || ''] || ord.payment_method || 'N/A'
                });
            });
        }

        // Movimientos de caja (incluyendo servicios, propinas, etc.)
        if (movements) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            movements.forEach((mov: any) => {
                const amount = Number(mov.amount);

                // Acumular por barbero (para el desglose de ingresos del período)
                if (mov.barber_id && mov.type === 'income') {
                    const bName = mov.barber?.name || 'Desconocido';
                    if (!barberBreakdown[mov.barber_id]) {
                        barberBreakdown[mov.barber_id] = { name: bName, services: 0, tips: 0 };
                    }
                    if (mov.category === 'service') {
                        barberBreakdown[mov.barber_id].services += amount;
                    } else if (mov.category === 'tip') {
                        barberBreakdown[mov.barber_id].tips += amount;
                    }
                }

                if (mov.type === 'expense') {
                    totalExpenses += amount;
                    trans.push({
                        id: mov.id,
                        type: 'egreso',
                        description: mov.description || 'Gasto registrado',
                        amount: -amount,
                        date: mov.created_at,
                        status: 'Registrado',
                        method: PAYMENT_METHOD_LABELS[mov.payment_method] || mov.payment_method
                    });
                } else {
                    // Ingreso (income)
                    if (mov.category === 'service') {
                        sIncome += amount;
                        totalServicesCount++;
                    } else if (mov.category === 'tip') {
                        totalTips += amount;
                    }

                    // Clasificar por método de pago ('other' no entra en ningún desglose)
                    if (mov.payment_method === 'cash' || mov.payment_method === 'efectivo') cashPay += amount;
                    else if (mov.payment_method === 'transfer' || mov.payment_method === 'transferencia') transferPay += amount;
                    else if (mov.payment_method === 'card' || mov.payment_method === 'tarjeta') cardPay += amount;

                    const catLabel = CASH_CATEGORY_LABELS[mov.category] || mov.category;
                    const barberNameSuffix = mov.barber?.name ? ` con ${mov.barber.name}` : '';

                    trans.push({
                        id: mov.id,
                        type: mov.category === 'service' ? 'servicio' : 'ingreso',
                        description: mov.category === 'service'
                            ? `${catLabel}${barberNameSuffix}`
                            : mov.description || catLabel,
                        amount: amount,
                        date: mov.created_at,
                        status: 'Registrado',
                        method: PAYMENT_METHOD_LABELS[mov.payment_method] || mov.payment_method
                    });
                }
            });
        }

        // Ordenar transacciones por fecha desc
        trans.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Armar el desglose de ingresos por barbero
        const breakdownArray = Object.entries(barberBreakdown).map(([id, data]) => ({
            id,
            ...data,
            total: data.services + data.tips
        }));

        setSummary({
            totalIncome: sIncome + pIncome + totalTips - totalExpenses,
            servicesIncome: sIncome,
            productsIncome: pIncome,
            totalServices: totalServicesCount,
            totalProductsSold: pSold,
            cashPayments: cashPay,
            transferPayments: transferPay,
            cardPayments: cardPay,
            expenses: totalExpenses,
        });

        setTipsTotal(totalTips);
        setBarbersIncome(breakdownArray);
        setTransactions(trans);
        setIsLoading(false);
    };

    // Registrar movimiento de caja
    const handleAddMovement = async (e: React.FormEvent) => {
        e.preventDefault();

        if (movementType === 'income' && movementForm.category === 'chair_rental' && !movementForm.barber_id) {
            toast.error("Debe seleccionar al barbero asociado a la renta");
            return;
        }

        setIsSubmitting(true);

        try {
            const { error } = await supabase.from('cash_movements').insert({
                type: movementType,
                category: movementType === 'expense' ? 'other' : movementForm.category,
                amount: parseFloat(movementForm.amount),
                description: movementForm.description || (movementForm.category === 'chair_rental' ? "Cobro de renta de sillón" : ""),
                payment_method: movementForm.payment_method,
                barber_id: (movementType === 'income' && movementForm.category === 'chair_rental') ? movementForm.barber_id : null,
            });

            if (error) {
                toast.error("Error al registrar movimiento: " + error.message);
            } else {
                toast.success(movementType === 'income' ? "Ingreso registrado" : "Egreso registrado");
                setIsMovementDialogOpen(false);
                setMovementForm({ amount: "", description: "", payment_method: "cash", category: "other", barber_id: "" });
                loadCajaData();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const openMovementDialog = (type: 'income' | 'expense') => {
        setMovementType(type);
        setMovementForm({ amount: "", description: "", payment_method: "cash", category: "other", barber_id: "" });
        setIsMovementDialogOpen(true);
    };
    if (!isLoaded || !features.contabilidad) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Caja del Día</h1>
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                        <CalendarIcon className="h-4 w-4" />
                        <span>
                            {date?.from ? (
                                date.to && date.to.getTime() !== date.from.getTime() ? (
                                    <>
                                        {format(date.from, "d 'de' MMMM", { locale: es })} -{" "}
                                        {format(date.to, "d 'de' MMMM, yyyy", { locale: es })}
                                    </>
                                ) : (
                                    format(date.from, "d 'de' MMMM, yyyy", { locale: es })
                                )
                            ) : (
                                "Seleccionar fecha"
                            )}
                        </span>
                    </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <CalendarDateRangePicker date={date} setDate={setDate} />
                </div>
            </div>

            {/* Acciones rápidas */}
            <div id="admin-btn-register-movement" className="flex gap-2 flex-wrap">
                <Button onClick={() => openMovementDialog('income')} className="bg-green-600 hover:bg-green-700">
                    <ArrowDownCircle className="h-4 w-4 mr-2" />
                    Registrar Ingreso
                </Button>
                <Button onClick={() => openMovementDialog('expense')} variant="outline" className="text-red-400 border-red-400/30 hover:bg-red-400/10">
                    <ArrowUpCircle className="h-4 w-4 mr-2" />
                    Registrar Egreso
                </Button>
            </div>

            {/* Tarjetas de Resumen */}
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
                <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total del Periodo
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-400">{formatPrice(summary.totalIncome)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Servicios
                        </CardTitle>
                        <Scissors className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatPrice(summary.servicesIncome)}</div>
                        <p className="text-xs text-muted-foreground">
                            {summary.totalServices} cobros de cortes
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Productos
                        </CardTitle>
                        <ShoppingBag className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatPrice(summary.productsIncome)}</div>
                        <p className="text-xs text-muted-foreground">
                            {summary.totalProductsSold} unidades vendidas
                        </p>
                    </CardContent>
                </Card>
                <Card className="bg-amber-500/5 border-amber-500/15">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Propinas
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-400">{formatPrice(tipsTotal)}</div>
                        <p className="text-xs text-muted-foreground">
                            100% de los barberos
                        </p>
                    </CardContent>
                </Card>
                <Card className={summary.expenses > 0 ? "bg-red-500/5 border-red-500/20" : ""}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Egresos
                        </CardTitle>
                        <ArrowUpCircle className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-400">-{formatPrice(summary.expenses)}</div>
                        <p className="text-xs text-muted-foreground">
                            Gastos, retiros y pagos
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Desglose por Barbero */}
            <div className="rounded-md border bg-card">
                <div className="p-4 border-b">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Scissors className="h-4 w-4 text-primary" />
                        Ingresos por Barbero
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Barbero</TableHead>
                            <TableHead className="text-right">Servicios</TableHead>
                            <TableHead className="text-right">Propinas</TableHead>
                            <TableHead className="text-right font-semibold">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-16 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando desglose...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : barbersIncome.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} className="h-16 text-center text-muted-foreground text-sm">
                                    No hay cobros atribuidos a barberos en este periodo.
                                </TableCell>
                            </TableRow>
                        ) : (
                            barbersIncome.map((b) => (
                                <TableRow key={b.id}>
                                    <TableCell className="font-medium text-foreground">{b.name}</TableCell>
                                    <TableCell className="text-right">{formatPrice(b.services)}</TableCell>
                                    <TableCell className="text-right text-amber-400">{formatPrice(b.tips)}</TableCell>
                                    <TableCell className="text-right font-bold text-primary">{formatPrice(b.total)}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                </div>
            </div>

            {/* Tabla de Movimientos */}
            <div className="rounded-md border bg-card">
                <div className="p-4 border-b">
                    <h3 className="font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Movimientos del Periodo
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Hora/Fecha</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Método</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando movimientos...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : transactions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                    No hay movimientos registrados en este periodo.
                                </TableCell>
                            </TableRow>
                        ) : (
                            transactions.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell className="font-mono text-sm">
                                        {format(new Date(t.date), "dd/MM HH:mm", { locale: es })}
                                    </TableCell>
                                    <TableCell>{t.description}</TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            t.type === 'servicio' ? 'default' :
                                                t.type === 'producto' ? 'secondary' :
                                                    t.type === 'egreso' ? 'destructive' : 'outline'
                                        }>
                                            {t.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="capitalize text-muted-foreground text-sm">
                                        {t.method}
                                    </TableCell>
                                    <TableCell className={`text-right font-medium ${t.amount < 0 ? 'text-red-400' : ''}`}>
                                        {t.amount < 0 ? '-' : ''}{formatPrice(Math.abs(t.amount))}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                </div>
            </div>

            {/* Dialog para movimientos */}
            <Dialog open={isMovementDialogOpen} onOpenChange={setIsMovementDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {movementType === 'income' ? 'Registrar Ingreso' : 'Registrar Egreso'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddMovement} className="space-y-4 mt-4">
                        <div>
                            <label className="text-sm font-medium mb-2 block">Monto</label>
                            <Input
                                type="number"
                                placeholder="1500"
                                value={movementForm.amount}
                                onChange={(e) => setMovementForm({ ...movementForm, amount: e.target.value })}
                                required
                            />
                        </div>

                        {movementType === 'income' && (
                            <div>
                                <label className="text-sm font-medium mb-2 block">Categoría</label>
                                <Select
                                    value={movementForm.category}
                                    onValueChange={(v) => setMovementForm({ ...movementForm, category: v, barber_id: v === 'chair_rental' ? movementForm.barber_id : "" })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="other">Otro ingreso</SelectItem>
                                        <SelectItem value="chair_rental">Renta de sillón</SelectItem>
                                        <SelectItem value="product">Venta de producto (manual)</SelectItem>
                                        <SelectItem value="adjustment">Ajuste de caja</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {movementType === 'income' && movementForm.category === 'chair_rental' && (
                            <div>
                                <label className="text-sm font-medium mb-2 block">Barbero</label>
                                <Select
                                    value={movementForm.barber_id}
                                    onValueChange={(v) => setMovementForm({ ...movementForm, barber_id: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccioná un barbero" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {barbers.map((b) => (
                                            <SelectItem key={b.id} value={b.id}>
                                                {b.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <div>
                            <label className="text-sm font-medium mb-2 block">Descripción</label>
                            <Input
                                placeholder={
                                    movementType === 'income'
                                        ? (movementForm.category === 'chair_rental' ? "Alquiler de sillón semanal/mensual" : "Propina, adelanto, etc.")
                                        : "Compra de insumos, retiro, etc."
                                }
                                value={movementForm.description}
                                onChange={(e) => setMovementForm({ ...movementForm, description: e.target.value })}
                                required={movementForm.category !== 'chair_rental'}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Método</label>
                            <Select value={movementForm.payment_method} onValueChange={(v) => setMovementForm({ ...movementForm, payment_method: v })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">Efectivo</SelectItem>
                                    <SelectItem value="transfer">Transferencia</SelectItem>
                                    <SelectItem value="card">Tarjeta</SelectItem>
                                    <SelectItem value="other">Otro</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsMovementDialogOpen(false)}>
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className={movementType === 'income' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                            >
                                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Registrar
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
