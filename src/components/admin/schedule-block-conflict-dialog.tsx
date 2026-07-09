"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, User, Scissors } from "lucide-react";
import type { ScheduleBlockConflict } from "@/lib/booking";

interface ScheduleBlockConflictDialogProps {
    conflicts: ScheduleBlockConflict[] | null;
    isSubmitting: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Diálogo de advertencia cuando un bloqueo de agenda (barbero o sucursal) choca
 * con citas activas ya agendadas. El admin decide crear el bloqueo igual (las
 * citas no se tocan) o cancelar, en vez de que las citas queden huérfanas
 * sin aviso a nadie.
 */
export function ScheduleBlockConflictDialog({
    conflicts,
    isSubmitting,
    onConfirm,
    onCancel,
}: ScheduleBlockConflictDialogProps) {
    const isOpen = !!conflicts && conflicts.length > 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="max-w-lg bg-card/95 border-border/60 backdrop-blur-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-foreground">
                        <AlertTriangle className="h-5 w-5 admin-warning-icon" />
                        Este bloqueo choca con citas agendadas
                    </DialogTitle>
                    <DialogDescription>
                        Estas citas quedan agendadas dentro del bloqueo — resolvelas desde Citas
                        (reprogramar o cancelar y avisar por WhatsApp).
                    </DialogDescription>
                </DialogHeader>

                <div className="admin-warning-surface max-h-[260px] space-y-2 overflow-y-auto rounded-lg border p-3">
                    {conflicts?.map((conflict) => (
                        <div
                            key={conflict.id}
                            className="flex items-center justify-between gap-3 rounded-md bg-background/40 px-3 py-2 text-xs"
                        >
                            <div className="space-y-1">
                                <div className="flex items-center gap-1 font-semibold text-foreground">
                                    <User className="h-3.5 w-3.5" />
                                    {conflict.clientName}
                                </div>
                                <div className="flex items-center gap-1 text-muted-foreground">
                                    <Scissors className="h-3.5 w-3.5" />
                                    {conflict.barberName}
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="font-mono font-semibold text-foreground">
                                    {format(new Date(`${conflict.appointment_date}T12:00:00`), "d MMM", { locale: es })}
                                </p>
                                <p className="text-muted-foreground">{conflict.start_time.slice(0, 5)}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <DialogFooter className="pt-2">
                    <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                    <Button type="button" variant="destructive" onClick={onConfirm} disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Crear bloqueo igual
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
