"use client";

import { useState, useEffect, Suspense, useMemo, useCallback } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Search, Contact, ArrowLeft, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/lib/utils";
import { INACTIVE_DAYS } from "@/lib/constants";
import { fetchClientsOverviewPage, isInactiveClient } from "@/lib/crm";
import type { ClientOverview } from "@/types/database.types";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { SendWhatsappDialog } from "@/components/admin/send-whatsapp-dialog";
import { useFeatures } from "@/lib/features";
import { IllustratedEmptyState } from "@/components/shared/IllustratedEmptyState";

const CLIENTS_PAGE_SIZE = 20;

function ClientesList() {
    const { features } = useFeatures();
    const [clients, setClients] = useState<ClientOverview[]>([]);
    const [totalClients, setTotalClients] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const searchParams = useSearchParams();
    const filterParam = searchParams.get("filtro");
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);
    const inactiveOnly = filterParam === "inactivos";

    useEffect(() => {
        setCurrentPage(1);
    }, [filterParam]);



    const [selectedClient, setSelectedClient] = useState<{
        id: string;
        full_name: string | null;
        phone: string | null;
    } | null>(null);
    const [isWaOpen, setIsWaOpen] = useState(false);

    const loadClients = useCallback(async () => {
        setIsLoading(true);
        try {
            const { clients: pageClients, total } = await fetchClientsOverviewPage(supabase, {
                search: searchQuery,
                inactiveOnly,
                inactiveDays: INACTIVE_DAYS,
                limit: CLIENTS_PAGE_SIZE,
                offset: (currentPage - 1) * CLIENTS_PAGE_SIZE,
            });

            setClients(pageClients);
            setTotalClients(total);
        } catch (error) {
            console.error("Error loading clients:", error);
            toast.error("Error al cargar la lista de clientes");
            setClients([]);
            setTotalClients(0);
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, inactiveOnly, searchQuery, supabase]);

    useEffect(() => {
        loadClients();
    }, [loadClients]);

    const formatLastVisit = (lastVisitStr: string | null) => {
        if (!lastVisitStr) return "Nunca";
        const date = parseISO(lastVisitStr);
        return format(date, "d 'de' MMMM, yyyy", { locale: es });
    };

    const totalPages = Math.max(1, Math.ceil(totalClients / CLIENTS_PAGE_SIZE));
    const firstVisibleClient = totalClients === 0 ? 0 : (currentPage - 1) * CLIENTS_PAGE_SIZE + 1;
    const lastVisibleClient = Math.min(totalClients, currentPage * CLIENTS_PAGE_SIZE);

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
                    <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
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
                        className="self-start md:self-auto border-border"
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
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setCurrentPage(1);
                        }}
                        className="pl-10 bg-background/50 border-input/50 focus:border-primary/50 text-base md:text-sm"
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
                    ) : clients.length === 0 ? (
                        <IllustratedEmptyState
                            icon={Contact}
                            imageSrc="/images/empty/no-clientes.webp"
                            imageAlt="Ficha premium de clientes New Brothers sin registros visibles"
                            title={searchQuery ? "No se encontraron clientes" : "Tu cartera de clientes empieza acá"}
                            description={searchQuery ? "Ajustá el término de búsqueda para volver a encontrar el perfil correcto." : "Los clientes aparecerán acá cuando se registren o completen su primera reserva."}
                            action={
                                searchQuery ? (
                                    <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                                        Limpiar búsqueda
                                    </Button>
                                ) : null
                            }
                        />
                    ) : (
                        <>
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
                                        {clients.map((client) => {
                                            const inactive = isInactiveClient(client.last_visit);
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
                                                                <span className="text-foreground font-semibold flex items-center gap-2">
                                                                    {client.full_name || "Sin nombre"}
                                                                    {inactive && (
                                                                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-normal px-2 py-0">
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
                                                    <TableCell className="text-muted-foreground font-mono text-sm">
                                                        {client.phone || "—"}
                                                    </TableCell>
                                                    <TableCell className="text-muted-foreground text-sm">
                                                        {formatLastVisit(client.last_visit)}
                                                    </TableCell>
                                                    <TableCell className="text-center font-semibold text-foreground">
                                                        {client.total_appointments}
                                                    </TableCell>
                                                    <TableCell className="text-right text-primary font-bold">
                                                        {formatPrice(Number(client.total_spent))}
                                                    </TableCell>
                                                    <TableCell className="text-right pr-6">
                                                        {features.mensajes_crm && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                onClick={(e) => handleOpenWa(e, client)}
                                                                aria-label={`Enviar WhatsApp a ${client.full_name || "cliente"}`}
                                                                className="text-primary hover:text-primary hover:bg-primary/10"
                                                                title="Enviar WhatsApp"
                                                            >
                                                                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                            {totalClients > CLIENTS_PAGE_SIZE && (
                                <div className="flex items-center justify-between px-6 py-4 border-t border-border/30 bg-muted/5">
                                    <div className="text-xs text-muted-foreground">
                                        Mostrando <span className="font-semibold text-foreground">{firstVisibleClient}-{lastVisibleClient}</span> de{" "}
                                        <span className="font-semibold text-foreground">{totalClients}</span> clientes
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                            disabled={currentPage === 1}
                                            className="h-11 md:h-8 border-border/50 hover:bg-muted text-sm md:text-xs"
                                        >
                                            Anterior
                                        </Button>
                                        <span className="text-xs text-muted-foreground px-2">
                                            Página {currentPage} de {totalPages}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                            disabled={currentPage === totalPages}
                                            className="h-11 md:h-8 border-border/50 hover:bg-muted text-sm md:text-xs"
                                        >
                                            Siguiente
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </>
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
