"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFeatures } from "@/lib/features";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/utils";
import { CalendarDateRangePicker } from "@/components/admin/date-range-picker";
import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import {
    DollarSign,
    Scissors,
    ShoppingBag,
    TrendingUp,
    Calendar as CalendarIcon,
    CreditCard,
    Banknote,
    ArrowDownCircle,
    ArrowUpCircle,
    ArrowLeftRight,
    Loader2,
    Receipt,
    Ban,
    Lock,
    CheckCircle2,
    AlertTriangle,
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
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
    PAYMENT_METHOD_LABELS,
    CASH_CATEGORY_LABELS,
    normalizePaymentMethod,
} from "@/lib/constants";
import type { CashClosure } from "@/types/database.types";
import { AdminPageHeader, AdminToolbar } from "@/components/admin/admin-ui";

const EXPENSE_CATEGORIES = ['supply', 'salary', 'rent', 'adjustment', 'other'] as const;

interface CashSummary {
    totalIncome: number;
    servicesIncome: number;
    productsIncome: number;
    totalServices: number;
    totalProductsSold: number;
    cashPayments: number;
    transferPayments: number;
    cardPayments: number;
    otherPayments: number;
    cashExpenses: number;
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
    category: string;
    appointmentId: string | null;
    referenceId: string | null;
    createdBy: string | null;
    // Esta fila ES un contra-asiento (anulación) de otro movimiento.
    isVoidEntry: boolean;
    // Esta fila (movimiento original) YA fue anulada (existe un contra-asiento que la referencia).
    isVoided: boolean;
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
        otherPayments: 0,
        cashExpenses: 0,
        expenses: 0,
    });

    const [tipsTotal, setTipsTotal] = useState(0);
    const [barbersIncome, setBarbersIncome] = useState<{ id: string; name: string; services: number; tips: number; total: number }[]>([]);
    const [barbers, setBarbers] = useState<{ id: string; name: string }[]>([]);

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [creatorNames, setCreatorNames] = useState<Record<string, string>>({});
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

    // Anulación de movimientos manuales (contra-asiento)
    const [voidTarget, setVoidTarget] = useState<Transaction | null>(null);
    const [voidReason, setVoidReason] = useState("");
    const [isVoiding, setIsVoiding] = useState(false);

    // Cierre de día (Bloque B): solo tiene sentido cuando el rango elegido es un único día.
    const isSingleDay = !!(date?.from && (!date.to || isSameDay(date.from, date.to)));
    const [closure, setClosure] = useState<CashClosure | null>(null);
    const [closureCreatorName, setClosureCreatorName] = useState<string | null>(null);
    const [isLoadingClosure, setIsLoadingClosure] = useState(false);
    const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
    const [countedCashInput, setCountedCashInput] = useState("");
    const [closureNotes, setClosureNotes] = useState("");
    const [isClosingDay, setIsClosingDay] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        if (date?.from) {
            loadCajaData();
        }
    }, [date]);

    const loadClosure = useCallback(async () => {
        if (!isSingleDay || !date?.from) {
            setClosure(null);
            setClosureCreatorName(null);
            return;
        }
        setIsLoadingClosure(true);
        const dateStr = format(date.from, 'yyyy-MM-dd');
        const { data } = await supabase
            .from('cash_closures')
            .select('*')
            .eq('closure_date', dateStr)
            .maybeSingle();
        setClosure(data || null);

        if (data?.created_by) {
            const { data: creator } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', data.created_by)
                .maybeSingle();
            setClosureCreatorName(creator?.full_name || null);
        } else {
            setClosureCreatorName(null);
        }
        setIsLoadingClosure(false);
    }, [isSingleDay, date, supabase]);

    useEffect(() => {
        loadClosure();
    }, [loadClosure]);

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

        // Uruguay no tiene horario de verano desde 2015: el offset -03:00 es fijo
        // todo el año. Este rango debe coincidir con el predicado
        // (created_at AT TIME ZONE 'America/Montevideo') que usa get_barber_settlement,
        // si no, un cobro nocturno cae en un día distinto en caja vs. liquidación.
        const startBound = `${startDate}T00:00:00-03:00`;
        const endBound = `${endDate}T23:59:59.999-03:00`;

        // Caja usa cash_movements como fuente única. Las ventas de productos
        // llegan desde las RPCs de pedidos/POS para evitar doble conteo con orders.
        const { data: movements } = await supabase
            .from('cash_movements')
            .select('*, barber:barbers(name)')
            .gte('created_at', startBound)
            .lte('created_at', endBound)
            .order('created_at', { ascending: false });

        const productOrderIds = Array.from(new Set((movements || [])
            .filter((mov) => mov.category === 'product' && mov.reference_id)
            .map((mov) => mov.reference_id as string)));

        const { data: productOrders } = productOrderIds.length > 0
            ? await supabase
                .from('orders')
                .select('id, status, order_items(quantity)')
                .in('id', productOrderIds)
            : { data: [] };

        const productOrdersById = new Map((productOrders || []).map((order) => [order.id, order]));

        // La FK de created_by apunta a auth.users, no a profiles: PostgREST no
        // puede embeberlo, así que resolvemos los nombres con una segunda query.
        const creatorIds = Array.from(new Set((movements || [])
            .map((mov) => mov.created_by as string | null)
            .filter((id): id is string => !!id)));

        const { data: creators } = creatorIds.length > 0
            ? await supabase.from('profiles').select('id, full_name').in('id', creatorIds)
            : { data: [] };

        const creatorNameById: Record<string, string> = {};
        (creators || []).forEach((c) => {
            if (c.full_name) creatorNameById[c.id] = c.full_name;
        });
        setCreatorNames(creatorNameById);

        // Movimientos ya anulados: cualquier cash_movements.reference_id de un
        // contra-asiento (category='adjustment') apunta al movimiento original anulado.
        const voidedIds = new Set((movements || [])
            .filter((mov) => mov.category === 'adjustment' && mov.reference_id)
            .map((mov) => mov.reference_id as string));

        // Procesar Datos
        let sIncome = 0;
        let pIncome = 0;
        let pSold = 0;
        let cashPay = 0;
        let transferPay = 0;
        let cardPay = 0;
        let otherPay = 0;
        let cashExpenseTotal = 0;
        let totalExpenses = 0;
        let totalTips = 0;
        let totalServicesCount = 0;
        const trans: Transaction[] = [];
        const barberBreakdown: Record<string, { name: string; services: number; tips: number }> = {};

        // Movimientos de caja (incluyendo servicios, propinas, etc.)
        if (movements) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            movements.forEach((mov: any) => {
                const amount = Number(mov.amount);
                const relatedOrder = mov.reference_id ? productOrdersById.get(mov.reference_id) : null;

                if (mov.category === 'product' && relatedOrder?.status === 'cancelled') {
                    return;
                }

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

                const isVoidEntry = mov.category === 'adjustment' && !!mov.reference_id;
                const isVoided = voidedIds.has(mov.id);

                if (mov.type === 'expense') {
                    totalExpenses += amount;
                    if (normalizePaymentMethod(mov.payment_method) === 'cash') {
                        cashExpenseTotal += amount;
                    }
                    trans.push({
                        id: mov.id,
                        type: 'egreso',
                        description: mov.description || 'Gasto registrado',
                        amount: -amount,
                        date: mov.created_at,
                        status: 'Registrado',
                        method: PAYMENT_METHOD_LABELS[mov.payment_method] || mov.payment_method,
                        category: mov.category,
                        appointmentId: mov.appointment_id,
                        referenceId: mov.reference_id,
                        createdBy: mov.created_by,
                        isVoidEntry,
                        isVoided,
                    });
                } else {
                    // Ingreso (income)
                    if (mov.category === 'service') {
                        sIncome += amount;
                        totalServicesCount++;
                    } else if (mov.category === 'tip') {
                        totalTips += amount;
                    } else if (mov.category === 'product') {
                        const itemsCount = relatedOrder?.order_items?.reduce((acc: number, item: { quantity: number }) => acc + item.quantity, 0) || 0;
                        pIncome += amount;
                        pSold += itemsCount;
                    }

                    // Clasificar por método de pago: los 4 buckets (incluye 'other')
                    // particionan TODOS los ingresos, así su suma siempre cierra.
                    const canonicalMethod = normalizePaymentMethod(mov.payment_method) || 'other';
                    if (canonicalMethod === 'cash') cashPay += amount;
                    else if (canonicalMethod === 'transfer') transferPay += amount;
                    else if (canonicalMethod === 'card') cardPay += amount;
                    else otherPay += amount;

                    const catLabel = CASH_CATEGORY_LABELS[mov.category] || mov.category;
                    const barberNameSuffix = mov.barber?.name ? ` con ${mov.barber.name}` : '';

                    trans.push({
                        id: mov.id,
                        type: mov.category === 'service' ? 'servicio' : mov.category === 'product' ? 'producto' : 'ingreso',
                        description: mov.category === 'service'
                            ? `${catLabel}${barberNameSuffix}`
                            : mov.category === 'product'
                                ? mov.description || `Venta de ${relatedOrder?.order_items?.reduce((acc: number, item: { quantity: number }) => acc + item.quantity, 0) || 0} productos`
                            : mov.description || catLabel,
                        amount: amount,
                        date: mov.created_at,
                        status: 'Registrado',
                        method: PAYMENT_METHOD_LABELS[mov.payment_method] || mov.payment_method,
                        category: mov.category,
                        appointmentId: mov.appointment_id,
                        referenceId: mov.reference_id,
                        createdBy: mov.created_by,
                        isVoidEntry,
                        isVoided,
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
            otherPayments: otherPay,
            cashExpenses: cashExpenseTotal,
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

        const amountVal = parseFloat(movementForm.amount);
        if (isNaN(amountVal) || amountVal <= 0) {
            toast.error("Monto inválido");
            return;
        }

        setIsSubmitting(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            const { error } = await supabase.from('cash_movements').insert({
                type: movementType,
                category: movementForm.category,
                amount: amountVal,
                description: movementForm.description || (movementForm.category === 'chair_rental' ? "Cobro de renta de sillón" : ""),
                payment_method: movementForm.payment_method,
                barber_id: (movementType === 'income' && movementForm.category === 'chair_rental') ? movementForm.barber_id : null,
                created_by: user?.id || null,
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

    // Anular movimiento manual (contra-asiento, nunca DELETE). Los ingresos de
    // pedidos (category='product', FASE 35) se revierten solo cancelando la
    // orden desde /admin/pedidos — void_cash_movement los rechaza server-side
    // (MOVIMIENTO_DE_PEDIDO); acá se oculta el botón para no ofrecer una
    // acción que va a fallar.
    const canVoidMovement = (t: Transaction) =>
        !t.appointmentId && t.category !== 'settlement' && t.category !== 'product' && !t.isVoidEntry && !t.isVoided;

    const handleVoidMovement = async () => {
        if (!voidTarget) return;
        setIsVoiding(true);

        try {
            const { error } = await supabase.rpc('void_cash_movement', {
                p_movement_id: voidTarget.id,
                p_reason: voidReason || null,
            });

            if (error) {
                if (error.message.includes("YA_ANULADO")) {
                    toast.error("Este movimiento ya fue anulado.");
                } else if (error.message.includes("MOVIMIENTO_DE_CITA")) {
                    toast.error("No se puede anular un cobro de cita desde acá.");
                } else if (error.message.includes("MOVIMIENTO_DE_PEDIDO")) {
                    toast.error("Es un cobro de pedido: cancelalo desde Pedidos");
                } else if (error.message.includes("MOVIMIENTO_DE_LIQUIDACION")) {
                    toast.error("No se puede anular un movimiento de liquidación.");
                } else if (error.message.includes("MOVIMIENTO_NO_EXISTE")) {
                    toast.error("El movimiento no existe.");
                } else if (error.message.includes("NO_AUTORIZADO")) {
                    toast.error("No tenés autorización para anular movimientos.");
                } else {
                    toast.error("Error al anular movimiento: " + error.message);
                }
            } else {
                toast.success("Movimiento anulado: se registró el contra-asiento");
                setVoidTarget(null);
                setVoidReason("");
                loadCajaData();
            }
        } finally {
            setIsVoiding(false);
        }
    };

    const openMovementDialog = (type: 'income' | 'expense') => {
        setMovementType(type);
        setMovementForm({ amount: "", description: "", payment_method: "cash", category: "other", barber_id: "" });
        setIsMovementDialogOpen(true);
    };

    // Efectivo esperado del día, calculado client-side con los movimientos ya
    // cargados (solo payment_method='cash'). El servidor recalcula lo mismo
    // con el mismo predicado TZ en close_cash_day — esto es solo el preview.
    const expectedCashNow = summary.cashPayments - summary.cashExpenses;
    const countedCashNum = parseFloat(countedCashInput);
    const previewDifference = countedCashInput !== "" && !isNaN(countedCashNum)
        ? countedCashNum - expectedCashNow
        : null;

    const openCloseDialog = () => {
        setCountedCashInput("");
        setClosureNotes("");
        setIsCloseDialogOpen(true);
    };

    const handleCloseDay = async () => {
        if (!date?.from) return;

        if (isNaN(countedCashNum) || countedCashNum < 0) {
            toast.error("Monto inválido");
            return;
        }

        setIsClosingDay(true);
        try {
            const { error } = await supabase.rpc('close_cash_day', {
                p_date: format(date.from, 'yyyy-MM-dd'),
                p_counted_cash: countedCashNum,
                p_notes: closureNotes || null,
            });

            if (error) {
                if (error.message.includes("DIA_YA_CERRADO")) {
                    toast.error("Ese día ya fue cerrado.");
                } else if (error.message.includes("FECHA_FUTURA")) {
                    toast.error("No podés cerrar un día futuro.");
                } else if (error.message.includes("MONTO_INVALIDO")) {
                    toast.error("Monto inválido.");
                } else if (error.message.includes("NO_AUTORIZADO")) {
                    toast.error("No tenés autorización para cerrar la caja.");
                } else {
                    toast.error("Error al cerrar caja: " + error.message);
                }
            } else {
                toast.success("Caja del día cerrada");
                setIsCloseDialogOpen(false);
                setCountedCashInput("");
                setClosureNotes("");
                loadClosure();
            }
        } finally {
            setIsClosingDay(false);
        }
    };
    if (!isLoaded || !features.contabilidad) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                eyebrow="Operación financiera"
                title="Caja del Día"
                icon={DollarSign}
                description="Controlá ingresos, egresos y cierres del período seleccionado."
                meta={(
                    <span className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4" aria-hidden="true" />
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
                    </span>
                )}
                action={<CalendarDateRangePicker date={date} setDate={setDate} />}
            />

            {/* Acciones rápidas */}
            <div id="admin-btn-register-movement">
            <AdminToolbar className="[&>button]:w-full sm:[&>button]:w-auto">
                <Button onClick={() => openMovementDialog('income')} className="bg-green-600 hover:bg-green-700">
                    <ArrowDownCircle className="h-4 w-4 mr-2" />
                    Registrar Ingreso
                </Button>
                <Button onClick={() => openMovementDialog('expense')} variant="outline" className="text-red-400 border-red-400/30 hover:bg-red-400/10">
                    <ArrowUpCircle className="h-4 w-4 mr-2" />
                    Registrar Egreso
                </Button>
                {isSingleDay && !isLoadingClosure && !closure && (
                    <Button onClick={openCloseDialog} variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">
                        <Lock className="h-4 w-4 mr-2" />
                        Cerrar caja del día
                    </Button>
                )}
                {!isSingleDay && (
                    <span className="text-xs text-muted-foreground">
                        Elegí un único día para poder cerrar la caja.
                    </span>
                )}
            </AdminToolbar>
            </div>

            {/* Cierre de caja del día ya realizado: resumen en vez del botón */}
            {isSingleDay && closure && (
                <div className="rounded-md border bg-card p-4 space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Caja del día cerrada
                        {Math.abs(closure.expected_cash - expectedCashNow) > 0.005 && (
                            <Badge variant="outline" className="admin-warning-surface ml-2 text-[10px] font-normal">
                                <AlertTriangle className="admin-warning-icon h-3 w-3 mr-1" />
                                Hubo movimientos después del cierre
                            </Badge>
                        )}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                            <span className="text-muted-foreground text-xs block">Esperado</span>
                            <span className="font-semibold">{formatPrice(closure.expected_cash)}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground text-xs block">Contado</span>
                            <span className="font-semibold">{formatPrice(closure.counted_cash)}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground text-xs block">Diferencia</span>
                            <span className={`font-semibold ${closure.difference === 0 ? 'text-emerald-500' : closure.difference > 0 ? 'text-amber-500' : 'text-destructive'}`}>
                                {closure.difference > 0 ? '+' : ''}{formatPrice(closure.difference)}
                            </span>
                        </div>
                        <div>
                            <span className="text-muted-foreground text-xs block">Cerrado por</span>
                            <span className="font-semibold">{closureCreatorName || "—"}</span>
                        </div>
                    </div>
                    {closure.notes && (
                        <p className="text-xs text-muted-foreground border-t border-border pt-2">{closure.notes}</p>
                    )}
                </div>
            )}

            {/* Tarjetas de Resumen */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
                <Card className="col-span-2 border-green-500/20 bg-gradient-to-br from-green-500/10 to-green-500/5 md:col-span-1">
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
                <Card className="admin-warning-card">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            Propinas
                        </CardTitle>
                        <DollarSign className="admin-warning-icon h-4 w-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="admin-warning-text text-2xl font-bold">{formatPrice(tipsTotal)}</div>
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

            {/* Desglose por método de pago (los 4 buckets particionan todos los
                ingresos del período, así que su suma siempre cierra) */}
            <div className="rounded-md border bg-card p-4">
                <h3 className="font-semibold flex items-center gap-2 mb-3">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Desglose por Método de Pago
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Banknote className="h-4 w-4" /> {PAYMENT_METHOD_LABELS.cash}
                        </span>
                        <span className="font-semibold text-foreground">{formatPrice(summary.cashPayments)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <ArrowLeftRight className="h-4 w-4" /> {PAYMENT_METHOD_LABELS.transfer}
                        </span>
                        <span className="font-semibold text-foreground">{formatPrice(summary.transferPayments)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <CreditCard className="h-4 w-4" /> {PAYMENT_METHOD_LABELS.card}
                        </span>
                        <span className="font-semibold text-foreground">{formatPrice(summary.cardPayments)}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Receipt className="h-4 w-4" /> {PAYMENT_METHOD_LABELS.other}
                        </span>
                        <span className="font-semibold text-foreground">{formatPrice(summary.otherPayments)}</span>
                    </div>
                </div>
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
                                    <TableCell className="admin-warning-text text-right">{formatPrice(b.tips)}</TableCell>
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
                            <TableHead>Por</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center">
                                    <div className="flex justify-center items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Cargando movimientos...
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : transactions.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    No hay movimientos registrados en este periodo.
                                </TableCell>
                            </TableRow>
                        ) : (
                            transactions.map((t) => (
                                <TableRow key={t.id}>
                                    <TableCell className="font-mono text-sm">
                                        {format(new Date(t.date), "dd/MM HH:mm", { locale: es })}
                                    </TableCell>
                                    <TableCell>
                                        {t.description}
                                        {t.isVoidEntry && (
                                            <Badge variant="outline" className="ml-2 text-[10px] text-muted-foreground">
                                                Anulación
                                            </Badge>
                                        )}
                                        {t.isVoided && (
                                            <Badge variant="outline" className="ml-2 text-[10px] border-red-400/30 text-red-400">
                                                Anulado
                                            </Badge>
                                        )}
                                    </TableCell>
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
                                    <TableCell className="text-muted-foreground text-sm">
                                        {(t.createdBy && creatorNames[t.createdBy]) || "—"}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {canVoidMovement(t) && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 text-muted-foreground hover:text-red-400"
                                                onClick={() => { setVoidTarget(t); setVoidReason(""); }}
                                            >
                                                <Ban className="h-3.5 w-3.5 mr-1" />
                                                Anular
                                            </Button>
                                        )}
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
                                min="0.01"
                                step="any"
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

                        {movementType === 'expense' && (
                            <div>
                                <label className="text-sm font-medium mb-2 block">Categoría</label>
                                <Select
                                    value={movementForm.category}
                                    onValueChange={(v) => setMovementForm({ ...movementForm, category: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {EXPENSE_CATEGORIES.map((cat) => (
                                            <SelectItem key={cat} value={cat}>
                                                {CASH_CATEGORY_LABELS[cat]}
                                            </SelectItem>
                                        ))}
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

            {/* Dialog de cierre de caja del día */}
            <Dialog open={isCloseDialogOpen} onOpenChange={setIsCloseDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cerrar caja del día</DialogTitle>
                        <DialogDescription>
                            {date?.from ? format(date.from, "d 'de' MMMM, yyyy", { locale: es }) : ""} — arqueá el
                            efectivo contra lo esperado. Esta acción queda registrada y no se puede repetir el mismo día.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                            <span className="text-muted-foreground">Efectivo esperado</span>
                            <span className="font-semibold">{formatPrice(expectedCashNow)}</span>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-2 block">Efectivo contado</label>
                            <Input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                value={countedCashInput}
                                onChange={(e) => setCountedCashInput(e.target.value)}
                            />
                        </div>
                        {previewDifference !== null && (
                            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
                                <span className="text-muted-foreground">Diferencia</span>
                                <span className={`font-semibold ${previewDifference === 0 ? 'text-emerald-500' : previewDifference > 0 ? 'text-amber-500' : 'text-destructive'}`}>
                                    {previewDifference > 0 ? '+' : ''}{formatPrice(previewDifference)}
                                    {previewDifference > 0 ? ' (sobra)' : previewDifference < 0 ? ' (falta)' : ''}
                                </span>
                            </div>
                        )}
                        <div>
                            <label className="text-sm font-medium mb-2 block">Notas (opcional)</label>
                            <Textarea
                                placeholder="Observaciones del arqueo, si las hay"
                                value={closureNotes}
                                onChange={(e) => setClosureNotes(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter className="pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsCloseDialogOpen(false)}
                            disabled={isClosingDay}
                        >
                            Cancelar
                        </Button>
                        <Button type="button" onClick={handleCloseDay} disabled={isClosingDay}>
                            {isClosingDay && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Confirmar cierre
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog de anulación (contra-asiento) */}
            <Dialog open={!!voidTarget} onOpenChange={(open) => !open && setVoidTarget(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Anular movimiento</DialogTitle>
                        <DialogDescription>
                            Se va a registrar un contra-asiento por{" "}
                            {voidTarget ? formatPrice(Math.abs(voidTarget.amount)) : ""}. El movimiento
                            original queda intacto para el rastro de auditoría — nunca se borra.
                        </DialogDescription>
                    </DialogHeader>
                    <div>
                        <label className="text-sm font-medium mb-2 block">Motivo (opcional)</label>
                        <Textarea
                            placeholder="Error de tipeo, monto duplicado, etc."
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                        />
                    </div>
                    <DialogFooter className="pt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setVoidTarget(null)}
                            disabled={isVoiding}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={handleVoidMovement}
                            disabled={isVoiding}
                        >
                            {isVoiding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Anular movimiento
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
