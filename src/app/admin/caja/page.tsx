"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import { CalendarDateRangePicker } from "@/components/admin/date-range-picker";
import { addDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { DollarSign, Scissors, ShoppingBag, TrendingUp, Calendar as CalendarIcon } from "lucide-react";
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

interface CashSummary {
    totalIncome: number;
    servicesIncome: number;
    productsIncome: number;
    totalServices: number;
    totalProductsSold: number;
}

interface Transaction {
    id: string;
    type: 'servicio' | 'producto';
    description: string;
    amount: number;
    date: string; // ISO string
    status: string;
    method: string;
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
        totalProductsSold: 0
    });

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        if (date?.from) {
            loadCajaData();
        }
    }, [date]);

    const loadCajaData = async () => {
        setIsLoading(true);
        const startDate = date?.from ? format(date.from, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
        // Si no hay 'to', asumimos que es el mismo día. Si hay 'to', usamos ese.
        // Para incluir todo el día final, podríamos sumar 1 día o ajustar lógica, 
        // pero por simplicidad de query usaremos >= startDate y <= endDate T23:59:59
        const endDate = date?.to ? format(date.to, 'yyyy-MM-dd') : startDate;

        // 1. Obtener Citas Completadas (Ingresos por Servicios)
        // Nota: Asumimos 'completed' son pagadas. En futuro se puede refinar.
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
        // Nota: Asumimos 'pending' (pago en local) cuenta para caja si se confirmó? 
        // O solo 'paid'? Por simplificación ahora, tomaremos todas las orders creadas (asumiendo compromiso de pago)
        // O mejor: filtremos por fecha creation.
        // ADVERTENCIA: 'created_at' es timestamptz.
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
            // Ajuste básico de fecha para query
            .gte('created_at', `${startDate}T00:00:00`)
            .lte('created_at', `${endDate}T23:59:59`)
            .order('created_at', { ascending: false });


        // Procesar Datos
        let sIncome = 0;
        let pIncome = 0;
        let pSold = 0;
        const trans: Transaction[] = [];

        // Servicios
        if (appointments) {
            appointments.forEach(apt => {
                const price = apt.service?.price || 0;
                sIncome += Number(price);
                trans.push({
                    id: apt.id,
                    type: 'servicio',
                    description: `${apt.service?.name} con ${apt.barber?.name}`,
                    amount: Number(price),
                    date: `${apt.appointment_date}T${apt.start_time}`,
                    status: 'Completado',
                    method: 'En Local' // Default por ahora
                });
            });
        }

        // Productos
        if (orders) {
            orders.forEach(ord => {
                pIncome += Number(ord.total);
                const itemsCount = ord.order_items.reduce((acc: number, item: any) => acc + item.quantity, 0);
                pSold += itemsCount;

                trans.push({
                    id: ord.id,
                    type: 'producto',
                    description: `Venta de ${itemsCount} productos`,
                    amount: Number(ord.total),
                    date: ord.created_at,
                    status: ord.status === 'pending' ? 'Pendiente Pago' : 'Pagado',
                    method: ord.payment_method || 'N/A'
                });
            });
        }

        // Ordenar transacciones por fecha desc
        trans.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setSummary({
            totalIncome: sIncome + pIncome,
            servicesIncome: sIncome,
            productsIncome: pIncome,
            totalServices: appointments?.length || 0,
            totalProductsSold: pSold
        });
        setTransactions(trans);
        setIsLoading(false);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Cierre de Caja</h1>
                    <div className="flex items-center gap-2 text-muted-foreground mt-1">
                        <CalendarIcon className="h-4 w-4" />
                        <span>
                            {date?.from ? (
                                date.to ? (
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
                <CalendarDateRangePicker date={date} setDate={setDate} />
            </div>

            {/* Tarjetas de Resumen */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Ingresos Totales
                        </CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatPrice(summary.totalIncome)}</div>
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
                                <TableCell colSpan={5} className="h-24 text-center">Cargando...</TableCell>
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
                                        <Badge variant={t.type === 'servicio' ? 'default' : 'secondary'}>
                                            {t.type}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="capitalize text-muted-foreground text-sm">
                                        {t.method}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                        {formatPrice(t.amount)}
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
