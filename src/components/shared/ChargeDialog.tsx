"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { Appointment, Service, Profile } from "@/types/database.types";
import { useFeatures } from "@/lib/features";

type AppointmentWithRelations = Appointment & {
    service?: Service;
    client?: Profile;
};

interface ChargeDialogProps {
    appointment: AppointmentWithRelations;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export default function ChargeDialog({
    appointment,
    isOpen,
    onOpenChange,
    onSuccess,
}: ChargeDialogProps) {
    const { features } = useFeatures();
    const supabase = createClient();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [finalAmount, setFinalAmount] = useState<string>(
        appointment?.service?.price ? String(appointment.service.price) : ""
    );
    const [paymentMethod, setPaymentMethod] = useState<string>("cash");
    const [tipAmount, setTipAmount] = useState<string>("0");

    const handleConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const amount = parseFloat(finalAmount);
        const tip = parseFloat(tipAmount);

        if (isNaN(amount) || amount < 0) {
            toast.error("Ingresá un monto final válido");
            return;
        }

        if (isNaN(tip) || tip < 0) {
            toast.error("Ingresá una propina válida");
            return;
        }

        setIsSubmitting(true);

        try {
            const { error } = await supabase.rpc("complete_appointment_with_payment", {
                p_appointment_id: appointment.id,
                p_final_amount: amount,
                p_payment_method: paymentMethod,
                p_tip_amount: features.propinas ? tip : 0,
            });

            if (error) {
                if (error.message.includes("YA_COBRADA")) {
                    toast.error("Esta cita ya fue cobrada previamente.");
                } else if (error.message.includes("ESTADO_INVALIDO")) {
                    toast.error("La cita no está en un estado válido para ser completada.");
                } else if (error.message.includes("NO_AUTORIZADO")) {
                    toast.error("No tenés autorización para cobrar esta cita.");
                } else {
                    toast.error("Error al cobrar cita: " + error.message);
                }
            } else {
                toast.success("¡Cita completada y cobrada con éxito!");
                onOpenChange(false);
                onSuccess();
            }
        } catch (err: unknown) {
            toast.error("Ocurrió un error inesperado al procesar el cobro.");
            console.error(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Cobrar y Completar Cita</DialogTitle>
                    <DialogDescription>
                        Registrá el cobro del servicio para{" "}
                        <span className="font-semibold text-foreground">
                            {appointment.client?.full_name || "Cliente sin nombre"}
                        </span>
                        .
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleConfirm} className="space-y-4 py-2">
                    <div>
                        <label className="text-sm font-medium mb-1.5 block">
                            Servicio contratado
                        </label>
                        <div className="p-3 bg-muted rounded-lg border border-border text-sm">
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-foreground">
                                    {appointment.service?.name || "Servicio"}
                                </span>
                                <span className="text-primary font-bold">
                                    {appointment.service?.price
                                        ? formatPrice(appointment.service.price)
                                        : "—"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-1.5 block">
                            Monto cobrado (UYU)
                        </label>
                        <Input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Monto final"
                            value={finalAmount}
                            onChange={(e) => setFinalAmount(e.target.value)}
                            required
                            className="bg-background border-border text-foreground focus-visible:ring-primary"
                        />
                    </div>

                    <div className={features.propinas ? "grid grid-cols-2 gap-4" : "grid grid-cols-1"}>
                        <div>
                            <label className="text-sm font-medium mb-1.5 block">
                                Método de pago
                            </label>
                            <Select
                                value={paymentMethod}
                                onValueChange={setPaymentMethod}
                            >
                                <SelectTrigger className="bg-background border-border text-foreground focus:ring-primary">
                                    <SelectValue placeholder="Elegí método" />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(PAYMENT_METHOD_LABELS).map(
                                        ([key, label]) => (
                                            <SelectItem key={key} value={key}>
                                                {label}
                                            </SelectItem>
                                        )
                                    )}
                                </SelectContent>
                            </Select>
                        </div>

                        {features.propinas && (
                            <div>
                                <label className="text-sm font-medium mb-1.5 block">
                                    Propina (UYU)
                                </label>
                                <Input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0"
                                    value={tipAmount}
                                    onChange={(e) => setTipAmount(e.target.value)}
                                    className="bg-background border-border text-foreground focus-visible:ring-primary"
                                />
                                <span className="text-[10px] text-muted-foreground mt-1 block">
                                    * 100 % para el barbero
                                </span>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-4 gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={isSubmitting}
                            className="border-border text-foreground hover:bg-accent"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Procesando...
                                </>
                            ) : (
                                "Confirmar y Completar"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
