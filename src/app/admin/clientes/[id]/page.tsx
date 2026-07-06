"use client";

import { use, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    ArrowLeft,
    Phone,
    Calendar as CalendarIcon,
    ShoppingBag,
    MessageSquare,
    Scissors,
    Save,
    Loader2,
    Clock,
    User as UserIcon,
    AlertCircle,
    MessageCircle
} from "lucide-react";
import { toast } from "sonner";
import { SendWhatsappDialog } from "@/components/admin/send-whatsapp-dialog";
import { useFeatures } from "@/lib/features";
import { formatPrice } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type {
    Profile,
    Appointment,
    HaircutHistory,
    Order,
    CommunicationLog
} from "@/types/database.types";

interface ExtendedAppointment extends Omit<Appointment, 'service' | 'barber'> {
    service?: { name: string; price: number };
    barber?: { name: string };
}

interface ExtendedOrder extends Omit<Order, 'items'> {
    items?: {
        id: string;
        quantity: number;
        unit_price: number;
        product?: { name: string };
    }[];
}

interface ExtendedHaircutHistory extends Omit<HaircutHistory, 'barber'> {
    barber?: { name: string };
}

export default function AdminClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { features } = useFeatures();
    const { id: clientId } = use(params);
    const router = useRouter();
    const supabase = createClient();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [appointments, setAppointments] = useState<ExtendedAppointment[]>([]);
    const [haircuts, setHaircuts] = useState<ExtendedHaircutHistory[]>([]);
    const [orders, setOrders] = useState<ExtendedOrder[]>([]);
    const [messages, setMessages] = useState<CommunicationLog[]>([]);

    const [notes, setNotes] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingNotes, setIsSavingNotes] = useState(false);
    const [isWaOpen, setIsWaOpen] = useState(false);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Cargar perfil del cliente
            const profilePromise = supabase
                .from("profiles")
                .select("*")
                .eq("id", clientId)
                .single();

            // Cargar citas
            const appointmentsPromise = supabase
                .from("appointments")
                .select(`
                    *,
                    service:services(name, price),
                    barber:barbers(name)
                `)
                .eq("client_id", clientId)
                .order("appointment_date", { ascending: false });

            // Cargar historial de cortes
            const haircutsPromise = supabase
                .from("haircut_history")
                .select(`
                    *,
                    barber:barbers(name)
                `)
                .eq("client_id", clientId)
                .order("created_at", { ascending: false });

            // Cargar compras/órdenes
            const ordersPromise = supabase
                .from("orders")
                .select(`
                    *,
                    items:order_items(
                        id,
                        quantity,
                        unit_price,
                        product:products(name)
                    )
                `)
                .eq("client_id", clientId)
                .order("created_at", { ascending: false });

            // Cargar mensajes enviados
            const messagesPromise = supabase
                .from("communication_logs")
                .select("*")
                .eq("client_id", clientId)
                .order("sent_at", { ascending: false });

            const [profileRes, appointmentsRes, haircutsRes, ordersRes, messagesRes] = await Promise.all([
                profilePromise,
                appointmentsPromise,
                haircutsPromise,
                ordersPromise,
                messagesPromise
            ]);

            if (profileRes.error) throw profileRes.error;

            setProfile(profileRes.data);
            setNotes(profileRes.data.notes || "");
            setAppointments(appointmentsRes.data || []);
            setHaircuts(haircutsRes.data || []);
            setOrders(ordersRes.data || []);
            setMessages(messagesRes.data || []);

        } catch (error) {
            console.error("Error loading client details:", error);
            toast.error("Error al cargar la información del cliente");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [clientId]);

    const handleSaveNotes = async () => {
        if (!profile) return;
        setIsSavingNotes(true);

        const { error } = await supabase
            .from("profiles")
            .update({ notes: notes.trim() ? notes : null })
            .eq("id", profile.id);

        setIsSavingNotes(false);

        if (error) {
            console.error("Error saving notes:", error);
            toast.error("No se pudieron guardar las notas");
        } else {
            toast.success("Notas guardadas correctamente");
            setProfile(prev => prev ? { ...prev, notes: notes.trim() ? notes : null } : null);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-muted/40 rounded animate-pulse" />
                    <div className="h-8 bg-muted/50 rounded w-1/4 animate-pulse" />
                </div>
                <div className="h-[200px] bg-muted/20 rounded animate-pulse" />
                <div className="h-[400px] bg-muted/10 rounded animate-pulse" />
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="text-center py-20">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-foreground">Cliente no encontrado</h1>
                <p className="text-muted-foreground mt-2">El cliente solicitado no existe o no tenés permisos para verlo.</p>
                <Button onClick={() => router.push("/admin/clientes")} className="mt-6">
                    Volver al listado
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header / Ficha superior */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center gap-4">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => router.push("/admin/clientes")}
                        className="border-border"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground tracking-tight">{profile.full_name}</h1>
                        <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
                            <span>Cliente registrado desde el {format(parseISO(profile.created_at), "dd/MM/yyyy")}</span>
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
                    {/* Tarjeta de Contacto */}
                    <Card className="bg-card/50 border-border/50">
                        <CardHeader>
                            <CardTitle className="text-lg">Información de Contacto</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/10">
                                        <Phone className="h-5 w-5" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-muted-foreground">Celular / Teléfono</span>
                                        <span className="text-foreground font-mono">{profile.phone || "No especificado"}</span>
                                    </div>
                                </div>
                                {profile.phone && features.mensajes_crm && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setIsWaOpen(true)}
                                        className="border-primary/20 hover:bg-primary/10 hover:text-primary gap-1.5"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        <span>Mensaje</span>
                                    </Button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-lg text-primary border border-primary/10">
                                    <CalendarIcon className="h-5 w-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground">Rol de Usuario</span>
                                    <span className="text-foreground capitalize">{profile.role}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Notas del Cliente */}
                    <Card className="bg-card/50 border-border/50">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-center">
                                <CardTitle className="text-lg">Notas Internas</CardTitle>
                                <Button
                                    onClick={handleSaveNotes}
                                    disabled={isSavingNotes || notes.trim() === (profile.notes || "")}
                                    size="sm"
                                    className="bg-primary hover:bg-primary/90 text-black font-semibold gap-1.5"
                                >
                                    {isSavingNotes ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Save className="h-3.5 w-3.5" />
                                    )}
                                    Guardar
                                </Button>
                            </div>
                            <CardDescription>
                                Notas sobre gustos, alergias, o preferencias exclusivas para el equipo de staff.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                placeholder="Escribí notas sobre este cliente... (ej. le gusta mate amargo, prefiere corte a tijera con navaja en patillas, etc.)"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="min-h-[100px] bg-background/50 border-input/50 focus:border-amber-500/50 resize-y"
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Tabs del Historial */}
            <Tabs defaultValue="citas" className="w-full">
                <TabsList className="bg-card/60 border border-border/40 w-full md:w-auto p-1 h-auto flex flex-wrap gap-1 md:inline-flex justify-start">
                    <TabsTrigger value="citas" className="gap-2 py-2">
                        <CalendarIcon className="h-4 w-4" />
                        Citas ({appointments.length})
                    </TabsTrigger>
                    <TabsTrigger value="cortes" className="gap-2 py-2">
                        <Scissors className="h-4 w-4" />
                        Historial de Cortes ({haircuts.length})
                    </TabsTrigger>
                    <TabsTrigger value="compras" className="gap-2 py-2">
                        <ShoppingBag className="h-4 w-4" />
                        Compras ({orders.length})
                    </TabsTrigger>
                    <TabsTrigger value="mensajes" className="gap-2 py-2">
                        <MessageSquare className="h-4 w-4" />
                        Mensajes ({messages.length})
                    </TabsTrigger>
                </TabsList>

                {/* Tab: Citas */}
                <TabsContent value="citas" className="mt-6">
                    <Card className="bg-card/50 border-border/50">
                        <CardContent className="p-0">
                            {appointments.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <CalendarIcon className="h-10 w-10 mx-auto mb-3 opacity-25" />
                                    <p className="font-semibold text-foreground/80">Sin citas agendadas</p>
                                    <p className="text-sm mt-1">Este cliente no registra turnos en el sistema.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/10 border-b border-border/30">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-6">Servicio</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Horario</TableHead>
                                            <TableHead>Barbero</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right pr-6">Precio</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {appointments.map((apt) => {
                                            const statusColors: Record<string, string> = {
                                                pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                                                confirmed: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                                completed: "bg-green-500/10 text-green-500 border-green-500/20",
                                                cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
                                                no_show: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
                                            };
                                            const statusLabels: Record<string, string> = {
                                                pending: "Pendiente",
                                                confirmed: "Confirmada",
                                                completed: "Completada",
                                                cancelled: "Cancelada",
                                                no_show: "No asistió",
                                            };

                                            return (
                                                <TableRow key={apt.id} className="border-b border-border/30">
                                                    <TableCell className="font-semibold text-foreground pl-6 py-4">
                                                        {apt.service?.name || "Servicio eliminado"}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 text-sm">
                                                        {format(parseISO(apt.appointment_date), "d 'de' MMMM, yyyy", { locale: es })}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 font-mono text-sm">
                                                        {apt.start_time.slice(0, 5)} - {apt.end_time.slice(0, 5)}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 text-sm">
                                                        {apt.barber?.name || "Sin asignar"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={statusColors[apt.status] || ""}>
                                                            {statusLabels[apt.status] || apt.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-primary font-bold pr-6">
                                                        {apt.service ? formatPrice(apt.service.price) : "—"}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab: Historial de Cortes */}
                <TabsContent value="cortes" className="mt-6">
                    {haircuts.length === 0 ? (
                        <Card className="bg-card/50 border-border/50">
                            <CardContent className="text-center py-16 text-muted-foreground">
                                <Scissors className="h-10 w-10 mx-auto mb-3 opacity-25" />
                                <p className="font-semibold text-foreground/80">Sin fotos en el historial</p>
                                <p className="text-sm mt-1">No hay fotos guardadas del historial de cortes de este cliente.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {haircuts.map((haircut) => (
                                <Card key={haircut.id} className="bg-card/50 border-border/50 overflow-hidden flex flex-col">
                                    {/* Grid de Fotos */}
                                    <div className="relative aspect-[4/3] w-full bg-muted">
                                        {haircut.photo_urls && haircut.photo_urls.length > 0 ? (
                                            <Image
                                                src={haircut.photo_urls[0]}
                                                alt={`Corte realizado por ${haircut.barber?.name || "Barbero"}`}
                                                fill
                                                unoptimized
                                                className="object-cover"
                                            />
                                        ) : (
                                            <div className="h-full w-full flex items-center justify-center">
                                                <Scissors className="h-12 w-12 text-muted-foreground/30" />
                                            </div>
                                        )}
                                        <div className="absolute top-3 left-3 bg-black/75 px-3 py-1 rounded-full border border-border text-[10px] text-zinc-300 font-semibold font-mono">
                                            {format(parseISO(haircut.created_at), "dd/MM/yyyy HH:mm")}
                                        </div>
                                    </div>
                                    <CardContent className="p-4 flex-grow space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <UserIcon className="h-3 w-3 text-primary" />
                                                Atendido por: <strong className="text-foreground">{haircut.barber?.name || "Barbero"}</strong>
                                            </span>
                                        </div>
                                        {haircut.notes && (
                                            <p className="text-sm text-zinc-300 border-l border-primary/30 pl-3 italic">
                                                &quot;{haircut.notes}&quot;
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* Tab: Compras */}
                <TabsContent value="compras" className="mt-6">
                    <Card className="bg-card/50 border-border/50">
                        <CardContent className="p-0">
                            {orders.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-25" />
                                    <p className="font-semibold text-foreground/80">Sin compras registradas</p>
                                    <p className="text-sm mt-1">El cliente no realizó compras de productos en la tienda.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/10 border-b border-border/30">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-6">Código de Orden</TableHead>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Productos</TableHead>
                                            <TableHead>Pago</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right pr-6">Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {orders.map((order) => {
                                            const statusLabels: Record<string, string> = {
                                                pending: "Pendiente",
                                                paid: "Pagada",
                                                shipped: "Enviada",
                                                delivered: "Entregada",
                                                cancelled: "Cancelada",
                                            };
                                            const statusColors: Record<string, string> = {
                                                pending: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                                                paid: "bg-green-500/10 text-green-500 border-green-500/20",
                                                shipped: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                                delivered: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                                                cancelled: "bg-red-500/10 text-red-500 border-red-500/20",
                                            };
                                            const paymentMethodLabels: Record<string, string> = {
                                                efectivo: "Efectivo",
                                                transferencia: "Transferencia",
                                                mercadopago: "MercadoPago"
                                            };

                                            return (
                                                <TableRow key={order.id} className="border-b border-border/30">
                                                    <TableCell className="font-mono text-xs font-semibold text-foreground pl-6 py-4">
                                                        {order.id.slice(0, 8).toUpperCase()}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 text-sm">
                                                        {format(parseISO(order.created_at), "dd/MM/yyyy HH:mm")}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 text-sm max-w-[200px]">
                                                        <div className="flex flex-col gap-1">
                                                            {order.items?.map((item) => (
                                                                <span key={item.id} className="text-xs line-clamp-1">
                                                                    {item.product?.name} <span className="text-muted-foreground">(x{item.quantity})</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 text-xs font-medium">
                                                        {order.payment_method ? (paymentMethodLabels[order.payment_method] || order.payment_method) : "—"}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className={statusColors[order.status] || ""}>
                                                            {statusLabels[order.status] || order.status}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right text-primary font-bold pr-6">
                                                        {formatPrice(order.total)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Tab: Mensajes */}
                <TabsContent value="mensajes" className="mt-6">
                    <Card className="bg-card/50 border-border/50">
                        <CardContent className="p-0">
                            {messages.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-25" />
                                    <p className="font-semibold text-foreground/80">Sin mensajes enviados</p>
                                    <p className="text-sm mt-1">No se registran logs de notificaciones enviadas a este cliente.</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/10 border-b border-border/30">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="pl-6 w-[20%]">Fecha y Hora</TableHead>
                                            <TableHead className="w-[15%]">Canal / Teléfono</TableHead>
                                            <TableHead className="w-[50%]">Mensaje Enviado</TableHead>
                                            <TableHead className="w-[15%] text-right pr-6">Estado</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {messages.map((msg) => {
                                            const statusColors: Record<string, string> = {
                                                sent: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                                                delivered: "bg-green-500/10 text-green-500 border-green-500/20",
                                                failed: "bg-red-500/10 text-red-500 border-red-500/20",
                                            };
                                            const statusLabels: Record<string, string> = {
                                                sent: "Enviado",
                                                delivered: "Entregado",
                                                failed: "Fallo",
                                            };

                                            return (
                                                <TableRow key={msg.id} className="border-b border-border/30">
                                                    <TableCell className="text-zinc-300 text-sm pl-6 py-4">
                                                        {format(parseISO(msg.sent_at), "dd/MM/yyyy HH:mm")}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 text-sm font-mono">
                                                        {msg.client_phone || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-zinc-300 text-xs max-w-md break-words leading-normal">
                                                        {msg.message_sent}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        <Badge variant="outline" className={statusColors[msg.status] || ""}>
                                                            {statusLabels[msg.status] || msg.status}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <SendWhatsappDialog
                clientId={profile.id}
                clientName={profile.full_name || "Cliente"}
                clientPhone={profile.phone}
                isOpen={isWaOpen}
                onOpenChange={setIsWaOpen}
                onLogAdded={loadData}
            />
        </div>
    );
}
