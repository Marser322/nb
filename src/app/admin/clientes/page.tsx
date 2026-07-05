"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Search, User, Calendar, DollarSign, Contact, ArrowLeft, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import { INACTIVE_DAYS } from "@/lib/constants";
import type { ClientOverview } from "@/types/database.types";
import { format, parseISO, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { SendWhatsappDialog } from "@/components/admin/send-whatsapp-dialog";

function ClientesList() {
    const [clients, setClients] = useState<ClientOverview[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const searchParams = useSearchParams();
    const router = useRouter();
    const supabase = createClient();

    const [selectedClient, setSelectedClient] = useState<{
        id: string;
        full_name: string | null;
        phone: string | null;
    } | null>(null);
    const [isWaOpen, setIsWaOpen] = useState(false);

    const filterParam = searchParams.get("filtro");

    const loadClients = async () => {
        setIsLoading(true);
        const { data, error } = await supabase.rpc("get_clients_overview");
        if (error) {
            console.error("Error loading clients:", error);
            toast.error("Error al cargar la lista de clientes");
        } else if (data) {
            setClients(data);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadClients();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const isInactive = (lastVisitStr: string | null) => {
        if (!lastVisitStr) return true;
        const lastVisitDate = parseISO(lastVisitStr);
        const diff = differenceInDays(new Date(), lastVisitDate);
        return diff > INACTIVE_DAYS;
    };

    const formatLastVisit = (lastVisitStr: string | null) => {
        if (!lastVisitStr) return "Nunca";
        const date = parseISO(lastVisitStr);
        return format(date, "d 'de' MMMM, yyyy", { locale: es });
    };

    const filteredClients = clients.filter((client) => {
        // Filtro por inactivos
        if (filterParam === "inactivos" && !isInactive(client.last_visit)) {
            return false;
        }

        // Búsqueda en memoria
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;

        const nameMatches = client.full_name?.toLowerCase().includes(query) ?? false;
        const phoneMatches = client.phone?.includes(query) ?? false;
        return nameMatches || phoneMatches;
    });

    const handleOpenWa = (e: React.MouseEvent, client: ClientOverview) => {
        e.stopPropagation();
        setSelectedClient({
            id: client.id,
            full_name: client.full_name,
            phone: client.phone,
        });
        setIsWaOpen(true);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Contact className="h-8 w-8 text-primary" />
                        Gestión de Clientes
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {filterParam === "inactivos"
                            ? "Listado de clientes inactivos (más de 30 días sin visitas)"
                            : "Maestro general de clientes registrados"}
                    </p>
                </div>
                {filterParam === "inactivos" && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push("/admin/clientes")}
                        className="self-start md:self-auto border-white/10"
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Ver Todos
                    </Button>
                )}
            </div>

            {/* Controles de Búsqueda */}
            <div className="flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nombre o teléfono..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-background/50 border-input/50 focus:border-amber-500/50"
                    />
                </div>
            </div>

            {/* Lista/Tabla */}
            <Card className="bg-card/50 border-border/50 overflow-hidden">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-8 space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex items-center gap-4 animate-pulse">
                                    <div className="w-10 h-10 rounded-full bg-muted/40" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-muted/50 rounded w-1/4" />
                                        <div className="h-3 bg-muted/30 rounded w-1/3" />
                                    </div>
                                    <div className="w-20 h-4 bg-muted/40 rounded" />
                                </div>
                            ))}
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground/20" />
                            <p className="font-semibold text-lg text-white/80">No se encontraron clientes</p>
                            <p className="text-sm mt-1">Intentá ajustando el término de búsqueda</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/10 border-b border-border/30">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[28%]">Cliente</TableHead>
                                        <TableHead className="w-[18%]">Teléfono</TableHead>
                                        <TableHead className="w-[22%]">Última Visita</TableHead>
                                        <TableHead className="w-[10%] text-center">Citas</TableHead>
                                        <TableHead className="w-[12%] text-right">Total Gastado</TableHead>
                                        <TableHead className="w-[10%] text-right pr-6">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredClients.map((client) => {
                                        const inactive = isInactive(client.last_visit);
                                        return (
                                            <TableRow
                                                key={client.id}
                                                onClick={() => router.push(`/admin/clientes/${client.id}`)}
                                                className="cursor-pointer hover:bg-muted/10 transition-colors border-b border-border/30"
                                            >
                                                <TableCell className="font-medium py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                                                            {client.full_name ? client.full_name.charAt(0).toUpperCase() : "?"}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-white font-semibold flex items-center gap-2">
                                                                {client.full_name || "Sin nombre"}
                                                                {inactive && (
                                                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] font-normal px-2 py-0">
                                                                        Inactivo
                                                                    </Badge>
                                                                )}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground">
                                                                Registrado: {format(parseISO(client.created_at), "dd/MM/yyyy")}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-zinc-300 font-mono text-sm">
                                                    {client.phone || "—"}
                                                </TableCell>
                                                <TableCell className="text-zinc-300 text-sm">
                                                    {formatLastVisit(client.last_visit)}
                                                </TableCell>
                                                <TableCell className="text-center font-semibold text-white">
                                                    {client.total_appointments}
                                                </TableCell>
                                                <TableCell className="text-right text-primary font-bold">
                                                    {formatPrice(Number(client.total_spent))}
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        onClick={(e) => handleOpenWa(e, client)}
                                                        className="text-primary hover:text-primary hover:bg-primary/10"
                                                        title="Enviar WhatsApp"
                                                    >
                                                        <MessageCircle className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {selectedClient && (
                <SendWhatsappDialog
                    clientId={selectedClient.id}
                    clientName={selectedClient.full_name || "Cliente"}
                    clientPhone={selectedClient.phone}
                    isOpen={isWaOpen}
                    onOpenChange={setIsWaOpen}
                    onLogAdded={loadClients}
                />
            )}
        </div>
    );
}

export default function AdminClientesPage() {
    return (
        <Suspense fallback={
            <div className="space-y-6">
                <div className="h-10 bg-muted/40 rounded w-1/4 animate-pulse" />
                <div className="h-12 bg-muted/30 rounded w-1/3 animate-pulse" />
                <div className="h-64 bg-muted/20 rounded animate-pulse" />
            </div>
        }>
            <ClientesList />
        </Suspense>
    );
}
