"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import { CalendarDateRangePicker } from "@/components/admin/date-range-picker";
import { addDays, format } from "date-fns";
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
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

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

interface CashMovement {
    id: string;
    type: 'ingreso' | 'egreso';
    amount: number;
    description: string;
    payment_method: string;
    created_at: string;
}

export default function AdminCajaPage() {
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

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isMovementDialogOpen, setIsMovementDialogOpen] = useState(false);
    const [movementType, setMovementType] = useState<'ingreso' | 'egreso'>('ingreso');
    const [movementForm, setMovementForm] = useState({
        amount: "",
        description: "",
        payment_method: "efectivo",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        if (date?.from) {
            loadCajaData();
        }
    }, [date]);

    const loadCajaData = async () => {
        setIsLoading(true);
        const startDate = date?.from ? format(date.from, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
        const endDate = date?.to ? format(date.to, 'yyyy-MM-dd') : startDate;

        // 1. Obtener Citas Completadas (Ingresos por Servicios)
        const { data: appointments } = await supabase
            .from('appointments')
            .select(`
                id,
                appointment_date,
                start_time,
                service:services(name, price),
                barber:barbers(name)
            `)
            .eq('status', 'completed')
            .gte('appointment_date', startDate)
            .lte('appointment_date', endDate)
            .order('appointment_date', { ascending: false });

        // 2. Obtener Órdenes (Ingresos por Productos)
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

        // 3. Obtener Movimientos de Caja (gastos, ingresos extra)
        const { data: movements } = await supabase
            .from('cash_movements')
            .select('*')
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
        const trans: Transaction[] = [];

        // Servicios
        if (appointments) {
            appointments.forEach(apt => {
                const service = apt.service as unknown as { name: string; price: number } | null;
                const barber = apt.barber as unknown as { name: string } | null;
                const price = service?.price || 0;
                sIncome += Number(price);
                cashPay += Number(price); // Asumimos efectivo por defecto
                trans.push({
                    id: apt.id,
                    type: 'servicio',
                    description: `${service?.name || 'Servicio'} con ${barber?.name || 'Barbero'}`,
                    amount: Number(price),
                    date: `${apt.appointment_date}T${apt.start_time}`,
                    status: 'Completado',
                    method: 'Efectivo'
                });
            });
        }

        // Productos
        if (orders) {
            orders.forEach(ord => {
                pIncome += Number(ord.total);
                const itemsCount = ord.order_items.reduce((acc: number, item: any) => acc + item.quantity, 0);
                pSold += itemsCount;

                // Clasificar por método de pago
                if (ord.payment_method === 'efectivo') cashPay += Number(ord.total);
                else if (ord.payment_method === 'transferencia') transferPay += Number(ord.total);
                else cardPay += Number(ord.total);

                trans.push({
                    id: ord.id,
                    type: 'producto',
                    description: `Venta de ${itemsCount} productos`,
                    amount: Number(ord.total),
                    date: ord.created_at,
                    status: ord.status === 'pending' ? 'Pendiente' : 'Pagado',
                    method: ord.payment_method || 'N/A'
                });
            });
        }

        // Movimientos de caja
        if (movements) {
            movements.forEach((mov: CashMovement) => {
                if (mov.type === 'egreso') {
                    totalExpenses += Number(mov.amount);
                    trans.push({
                        id: mov.id,
                        type: 'egreso',
                        description: mov.description,
                        amount: -Number(mov.amount),
                        date: mov.created_at,
                        status: 'Registrado',
                        method: mov.payment_method
                    });
                } else {
                    // Ingresos extra
                    if (mov.payment_method === 'efectivo') cashPay += Number(mov.amount);
                    else if (mov.payment_method === 'transferencia') transferPay += Number(mov.amount);
                    trans.push({
                        id: mov.id,
                        type: 'ingreso',
                        description: mov.description,
                        amount: Number(mov.amount),
                        date: mov.created_at,
                        status: 'Registrado',
                        method: mov.payment_method
                    });
                }
            });
        }

        // Ordenar transacciones por fecha desc
        trans.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setSummary({
            totalIncome: sIncome + pIncome - totalExpenses,
            servicesIncome: sIncome,
            productsIncome: pIncome,
            totalServices: appointments?.length || 0,
            totalProductsSold: pSold,
            cashPayments: cashPay,
            transferPayments: transferPay,
            cardPayments: cardPay,
            expenses: totalExpenses,
        });
        setTransactions(trans);
        setIsLoading(false);
    };

    // Registrar movimiento de caja
    const handleAddMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const { error } = await supabase.from('cash_movements').insert({
                type: movementType,
                amount: parseFloat(movementForm.amount),
                description: movementForm.description,
                payment_method: movementForm.payment_method,
            });

            if (error) {
                // Si la tabla no existe, crearla
                if (error.code === '42P01') {
                    toast.error("La tabla de movimientos no existe. Contacta al administrador.");
                } else {
                    toast.error("Error al registrar movimiento: " + error.message);
                }
            } else {
                toast.success(movementType === 'ingreso' ? "Ingreso registrado" : "Egreso registrado");
                setIsMovementDialogOpen(false);
                setMovementForm({ amount: "", description: "", payment_method: "efectivo" });
                loadCajaData();
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const openMovementDialog = (type: 'ingreso' | 'egreso') => {
        setMovementType(type);
        setMovementForm({ amount: "", description: "", payment_method: "efectivo" });
        setIsMovementDialogOpen(true);
    };

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
            <div className="flex gap-2 flex-wrap">
                <Button onClick={() => openMovementDialog('ingreso')} className="bg-green-600 hover:bg-green-700">
                    <ArrowDownCircle className="h-4 w-4 mr-2" />
                    Registrar Ingreso
                </Button>
                <Button onClick={() => openMovementDialog('egreso')} variant="outline" className="text-red-400 border-red-400/30 hover:bg-red-400/10">
                    <ArrowUpCircle className="h-4 w-4 mr-2" />
                    Registrar Egreso
                </Button>
            </div>

            {/* Tarjetas de Resumen */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Total del Día
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-400">{formatPrice(summary.totalIncome)}</div>
                        <p className="text-xs text-muted-foreground">
                            {summary.totalServices + transactions.filter(t => t.type === 'producto').length} transacciones
                        </p>
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
                            {summary.totalServices} cortes realizados
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
                            Gastos y retiros
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Desglose por método de pago */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                                <Banknote className="h-5 w-5 text-green-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Efectivo</p>
                                <p className="text-xl font-bold">{formatPrice(summary.cashPayments)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <Receipt className="h-5 w-5 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Transferencia</p>
                                <p className="text-xl font-bold">{formatPrice(summary.transferPayments)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <CreditCard className="h-5 w-5 text-purple-500" />
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Tarjeta</p>
                                <p className="text-xl font-bold">{formatPrice(summary.cardPayments)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabla de Movimientos */}
            <div className="rounded-md border bg-card">
                <div className="p-4 border-b">
                    <h3 className="font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Movimientos del Periodo
                    </h3>
                </div>
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

            {/* Dialog para movimientos */}
            <Dialog open={isMovementDialogOpen} onOpenChange={setIsMovementDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {movementType === 'ingreso' ? 'Registrar Ingreso' : 'Registrar Egreso'}
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
                        <div>
                            <label className="text-sm font-medium mb-2 block">Descripción</label>
                            <Input
                                placeholder={movementType === 'ingreso' ? "Propina, adelanto, etc." : "Compra de insumos, retiro, etc."}
                                value={movementForm.description}
                                onChange={(e) => setMovementForm({ ...movementForm, description: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Método</label>
                            <Select value={movementForm.payment_method} onValueChange={(v) => setMovementForm({ ...movementForm, payment_method: v })}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="efectivo">Efectivo</SelectItem>
                                    <SelectItem value="transferencia">Transferencia</SelectItem>
                                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
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
                                className={movementType === 'ingreso' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
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
