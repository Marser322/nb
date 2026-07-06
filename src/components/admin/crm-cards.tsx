"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Scissors, Trophy, UserRoundX } from "lucide-react";
import { differenceInDays, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SendWhatsappDialog } from "@/components/admin/send-whatsapp-dialog";
import { formatPrice } from "@/lib/utils";
import type { ClientOverview } from "@/types/database.types";
import { useFeatures } from "@/lib/features";

export interface RankingItem {
    name: string;
    count: number;
    revenue: number;
}

interface CrmCardsProps {
    inactiveClients: ClientOverview[];
    topServices: RankingItem[];
    topBarbers: RankingItem[];
    isLoading: boolean;
    onLogAdded: () => void;
}

export function CrmCards({
    inactiveClients,
    topServices,
    topBarbers,
    isLoading,
    onLogAdded,
}: CrmCardsProps) {
    const { features } = useFeatures();
    const [selectedClient, setSelectedClient] = useState<ClientOverview | null>(null);
    const [isWaOpen, setIsWaOpen] = useState(false);

    const openWhatsapp = (client: ClientOverview) => {
        setSelectedClient(client);
        setIsWaOpen(true);
    };

    return (
        <>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <Card className="border-border/50 bg-card/50">
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <UserRoundX className="h-5 w-5 text-primary" />
                                Reactivar clientes
                            </CardTitle>
                            <CardDescription>
                                Clientes enfriándose, listos para recuperar con un mensaje.
                            </CardDescription>
                        </div>
                        <Button asChild variant="outline" size="sm" className="shrink-0 border-border">
                            <Link href="/admin/clientes?filtro=inactivos">Ver todos</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-3">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
                                ))}
                            </div>
                        ) : inactiveClients.length === 0 ? (
                            <div className="py-10 text-center text-muted-foreground">
                                <UserRoundX className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                                <p>No hay clientes inactivos para reactivar.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {inactiveClients.map((client) => (
                                    <div
                                        key={client.id}
                                        className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 p-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-foreground">
                                                {client.full_name || "Cliente sin nombre"}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatLastVisitGap(client.last_visit)} · {formatPrice(Number(client.total_spent))}
                                            </p>
                                        </div>
                                        {features.mensajes_crm && (
                                            <Button
                                                size="icon-sm"
                                                variant="ghost"
                                                onClick={() => openWhatsapp(client)}
                                                className="text-primary hover:bg-primary/10 hover:text-primary"
                                                title="Enviar WhatsApp"
                                            >
                                                <MessageCircle className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <RankingCard
                    title="Top servicios"
                    description="Más vendidos en los últimos 90 días."
                    icon={Scissors}
                    items={topServices}
                    isLoading={isLoading}
                    emptyText="Todavía no hay servicios completados en este período."
                />

                <RankingCard
                    title="Top barberos"
                    description="Rendimiento por citas completadas en 90 días."
                    icon={Trophy}
                    items={topBarbers}
                    isLoading={isLoading}
                    emptyText="Todavía no hay barberos con citas completadas."
                />
            </div>

            {selectedClient && (
                <SendWhatsappDialog
                    clientId={selectedClient.id}
                    clientName={selectedClient.full_name || "Cliente"}
                    clientPhone={selectedClient.phone}
                    isOpen={isWaOpen}
                    onOpenChange={setIsWaOpen}
                    onLogAdded={onLogAdded}
                />
            )}
        </>
    );
}

function RankingCard({
    title,
    description,
    icon: Icon,
    items,
    isLoading,
    emptyText,
}: {
    title: string;
    description: string;
    icon: typeof Scissors;
    items: RankingItem[];
    isLoading: boolean;
    emptyText: string;
}) {
    const maxRevenue = Math.max(...items.map((item) => item.revenue), 0);

    return (
        <Card className="border-border/50 bg-card/50">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className="space-y-2">
                                <div className="h-4 w-2/3 rounded bg-muted/40 animate-pulse" />
                                <div className="h-2 rounded-full bg-muted/30 animate-pulse" />
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground">
                        <Icon className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
                        <p>{emptyText}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {items.map((item, index) => {
                            const width = maxRevenue > 0 ? Math.max((item.revenue / maxRevenue) * 100, 8) : 0;

                            return (
                                <div key={item.name} className="space-y-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-foreground">
                                                {index + 1}. {item.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {item.count} {item.count === 1 ? "cita" : "citas"}
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-sm font-semibold text-primary">
                                            {formatPrice(item.revenue)}
                                        </p>
                                    </div>
                                    <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                                        <div
                                            className="h-full rounded-full bg-primary"
                                            style={{ width: `${width}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function formatLastVisitGap(lastVisit: string | null) {
    if (!lastVisit) return "Nunca vino";

    const days = differenceInDays(new Date(), parseISO(lastVisit));
    if (days <= 0) return "Vino hoy";
    if (days === 1) return "Hace 1 día";
    return `Hace ${days} días`;
}
